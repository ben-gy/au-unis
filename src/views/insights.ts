// Insights — findings computed in the pipeline, each one a click-through into
// the view that shows the underlying data. A finding the reader cannot verify
// is just an assertion, so every card leads somewhere.
import type { Ctx } from '../ctx';
import { escapeHtml } from '../format';
import { histogram, metricByKey } from '../analysis';
import { formatNumber, formatPercent, formatRatio, tipText } from '../format';
import { svgEl, chartSvg } from '../utils/svg';
import { linearScale } from '../analysis';
import type { Metric } from '../analysis';

const VIEW_LABEL: Record<string, string> = {
  origins: 'See where students come from',
  exposure: 'See the exposure map',
  rankings: 'See the full ranking',
  outcomes: 'See who finishes',
  trends: 'See the ten-year trend',
  fields: 'See the study areas',
};

export function renderInsights(root: HTMLElement, ctx: Ctx): void {
  const { insights } = ctx.data.national;
  const metricKey = ctx.param('hm') ?? 'attritionDomestic';
  const metric = metricByKey(metricKey);

  root.innerHTML = `
    <div class="view-head">
      <h1>What stands out</h1>
      <p>Findings computed directly from the ${ctx.data.national.studentYear} data — outliers, gaps and the numbers that are most often misread. Each card opens the view it came from.</p>
    </div>
    <div class="grid" id="in-cards"></div>

    <div class="card" style="margin-top:var(--space-lg)">
      <div class="chart-head">
        <h2>How spread out is the sector?</h2>
        <p>Universities grouped into equal-width bands on the measure you pick. Equal-width bands, not quantiles — quantiles would hide exactly the spread this chart exists to show. Click a bar to see which universities are in it.</p>
      </div>
      <div class="controls" style="margin-bottom:var(--space-md)">
        <div class="control-group">
          <label for="in-metric">Measure</label>
          <select id="in-metric">
            ${['attritionDomestic', 'overseasShare', 'successAll', 'staffRatio', 'students']
              .map((k) => {
                const m = metricByKey(k);
                return `<option value="${k}"${k === metricKey ? ' selected' : ''}>${escapeHtml(m.label)}</option>`;
              })
              .join('')}
          </select>
        </div>
      </div>
      <div id="in-hist"></div>
      <div id="in-hist-detail"></div>
    </div>`;

  const cards = root.querySelector<HTMLElement>('#in-cards')!;
  for (const insight of insights) {
    const card = document.createElement('div');
    card.className = `insight ${insight.severity}`;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const h = document.createElement('h3');
    h.textContent = insight.title;
    const p = document.createElement('p');
    p.textContent = insight.body;
    const cta = document.createElement('span');
    cta.className = 'cta';
    cta.textContent = `${VIEW_LABEL[insight.view] ?? 'Open'} →`;

    card.append(h, p, cta);
    const go = () => ctx.goto(insight.view);
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
    cards.append(card);
  }

  renderHistogram(root, ctx, metric);

  root.querySelector<HTMLSelectElement>('#in-metric')!.addEventListener('change', (e) => {
    ctx.setParam('hm', (e.target as HTMLSelectElement).value);
  });
}

function fmt(metric: Metric, v: number): string {
  if (metric.unit === 'percent') return formatPercent(v);
  if (metric.unit === 'ratio') return formatRatio(v);
  return formatNumber(v);
}

function renderHistogram(root: HTMLElement, ctx: Ctx, metric: Metric): void {
  const bins = histogram(ctx.data.institutions, metric, 12);
  const maxCount = Math.max(...bins.map((b) => b.items.length), 1);

  const width = 940;
  const height = 330;
  const m = { top: 18, right: 20, bottom: 54, left: 46 };
  const svg = chartSvg(width, height, `Distribution of ${metric.label} across universities`);

  const y = linearScale([0, maxCount], [height - m.bottom, m.top]);
  const bandW = (width - m.left - m.right) / bins.length;

  for (let t = 0; t <= maxCount; t += Math.max(1, Math.ceil(maxCount / 5))) {
    svg.append(svgEl('line', { x1: m.left, y1: y(t), x2: width - m.right, y2: y(t), class: 'grid-line' }));
    const label = svgEl('text', { x: m.left - 8, y: y(t) + 3, 'text-anchor': 'end', class: 'axis-text' });
    label.textContent = String(t);
    svg.append(label);
  }

  const detail = root.querySelector<HTMLElement>('#in-hist-detail')!;

  bins.forEach((bin, i) => {
    const x = m.left + i * bandW;
    const h = height - m.bottom - y(bin.items.length);
    if (bin.items.length > 0) {
      const rect = svgEl('rect', {
        x: x + 2,
        y: y(bin.items.length),
        width: Math.max(bandW - 4, 1),
        height: Math.max(h, 1),
        fill: 'var(--accent-primary)',
        rx: 2,
        class: 'mark',
        'aria-label': `${bin.items.length} universities between ${fmt(metric, bin.x0)} and ${fmt(metric, bin.x1)}`,
        'data-tip': tipText(
          `${fmt(metric, bin.x0)} to ${fmt(metric, bin.x1)}\n${bin.items.length} universit${
            bin.items.length === 1 ? 'y' : 'ies'
          }\n\nClick to list them`
        ),
      });
      rect.addEventListener('click', () => {
        detail.innerHTML = `
          <div class="note-box">
            <strong>${bin.items.length} universit${bin.items.length === 1 ? 'y' : 'ies'}</strong> with ${escapeHtml(
              metric.label.toLowerCase()
            )} between ${fmt(metric, bin.x0)} and ${fmt(metric, bin.x1)}:
            <div style="margin-top:var(--space-sm)" id="in-bin-list"></div>
          </div>`;
        const list = detail.querySelector<HTMLElement>('#in-bin-list')!;
        for (const inst of [...bin.items].sort((a, b) => (metric.get(b) ?? 0) - (metric.get(a) ?? 0))) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'rank-pill';
          btn.style.cssText = 'margin:2px 4px 2px 0;cursor:pointer;border:0';
          btn.textContent = `${inst.name} · ${fmt(metric, metric.get(inst) ?? 0)}`;
          btn.addEventListener('click', () => ctx.openInstitution(inst));
          list.append(btn);
        }
      });
      svg.append(rect);
    }

    if (i % 2 === 0 || bins.length <= 8) {
      const label = svgEl('text', {
        x: x + bandW / 2,
        y: height - m.bottom + 16,
        'text-anchor': 'middle',
        class: 'axis-text',
      });
      label.textContent = fmt(metric, bin.x0);
      svg.append(label);
    }
  });

  const xTitle = svgEl('text', {
    x: (m.left + width - m.right) / 2,
    y: height - 10,
    'text-anchor': 'middle',
    class: 'axis-title',
  });
  xTitle.textContent = metric.label;
  const yTitle = svgEl('text', {
    x: -(height - m.bottom + m.top) / 2,
    y: 13,
    transform: 'rotate(-90)',
    'text-anchor': 'middle',
    class: 'axis-title',
  });
  yTitle.textContent = 'Universities';
  svg.append(xTitle, yTitle);

  root.querySelector('#in-hist')!.append(svg);
}
