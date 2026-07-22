// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Study areas — what the country studies, and what each university is FOR.
//
// The treemap answers the national question; the matrix answers the individual
// one. A comprehensive university spreads evenly across the row; a specialist
// concentrates in one or two cells, which is exactly the thing a prospective
// student wants to know and which a total-enrolment ranking hides completely.
import type { Ctx } from '../ctx';
import { squarify } from '../utils/squarify';
import { svgEl, chartSvg } from '../utils/svg';
import { formatNumber, formatPercent, tipText, tipAttr, escapeHtml } from '../format';
import { glossaryTerm } from '../glossary';
import { fieldColour } from '../data';

export function renderFields(root: HTMLElement, ctx: Ctx): void {
  const { national, institutions } = ctx.data;
  const fields = national.fields.filter((f) => f.value > 0);
  const total = fields.reduce((a, f) => a + f.value, 0);

  root.innerHTML = `
    <div class="view-head">
      <h1>What Australia studies</h1>
      <p>Every enrolment grouped by ${glossaryTerm(
        'field-of-education',
        'broad field of education'
      )}. The treemap sizes the whole country; the heatmap underneath shows what each university actually concentrates on, which is a different question from how big it is.</p>
    </div>

    <div class="card">
      <div class="chart-head">
        <h2>National enrolments by field</h2>
        <p>Area is proportional to enrolments across all levels of course. Click a field to rank universities by how much of it they teach.</p>
      </div>
      <div id="fd-treemap"></div>
      <div class="legend" id="fd-legend"></div>
    </div>

    <div class="card" style="margin-top:var(--space-lg)">
      <div class="chart-head">
        <h2>What each university is for</h2>
        <p>Each row is one university, read across as the share of ITS students in each field — not its share of the national total. A row with one dark cell is a specialist; an even row is a comprehensive university.</p>
      </div>
      <div class="table-scroll" id="fd-matrix"></div>
    </div>`;

  // ── Treemap ──
  const width = 940;
  const height = 470;
  const rects = squarify(
    fields.map((f) => f.value),
    width,
    height
  );
  const svg = chartSvg(width, height, 'National higher education enrolments by broad field of education');
  rects.forEach((r, i) => {
    const field = fields[i];
    if (!field || r.w <= 0 || r.h <= 0) return;
    const share = (field.value / total) * 100;
    const g = svgEl('g', {});
    const rect = svgEl('rect', {
      x: r.x,
      y: r.y,
      width: Math.max(r.w - 1.5, 0.5),
      height: Math.max(r.h - 1.5, 0.5),
      fill: fieldColour(field.name),
      rx: 3,
      class: 'mark',
      'aria-label': `${field.name}: ${formatNumber(field.value)} students`,
      'data-tip': tipText(
        `${field.name}\n${formatNumber(field.value)} enrolments\n${formatPercent(share)} of all study\n\nClick to rank universities by this field`
      ),
    });
    rect.addEventListener('click', () => ctx.setParam('f', field.name));
    g.append(rect);

    if (r.w > 96 && r.h > 40) {
      const name = svgEl('text', {
        x: r.x + 10,
        y: r.y + 22,
        fill: '#fff',
        'font-size': r.w > 200 ? 14 : 11,
        'font-weight': 650,
        'pointer-events': 'none',
      });
      name.textContent = truncate(field.name, Math.floor(r.w / (r.w > 200 ? 8 : 6.4)));
      const value = svgEl('text', {
        x: r.x + 10,
        y: r.y + 40,
        fill: 'rgba(255,255,255,0.85)',
        'font-size': 11,
        'pointer-events': 'none',
      });
      value.textContent = `${formatNumber(field.value)} · ${formatPercent(share, 0)}`;
      g.append(name, value);
    }
    svg.append(g);
  });
  root.querySelector('#fd-treemap')!.append(svg);

  root.querySelector<HTMLElement>('#fd-legend')!.innerHTML = fields
    .map(
      (f) =>
        `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:${fieldColour(
          f.name
        )}"></span>${escapeHtml(f.name)} ${formatPercent((f.value / total) * 100, 0)}</span>`
    )
    .join('');

  // ── Matrix ──
  const fieldNames = fields.map((f) => f.name);
  const selected = ctx.param('f');
  const rows = [...institutions]
    .filter((i) => i.fields)
    .sort((a, b) => {
      if (selected) {
        const av = shareOf(a.fields!, selected, a.students);
        const bv = shareOf(b.fields!, selected, b.students);
        return (bv ?? -1) - (av ?? -1);
      }
      return (b.students ?? 0) - (a.students ?? 0);
    });

  const body = rows
    .map((inst) => {
      const cells = fieldNames
        .map((name) => {
          const share = shareOf(inst.fields!, name, inst.students);
          if (share === null) {
            return `<td class="right muted-cell" data-tip="${tipAttr(
              `${inst.name}\n${name}\nNot published — withheld because the number is too small to publish.`
            )}">np</td>`;
          }
          const alpha = Math.min(1, share / 45);
          return `<td class="right num" style="background:rgba(30,58,95,${(alpha * 0.9).toFixed(3)});color:${
            alpha > 0.55 ? '#fff' : 'var(--text-primary)'
          }" data-tip="${tipAttr(
            `${inst.name}\n${name}\n${formatPercent(share)} of this university's students\n${formatNumber(
              inst.fields![name] ?? null
            )} enrolments`
          )}">${share >= 0.5 ? Math.round(share) : '·'}</td>`;
        })
        .join('');
      return `<tr class="clickable" data-key="${escapeHtml(inst.key)}"><td class="name-cell">${escapeHtml(
        inst.name
      )}</td>${cells}</tr>`;
    })
    .join('');

  root.querySelector<HTMLElement>('#fd-matrix')!.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>University${selected ? ` — sorted by ${escapeHtml(selected)}` : ''}</th>
          ${fieldNames
            .map(
              (n) =>
                `<th class="right" data-tip="${tipAttr(n)}" style="cursor:help">${escapeHtml(
                  abbreviateField(n)
                )}</th>`
            )
            .join('')}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;

  root.querySelectorAll<HTMLElement>('#fd-matrix tr.clickable').forEach((tr) => {
    tr.addEventListener('click', () => {
      const inst = institutions.find((i) => i.key === tr.dataset.key);
      if (inst) ctx.openInstitution(inst);
    });
  });
}

function shareOf(fields: Record<string, number | null>, name: string, total: number | null): number | null {
  const v = fields[name];
  if (v === null || v === undefined || !total) return null;
  return (v / total) * 100;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

function abbreviateField(name: string): string {
  return (
    {
      'Natural and Physical Sciences': 'Sciences',
      'Information Technology': 'IT',
      'Engineering and Related Technologies': 'Engineering',
      'Architecture and Building': 'Architecture',
      'Agriculture, Environmental and Related Studies': 'Agriculture',
      'Management and Commerce': 'Business',
      'Society and Culture': 'Society',
      'Creative Arts': 'Arts',
      'Food, Hospitality and Personal Services': 'Hospitality',
      'Mixed Field Programmes': 'Mixed',
      'Non-award courses': 'Non-award',
    }[name] ?? name
  );
}
