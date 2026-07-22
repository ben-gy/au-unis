// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Trends — ten years of enrolments, and the same window per institution.
//
// The national picture is one story with two lines going opposite ways:
// domestic enrolments have been broadly flat while overseas enrolments have
// grown by more than half. Annotations mark the two events that explain most
// of the shape.
import type { Ctx } from '../ctx';
import { linearScale, niceTicks, seriesChange } from '../analysis';
import { svgEl, chartSvg } from '../utils/svg';
import { formatNumber, formatCompact, formatSigned, formatPercent, tipText, tipAttr, escapeHtml } from '../format';
import type { Maybe } from '../data';

interface Line {
  label: string;
  colour: string;
  values: Maybe[];
}

const ANNOTATIONS = [
  { year: 2020, label: 'Border closure', detail: 'COVID-19 closed the border to new international students from March 2020.' },
  {
    year: 2024,
    label: 'Visa tightening',
    detail:
      'From 2024 the government tightened student visa settings — higher English and financial requirements, and Ministerial Direction 111 prioritising visa processing.',
  },
];

export function renderTrends(root: HTMLElement, ctx: Ctx): void {
  const series = ctx.data.national.series.enrolments;
  const mode = ctx.param('tm') ?? 'national';

  root.innerHTML = `
    <div class="view-head">
      <h1>Ten years of change</h1>
      <p>National enrolments since ${series?.years[0] ?? ''}, then the same decade for individual universities. The two lines diverging is the single most important fact about Australian higher education over this period.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label>Show</label>
        <div class="seg" id="tr-mode">
          <button type="button" data-tm="national"${mode === 'national' ? ' class="active"' : ''}>National</button>
          <button type="button" data-tm="institutions"${mode === 'institutions' ? ' class="active"' : ''}>By university</button>
        </div>
      </div>
    </div>
    <div id="tr-body"></div>`;

  const body = root.querySelector<HTMLElement>('#tr-body')!;
  if (mode === 'institutions') renderInstitutionTrends(body, ctx);
  else renderNational(body, ctx);

  root.querySelectorAll<HTMLButtonElement>('#tr-mode button').forEach((btn) => {
    btn.addEventListener('click', () => ctx.setParam('tm', btn.dataset.tm ?? null));
  });
}

