// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Exposure — international share against size.
//
// The quadrant that matters is top-right: big institutions where half the
// student body is on a visa. A change to student visa settings does not land
// evenly across the sector, it lands there, and no league table shows it
// because size and share are always reported separately.
import type { Ctx } from '../ctx';
import { logScale, linearScale, median, niceTicks } from '../analysis';
import { formatNumber, formatPercent, tipText, escapeHtml } from '../format';
import { glossaryTerm } from '../glossary';
import { svgEl, chartSvg, placeLabelsMulti } from '../utils/svg';
import { attachSvgZoom } from '../utils/svgZoom';
import { stateColour } from '../data';
import type { Institution } from '../data';

export function renderExposure(root: HTMLElement, ctx: Ctx): void {
  const institutions = ctx.data.institutions.filter(
    (i) => i.students !== null && i.overseasShare !== null
  );

  const width = 960;
  // Enrolments span roughly two decades but cluster hard in the top one, so a
  // tall canvas spends half its height on empty space below 10k. Kept short
  // enough that the populated region fills the frame.
  const height = 500;
  const m = { top: 24, right: 28, bottom: 56, left: 66 };

  const shares = institutions.map((i) => i.overseasShare);
  const sizes = institutions.map((i) => i.students);
  const medShare = median(shares) ?? 0;
  const medSize = median(sizes) ?? 0;

  const maxShare = Math.max(60, Math.ceil((Math.max(...shares.map((s) => s ?? 0)) + 5) / 10) * 10);
  const x = linearScale([0, maxShare], [m.left, width - m.right]);
  const y = logScale([800, Math.max(...sizes.map((s) => s ?? 0))], [height - m.bottom, m.top]);

  root.innerHTML = `
    <div class="view-head">
      <h1>How exposed is each university?</h1>
      <p>Every university placed by the share of its students who are ${glossaryTerm(
        'overseas-student',
        'overseas students'
      )} (across) against how many students it has in total (up, on a log scale). The amber lines are the national medians, splitting the sector into four quadrants. Drag to pan, scroll to zoom, click any university for its profile.</p>
    </div>

    <div class="card">
      <div class="chart-head">
        <h2>International share against size</h2>
        <p>Top right is where policy risk concentrates: large institutions where close to half the student body holds a student visa. Bottom left is a small, mostly domestic university — a visa change barely touches it.</p>
      </div>
      <div class="svg-wrap" id="ex-wrap"></div>
      <div class="legend" id="ex-legend"></div>
    </div>`;

  const svg = chartSvg(width, height, 'International share against total enrolment for every Australian university');

  // Quadrant shading — subtle, so it frames without competing with the dots.
  svg.append(
    svgEl('rect', {
      x: x(medShare),
      y: m.top,
      width: width - m.right - x(medShare),
      height: y(medSize) - m.top,
      fill: 'var(--accent-secondary)',
      opacity: 0.06,
    })
  );

  // Axes + gridlines
  for (const t of niceTicks(0, maxShare, 6)) {
    svg.append(svgEl('line', { x1: x(t), y1: m.top, x2: x(t), y2: height - m.bottom, class: 'grid-line' }));
    const label = svgEl('text', { x: x(t), y: height - m.bottom + 16, 'text-anchor': 'middle', class: 'axis-text' });
    label.textContent = `${t}%`;
    svg.append(label);
  }
  for (const t of [1000, 2000, 5000, 10000, 20000, 50000, 100000]) {
    const yy = y(t);
    if (yy < m.top || yy > height - m.bottom) continue;
    svg.append(svgEl('line', { x1: m.left, y1: yy, x2: width - m.right, y2: yy, class: 'grid-line' }));
    const label = svgEl('text', { x: m.left - 8, y: yy + 3, 'text-anchor': 'end', class: 'axis-text' });
    label.textContent = t >= 1000 ? `${t / 1000}k` : String(t);
    svg.append(label);
  }

  // Median crosshairs
  svg.append(
    svgEl('line', {
      x1: x(medShare),
      y1: m.top,
      x2: x(medShare),
      y2: height - m.bottom,
      stroke: 'var(--accent-secondary)',
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    }),
    svgEl('line', {
      x1: m.left,
      y1: y(medSize),
      x2: width - m.right,
      y2: y(medSize),
      stroke: 'var(--accent-secondary)',
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    })
  );

  const xTitle = svgEl('text', { x: (m.left + width - m.right) / 2, y: height - 12, 'text-anchor': 'middle', class: 'axis-title' });
  xTitle.textContent = 'Share of students who are overseas students →';
  const yTitle = svgEl('text', {
    x: -(m.top + height - m.bottom) / 2,
    y: 16,
    transform: 'rotate(-90)',
    'text-anchor': 'middle',
    class: 'axis-title',
  });
  yTitle.textContent = 'Total students (log scale) →';
  svg.append(xTitle, yTitle);

  const quadrant = (label: string, qx: number, qy: number, anchor: string) => {
    const t = svgEl('text', { x: qx, y: qy, 'text-anchor': anchor, class: 'axis-text', 'font-weight': 700, opacity: 0.65 });
    t.textContent = label;
    return t;
  };
  svg.append(
    quadrant('Large · high international share', width - m.right - 8, m.top + 16, 'end'),
    quadrant('Small · mostly domestic', m.left + 8, height - m.bottom - 10, 'start')
  );

  // Dots, largest drawn first so small ones stay clickable on top.
  const sorted = [...institutions].sort((a, b) => (b.students ?? 0) - (a.students ?? 0));
  const dots = svgEl('g', {});
  for (const i of sorted) {
    const cx = x(i.overseasShare!);
    const cy = y(i.students!);
    const r = Math.max(4.5, Math.min(15, Math.sqrt(i.students! / 900)));
    const dot = svgEl('circle', {
      cx,
      cy,
      r,
      fill: stateColour(i.state ?? ''),
      opacity: 0.82,
      stroke: '#fff',
      'stroke-width': 1.2,
      class: 'mark',
      'data-key': i.key,
      'aria-label': `${i.name}: ${formatPercent(i.overseasShare)} overseas, ${formatNumber(i.students)} students`,
      'data-tip': tipText(
        `${i.name}\n${i.state ?? ''}\n\nTotal students: ${formatNumber(i.students)}\nOverseas: ${formatNumber(
          i.overseas
        )} (${formatPercent(i.overseasShare)})\nDomestic: ${formatNumber(i.domestic)}\n\nClick for the full profile`
      ),
    });
    dot.addEventListener('click', () => ctx.openInstitution(i));
    dots.append(dot);
  }
  svg.append(dots);

  // Label the notable ones only — everything labelled is nothing labelled.
  const notable = [...institutions]
    .filter((i) => (i.students ?? 0) > 20000 || (i.overseasShare ?? 0) > 45)
    .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
    .slice(0, 18);
  const radiusOf = (i: Institution) => Math.max(4.5, Math.min(15, Math.sqrt(i.students! / 900)));

  // Every dot is an obstacle, so a label never lands on a neighbouring mark.
  const obstacles = institutions.map((i) => {
    const r = radiusOf(i);
    return { x: x(i.overseasShare!) - r, y: y(i.students!) - r, w: r * 2, h: r * 2 };
  });

  // Four candidate corners per label. A single fixed position plus obstacle
  // avoidance drops most labels in the dense top-right cluster — exactly the
  // ones most worth naming.
  const items = notable.map((i) => {
    const short = shortName(i);
    const r = radiusOf(i);
    const w = short.length * 7.2 + 8;
    const h = 17;
    const cx = x(i.overseasShare!);
    const cy = y(i.students!);
    return {
      payload: short,
      alternatives: [
        { x: cx + r + 5, y: cy - r - h, w, h },
        { x: cx + r + 5, y: cy + r + 2, w, h },
        { x: cx - r - 5 - w, y: cy - r - h, w, h },
        { x: cx - r - 5 - w, y: cy + r + 2, w, h },
      ],
    };
  });

  for (const c of placeLabelsMulti(items, obstacles)) {
    const t = svgEl('text', {
      x: c.x,
      // The box is a bounding box; the text baseline sits near its bottom.
      y: c.y + 13,
      class: 'axis-text',
      'font-weight': 600,
      fill: 'var(--text-secondary)',
      'pointer-events': 'none',
    });
    t.textContent = c.payload;
    svg.append(t);
  }

  const wrap = root.querySelector<HTMLElement>('#ex-wrap')!;
  wrap.append(svg);
  attachSvgZoom(svg);

  const legend = root.querySelector<HTMLElement>('#ex-legend')!;
  const states = [...new Set(institutions.map((i) => i.state).filter(Boolean))].sort() as string[];
  legend.innerHTML =
    states
      .map(
        (s) =>
          `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:${stateColour(
            s
          )}"></span>${escapeHtml(s)}</span>`
      )
      .join('') +
    `<span class="legend-item" style="cursor:default">Dot size is total enrolment. Medians: ${formatPercent(
      medShare
    )} overseas, ${formatNumber(medSize)} students.</span>`;
}

function shortName(i: Institution): string {
  return i.name
    .replace(/^The /, '')
    .replace(/University of Technology/, 'UT')
    .replace(/ University Australia$/, '')
    .replace(/ University$/, '')
    .replace(/^University of /, '');
}
