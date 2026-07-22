// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// "Who finishes" — the signature view.
//
// Section 17 follows real starting cohorts for up to nine years and splits
// them four ways. Almost every published account of this data quotes the
// four-year completed figure alone and concludes that most students fail to
// finish. They do not: at four years a third of the cohort is STILL ENROLLED,
// because a great many degrees run longer than four years and part-time
// students longer again.
//
// So the timeframe toggle is not a filter, it is the teaching device. Moving
// four -> six -> nine years visibly drains the grey "still enrolled" band into
// the teal "completed" band, and the user learns the caveat by operating the
// control rather than by reading a footnote.
import type { Ctx } from '../ctx';
import { outcomeGroups, outcomeAt } from '../analysis';
import { formatPercent, tipText, escapeHtml } from '../format';
import { glossaryTerm } from '../glossary';
import { svgEl, chartSvg } from '../utils/svg';
import type { OutcomeGroup, OutcomePoint } from '../data';

const BANDS = [
  { key: 'completed', label: 'Completed', colour: 'var(--outcome-completed)', term: 'completion' },
  { key: 'stillEnrolled', label: 'Still enrolled', colour: 'var(--outcome-still)', term: 'still-enrolled' },
  { key: 'droppedOut', label: 'Re-enrolled, then left', colour: 'var(--outcome-dropped)', term: '' },
  { key: 'neverReturned', label: 'Never came back after first year', colour: 'var(--outcome-never)', term: '' },
] as const;

const DURATION_LABEL: Record<string, string> = {
  'Four Years': '4 years',
  'Six Years': '6 years',
  'Nine Years': '9 years',
};

function bandValue(point: OutcomePoint, key: string): number {
  const v = (point as unknown as Record<string, number | null>)[key];
  return v === null || v === undefined || !Number.isFinite(v) ? 0 : v;
}