function renderNational(body: HTMLElement, ctx: Ctx): void {
  const series = ctx.data.national.series.enrolments;
  if (!series) {
    body.innerHTML = '<p class="state-msg">National series not available.</p>';
    return;
  }

  const lines: Line[] = [
    { label: 'All students', colour: 'var(--accent-primary)', values: series.total },
    { label: 'Domestic', colour: 'var(--status-good)', values: series.domestic },
    { label: 'Overseas', colour: 'var(--accent-secondary)', values: series.overseas },
  ];

  const domChange = seriesChange(series.domestic);
  const osChange = seriesChange(series.overseas);

  body.innerHTML = `
    <div class="stat-row">
      <div class="stat">
        <div class="label">Domestic students</div>
        <div class="value">${formatNumber(lastOf(series.domestic))}</div>
        <div class="note">${formatSigned(domChange)} since ${series.years[0]}</div>
      </div>
      <div class="stat">
        <div class="label">Overseas students</div>
        <div class="value" style="color:var(--accent-secondary)">${formatNumber(lastOf(series.overseas))}</div>
        <div class="note">${formatSigned(osChange)} since ${series.years[0]}</div>
      </div>
      <div class="stat">
        <div class="label">All students</div>
        <div class="value">${formatNumber(lastOf(series.total))}</div>
        <div class="note">${formatSigned(seriesChange(series.total))} since ${series.years[0]}</div>
      </div>
      <div class="stat">
        <div class="label">Overseas share now</div>
        <div class="value">${formatPercent(shareLast(series.overseas, series.total))}</div>
        <div class="note">Was ${formatPercent(shareFirst(series.overseas, series.total))} in ${series.years[0]}</div>
      </div>
    </div>

    <div class="card">
      <div class="chart-head">
        <h2>Enrolments, ${series.years[0]} to ${series.years[series.years.length - 1]}</h2>
        <p>Domestic enrolments have barely moved in a decade. Overseas enrolments fell through the border closure and then grew past their pre-COVID level. Hover any year for exact figures.</p>
      </div>
      <div class="chart-scroll" id="tr-chart"></div>
      <div class="legend">
        ${lines
          .map(
            (l) =>
              `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:${l.colour}"></span>${l.label}</span>`
          )
          .join('')}
        ${ANNOTATIONS.map(
          (a) => `<span class="legend-item" style="cursor:default" data-tip="${tipAttr(a.detail)}">▲ ${a.label} (${a.year})</span>`
        ).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:var(--space-lg)">
      <div class="chart-head">
        <h2>By level of course</h2>
        <p>Where the growth actually went. Postgraduate coursework has grown fastest — it is also where overseas enrolment concentrates.</p>
      </div>
      <div class="chart-scroll" id="tr-levels"></div>
    </div>`;

  body.querySelector('#tr-chart')!.append(lineChart(series.years, lines, true));

  const palette = ['#1e3a5f', '#0f766e', '#d97706', '#6d28d9', '#b91c1c', '#0369a1'];
  const levelLines: Line[] = series.levels.map((l, i) => ({
    label: l.label,
    colour: palette[i % palette.length],
    values: l.series,
  }));
  body.querySelector('#tr-levels')!.append(lineChart(series.years, levelLines, false));
}

function lineChart(years: number[], lines: Line[], annotate: boolean): SVGSVGElement {
  const width = 940;
  const height = 400;
  const m = { top: 20, right: 150, bottom: 40, left: 62 };

  const all = lines.flatMap((l) => l.values).filter((v): v is number => v !== null && Number.isFinite(v));
  const max = Math.max(...all, 1);
  const x = linearScale([0, Math.max(1, years.length - 1)], [m.left, width - m.right]);
  const y = linearScale([0, max * 1.06], [height - m.bottom, m.top]);

  const svg = chartSvg(width, height, 'Enrolment time series');

  for (const t of niceTicks(0, max * 1.06, 5)) {
    svg.append(svgEl('line', { x1: m.left, y1: y(t), x2: width - m.right, y2: y(t), class: 'grid-line' }));
    const label = svgEl('text', { x: m.left - 8, y: y(t) + 3, 'text-anchor': 'end', class: 'axis-text' });
    label.textContent = formatCompact(t);
    svg.append(label);
  }
  years.forEach((yr, i) => {
    const label = svgEl('text', { x: x(i), y: height - m.bottom + 16, 'text-anchor': 'middle', class: 'axis-text' });
    label.textContent = String(yr);
    svg.append(label);
  });
  svg.append(svgEl('line', { x1: m.left, y1: height - m.bottom, x2: width - m.right, y2: height - m.bottom, class: 'axis-line' }));

  if (annotate) {
    for (const a of ANNOTATIONS) {
      const i = years.indexOf(a.year);
      if (i < 0) continue;
      svg.append(
        svgEl('line', {
          x1: x(i),
          y1: m.top,
          x2: x(i),
          y2: height - m.bottom,
          stroke: 'var(--text-tertiary)',
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        })
      );
      const marker = svgEl('polygon', {
        points: `${x(i)},${m.top - 2} ${x(i) - 5},${m.top - 11} ${x(i) + 5},${m.top - 11}`,
        fill: 'var(--text-tertiary)',
        class: 'mark',
        'aria-label': `${a.label} ${a.year}`,
        'data-tip': tipText(`${a.label} (${a.year})\n\n${a.detail}`),
      });
      svg.append(marker);
    }
  }

  for (const line of lines) {
    // Gaps break the path — a suppressed year must never be drawn as a dip.
    let d = '';
    let pen = false;
    line.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      pen = true;
    });
    svg.append(
      svgEl('path', {
        d: d.trim(),
        fill: 'none',
        stroke: line.colour,
        'stroke-width': 2.4,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );

    line.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      svg.append(
        svgEl('circle', {
          cx: x(i),
          cy: y(v),
          r: 4.5,
          fill: line.colour,
          stroke: '#fff',
          'stroke-width': 1.5,
          class: 'mark',
          'aria-label': `${line.label} ${years[i]}: ${formatNumber(v)}`,
          'data-tip': tipText(`${line.label}\n${years[i]}: ${formatNumber(v)} students`),
        })
      );
    });

    const lastIndex = lastIndexOf(line.values);
    if (lastIndex >= 0) {
      const label = svgEl('text', {
        x: x(lastIndex) + 10,
        y: y(line.values[lastIndex]!) + 4,
        class: 'axis-text',
        'font-weight': 650,
        fill: line.colour,
      });
      label.textContent = truncate(line.label, 20);
      svg.append(label);
    }
  }

  return svg;
}

function renderInstitutionTrends(body: HTMLElement, ctx: Ctx): void {
  const metricKey = ctx.param('tmet') ?? 'completions';
  const options = [
    { key: 'completions', label: 'Graduates a year' },
    { key: 'attritionDomestic', label: 'Domestic drop-out rate' },
    { key: 'successAll', label: 'Subject success rate' },
    { key: 'staffRatio', label: 'Students per academic staff' },
  ];

  const rows = ctx.data.institutions
    .map((i) => {
      const s =
        metricKey === 'staffRatio'
          ? i.staffRatio
            ? { years: i.staffRatio.years, series: i.staffRatio.academic }
            : null
          : (i as unknown as Record<string, { years: number[]; series: Maybe[] } | undefined>)[metricKey] ?? null;
      if (!s) return null;
      return { institution: i, years: s.years, series: s.series, change: seriesChange(s.series) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.series.some((v) => v !== null))
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));

  body.innerHTML = `
    <div class="controls">
      <div class="control-group">
        <label for="tr-metric">Measure</label>
        <select id="tr-metric">
          ${options
            .map((o) => `<option value="${o.key}"${o.key === metricKey ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <div class="chart-head">
        <h2>Movers over the decade</h2>
        <p>Each row shows one university's whole series with its start value, end value and total change. Sorted by change — biggest risers at the top. Click a row for the full profile.</p>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>University</th>
              <th class="right">Trend</th>
              <th class="right">First</th>
              <th class="right">Latest</th>
              <th class="right">Change</th>
            </tr>
          </thead>
          <tbody id="tr-rows"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = body.querySelector<HTMLElement>('#tr-rows')!;
  const isRate = metricKey !== 'completions';
  for (const r of rows) {
    const published = r.series.filter((v): v is number => v !== null);
    const first = published[0];
    const last = published[published.length - 1];
    const tr = document.createElement('tr');
    tr.className = 'clickable';

    const name = document.createElement('td');
    name.className = 'name-cell';
    name.textContent = r.institution.name;

    const spark = document.createElement('td');
    spark.className = 'right';
    spark.setAttribute(
      'data-tip',
      tipText(
        `${r.institution.name}\n` +
          r.years
            .map((yr, i) => `${yr}: ${r.series[i] === null ? 'not published' : isRate ? `${r.series[i]!.toFixed(1)}` : formatNumber(r.series[i])}`)
            .join('\n')
      )
    );
    spark.append(
      sparklineEl(r.series, r.change !== null && r.change >= 0 ? 'var(--status-good)' : 'var(--status-bad)')
    );

    const firstCell = cell(isRate ? first?.toFixed(1) ?? '—' : formatNumber(first ?? null));
    const lastCell = cell(isRate ? last?.toFixed(1) ?? '—' : formatNumber(last ?? null));
    const changeCell = cell(formatSigned(r.change, 0));
    changeCell.style.color =
      r.change === null ? 'var(--text-muted)' : r.change >= 0 ? 'var(--status-good)' : 'var(--status-bad)';
    changeCell.style.fontWeight = '700';

    tr.append(name, spark, firstCell, lastCell, changeCell);
    tr.addEventListener('click', () => ctx.openInstitution(r.institution));
    tbody.append(tr);
  }

  body.querySelector<HTMLSelectElement>('#tr-metric')!.addEventListener('change', (e) => {
    ctx.setParam('tmet', (e.target as HTMLSelectElement).value);
  });
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'right num';
  td.textContent = text;
  return td;
}

function sparklineEl(values: Maybe[], colour: string): SVGSVGElement {
  const width = 120;
  const height = 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' });
  const published = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (published.length < 2) return svg;
  const min = Math.min(...published);
  const max = Math.max(...published);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const yy = height - 3 - ((v - min) / span) * (height - 6);
    d += `${pen ? 'L' : 'M'}${(i * stepX).toFixed(2)},${yy.toFixed(2)} `;
    pen = true;
  });
  svg.append(
    svgEl('path', { d: d.trim(), fill: 'none', stroke: colour, 'stroke-width': 1.6, 'stroke-linejoin': 'round' })
  );
  return svg;
}

const lastOf = (values: Maybe[]): number | null => {
  const i = lastIndexOf(values);
  return i < 0 ? null : values[i];
};

function lastIndexOf(values: Maybe[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && Number.isFinite(values[i])) return i;
  }
  return -1;
}

function shareLast(part: Maybe[], whole: Maybe[]): number | null {
  const p = lastOf(part);
  const w = lastOf(whole);
  return p !== null && w ? (p / w) * 100 : null;
}

function shareFirst(part: Maybe[], whole: Maybe[]): number | null {
  const p = part.find((v) => v !== null) ?? null;
  const w = whole.find((v) => v !== null) ?? null;
  return p !== null && w ? (p / w) * 100 : null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