/** One horizontal 100% stacked bar per category. */
function stackedChart(group: OutcomeGroup, duration: string, onPick: (category: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart-scroll';

  const categories = group.categories
    .map((c) => ({ category: c.category, point: outcomeAt(group, c.category, duration) }))
    .filter((c): c is { category: string; point: OutcomePoint } => c.point !== null);

  if (!categories.length) {
    wrap.innerHTML = '<p class="state-msg">No published cohort data for this combination.</p>';
    return wrap;
  }

  const rowH = 34;
  const gap = 9;
  const labelW = 220;
  const width = 940;
  const height = categories.length * (rowH + gap) + 34;
  const barW = width - labelW - 70;

  const svg = chartSvg(width, height, `${group.label}: cohort outcomes after ${DURATION_LABEL[duration] ?? duration}`);

  categories.forEach((c, i) => {
    const y = i * (rowH + gap);
    const total = BANDS.reduce((a, b) => a + bandValue(c.point, b.key), 0) || 100;

    const label = svgEl('text', {
      x: labelW - 10,
      y: y + rowH / 2 + 4,
      'text-anchor': 'end',
      class: 'axis-title',
    });
    label.textContent = c.category.length > 34 ? `${c.category.slice(0, 33)}…` : c.category;
    svg.append(label);

    let x = labelW;
    for (const band of BANDS) {
      const value = bandValue(c.point, band.key);
      const w = (value / total) * barW;
      if (w <= 0) continue;
      const rect = svgEl('rect', {
        x,
        y,
        width: Math.max(w, 0.6),
        height: rowH,
        fill: band.colour,
        class: 'mark',
        'data-band': band.key,
        'data-category': c.category,
        'aria-label': `${c.category}: ${band.label} ${value.toFixed(1)}%`,
        'data-tip': tipText(
          `${c.category}\nCohort ${c.point.cohort}, measured over ${DURATION_LABEL[duration] ?? duration}\n\n${band.label}: ${formatPercent(value)}` +
            (band.key === 'stillEnrolled'
              ? '\n\nStill studying — not a drop-out. Many degrees run longer than four years.'
              : '')
        ),
      });
      rect.addEventListener('click', () => onPick(c.category));
      svg.append(rect);

      if (w > 44) {
        const t = svgEl('text', {
          x: x + w / 2,
          y: y + rowH / 2 + 4,
          'text-anchor': 'middle',
          fill: band.key === 'stillEnrolled' ? '#14263c' : '#fff',
          'font-size': 11,
          'font-weight': 600,
          'pointer-events': 'none',
        });
        t.textContent = `${Math.round(value)}%`;
        svg.append(t);
      }
      x += w;
    }

    const completed = svgEl('text', {
      x: width - 60,
      y: y + rowH / 2 + 4,
      class: 'axis-text',
      'font-weight': 700,
      fill: 'var(--outcome-completed)',
    });
    completed.textContent = formatPercent(bandValue(c.point, 'completed'));
    svg.append(completed);
  });

  const foot = svgEl('text', { x: labelW, y: height - 6, class: 'axis-text' });
  foot.textContent = `Cohort ${categories[0].point.cohort} · each bar is 100% of the students who started`;
  svg.append(foot);

  wrap.append(svg);
  return wrap;
}

/** Small multiples across ATAR bands — the gradient at a glance. */
function atarStrip(group: OutcomeGroup, duration: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart-scroll';

  const bands = group.categories
    .filter((c) => /^\d/.test(c.category))
    .map((c) => ({ category: c.category, point: outcomeAt(group, c.category, duration) }))
    .filter((c): c is { category: string; point: OutcomePoint } => c.point !== null);
  if (!bands.length) return wrap;

  const colW = 92;
  const chartH = 210;
  const width = Math.max(640, bands.length * colW);
  const height = chartH + 54;
  const svg = chartSvg(width, height, `Completion by ATAR band after ${DURATION_LABEL[duration] ?? duration}`);

  bands.forEach((b, i) => {
    const x = i * colW + 14;
    const w = colW - 28;
    const total = BANDS.reduce((a, band) => a + bandValue(b.point, band.key), 0) || 100;
    let y = 10;
    for (const band of BANDS) {
      const value = bandValue(b.point, band.key);
      const h = (value / total) * chartH;
      if (h <= 0) continue;
      svg.append(
        svgEl('rect', {
          x,
          y,
          width: w,
          height: Math.max(h, 0.6),
          fill: band.colour,
          class: 'mark',
          'aria-label': `ATAR ${b.category}: ${band.label} ${value.toFixed(1)}%`,
          'data-tip': tipText(`ATAR ${b.category}\n${band.label}: ${formatPercent(value)}\nCohort ${b.point.cohort}`),
        })
      );
      y += h;
    }
    const pct = svgEl('text', {
      x: x + w / 2,
      y: chartH + 28,
      'text-anchor': 'middle',
      'font-size': 13,
      'font-weight': 700,
      fill: 'var(--outcome-completed)',
    });
    pct.textContent = formatPercent(bandValue(b.point, 'completed'), 0);
    const lbl = svgEl('text', { x: x + w / 2, y: chartH + 44, 'text-anchor': 'middle', class: 'axis-text' });
    lbl.textContent = b.category;
    svg.append(pct, lbl);
  });

  wrap.append(svg);
  return wrap;
}

export function renderOutcomes(root: HTMLElement, ctx: Ctx): void {
  const groups = outcomeGroups(ctx.data.outcomes);
  const groupKey = ctx.param('g') ?? groups[0]?.group ?? '';
  const group = groups.find((g) => g.group === groupKey) ?? groups[0];
  const duration = ctx.param('d') ?? 'Nine Years';

  const national = groups.find((g) => /national totals/i.test(g.group));
  const dom = national ? outcomeAt(national, 'Domestic Students', duration) : null;
  const domFour = national ? outcomeAt(national, 'Domestic Students', 'Four Years') : null;

  root.innerHTML = `
    <div class="view-head">
      <h1>Who actually finishes a degree?</h1>
      <p>The department follows real groups of students who started a bachelor degree and reports where they ended up. Everyone who started is counted, so the four bands always add to 100%. Change the timeframe and watch <strong>still enrolled</strong> turn into <strong>completed</strong> — that movement is why the four-year number is so widely misread.</p>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="label">Completed after ${escapeHtml(DURATION_LABEL[duration] ?? duration)}</div>
        <div class="value" style="color:var(--outcome-completed)">${formatPercent(dom?.completed ?? null)}</div>
        <div class="note">Domestic bachelor students, cohort ${escapeHtml(dom?.cohort ?? '—')}</div>
      </div>
      <div class="stat">
        <div class="label">Still enrolled</div>
        <div class="value">${formatPercent(dom?.stillEnrolled ?? null)}</div>
        <div class="note">Still studying — not a drop-out</div>
      </div>
      <div class="stat">
        <div class="label">Left after first year</div>
        <div class="value" style="color:var(--outcome-never)">${formatPercent(dom?.neverReturned ?? null)}</div>
        <div class="note">Never came back at all</div>
      </div>
      <div class="stat">
        <div class="label">The four-year illusion</div>
        <div class="value">${formatPercent(domFour?.completed ?? null)}</div>
        <div class="note">Completed at 4 years, with ${formatPercent(domFour?.stillEnrolled ?? null)} still studying</div>
      </div>
    </div>

    <div class="controls">
      <div class="control-group">
        <label for="oc-group">Break down by</label>
        <select id="oc-group">
          ${groups
            .map(
              (g) =>
                `<option value="${escapeHtml(g.group)}"${g.group === group.group ? ' selected' : ''}>${escapeHtml(
                  g.label
                )}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="control-group">
        <label>Measured over</label>
        <div class="seg" id="oc-duration">
          ${ctx.data.outcomes.durations
            .map(
              (d) =>
                `<button type="button" data-d="${escapeHtml(d)}"${d === duration ? ' class="active"' : ''}>${
                  DURATION_LABEL[d] ?? d
                }</button>`
            )
            .join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="chart-head">
        <h2>${escapeHtml(group?.label ?? '')} — where the cohort ended up</h2>
        <p>Each bar is 100% of the domestic students who started a bachelor degree, followed for ${escapeHtml(
          DURATION_LABEL[duration] ?? duration
        )}. ${glossaryTerm('completion', 'Completion rate')} and ${glossaryTerm('still-enrolled', 'still enrolled')} explain the two bands that get confused.</p>
      </div>
      <div id="oc-chart"></div>
      <div class="legend">
        ${BANDS.map(
          (b) =>
            `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:${b.colour}"></span>${b.label}</span>`
        ).join('')}
      </div>
    </div>

    <div class="card" id="oc-atar-card" style="margin-top:var(--space-lg);display:none">
      <div class="chart-head">
        <h2>The ${glossaryTerm('atar', 'ATAR')} gradient</h2>
        <p>The same cohort split by the rank students were admitted on. Each column is 100% of the students admitted in that band; the number underneath is the share who completed.</p>
      </div>
      <div id="oc-atar"></div>
    </div>`;

  const chart = root.querySelector<HTMLElement>('#oc-chart')!;
  if (group) chart.append(stackedChart(group, duration, () => {}));

  const atarGroup = groups.find((g) => /admission rank/i.test(g.group));
  if (atarGroup) {
    root.querySelector<HTMLElement>('#oc-atar-card')!.style.display = '';
    root.querySelector<HTMLElement>('#oc-atar')!.append(atarStrip(atarGroup, duration));
  }

  root.querySelector<HTMLSelectElement>('#oc-group')!.addEventListener('change', (e) => {
    ctx.setParam('g', (e.target as HTMLSelectElement).value);
  });
  root.querySelectorAll<HTMLButtonElement>('#oc-duration button').forEach((btn) => {
    btn.addEventListener('click', () => ctx.setParam('d', btn.dataset.d ?? null));
  });
}
