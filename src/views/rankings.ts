// Rankings — the default view. A phone visitor lands here from a search for
// one university and one number, so the job is: show me my shortlist against
// everyone else, with the national median marked so a value has a reference.
import type { Ctx } from '../ctx';
import { METRICS, metricByKey, rankBy, median } from '../analysis';
import { formatNumber, formatPercent, formatRatio, tipText, escapeHtml } from '../format';
import { glossaryTerm } from '../glossary';
import { stateColour } from '../data';
import type { Metric } from '../analysis';

function fmt(metric: Metric, v: number | null): string {
  if (metric.unit === 'percent') return formatPercent(v);
  if (metric.unit === 'ratio') return formatRatio(v);
  return formatNumber(v);
}

const METRIC_TERM: Record<string, string> = {
  attritionDomestic: 'sector-attrition',
  attritionOverseas: 'provider-attrition',
  retentionAll: 'retention',
  successAll: 'success',
  staffRatio: 'student-staff-ratio',
  overseasShare: 'overseas-student',
};

export function renderRankings(root: HTMLElement, ctx: Ctx): void {
  const metricKey = ctx.param('m') ?? 'students';
  const stateFilter = ctx.param('state') ?? '';
  const metric = metricByKey(metricKey);

  const states = [...new Set(ctx.data.institutions.map((i) => i.state).filter(Boolean))].sort() as string[];
  const pool = stateFilter
    ? ctx.data.institutions.filter((i) => i.state === stateFilter)
    : ctx.data.institutions;

  const ranked = rankBy(pool, metric);
  const med = median(ranked.map((r) => r.value));
  const max = ranked.length ? Math.max(...ranked.map((r) => r.value)) : 1;
  const unranked = pool.length - ranked.length;

  const termKey = METRIC_TERM[metric.key];

  root.innerHTML = `
    <div class="view-head">
      <h1>Every Australian university, ranked</h1>
      <p>All ${ctx.data.institutions.length} universities reported individually by the Department of Education, on the measure you choose. The amber line marks the national median, so you can see whether a number is unusual or ordinary. Click any university for its full profile.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="rk-metric">Rank by</label>
        <select id="rk-metric">
          ${METRICS.map(
            (m) => `<option value="${m.key}"${m.key === metric.key ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="control-group">
        <label for="rk-state">State</label>
        <select id="rk-state">
          <option value="">All states</option>
          ${states.map((s) => `<option value="${escapeHtml(s)}"${s === stateFilter ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <div class="chart-head">
        <h2>${escapeHtml(metric.label)}${termKey ? ` ${glossaryTerm(termKey, '')}` : ''}</h2>
        <p>${escapeHtml(metric.describe)}</p>
      </div>
      <div id="rk-bars"></div>
      <div class="legend">
        <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:var(--accent-secondary)"></span>National median ${fmt(metric, med)}</span>
        ${
          metric.higherIsBetter === null
            ? '<span class="legend-item" style="cursor:default">Ranked largest first — this measure has no better or worse direction.</span>'
            : `<span class="legend-item" style="cursor:default">Ranked best first (${metric.higherIsBetter ? 'higher' : 'lower'} is better for students).</span>`
        }
        ${unranked > 0 ? `<span class="legend-item" style="cursor:default">${unranked} not ranked — no published value.</span>` : ''}
      </div>
    </div>`;

  const bars = root.querySelector<HTMLElement>('#rk-bars')!;
  if (!ranked.length) {
    bars.innerHTML = '<p class="state-msg">No university has a published value for this measure.</p>';
    return;
  }

  for (const r of ranked) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.dataset.key = r.institution.key;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = `${r.rank}. ${r.institution.name}`;

    const track = document.createElement('div');
    track.className = 'bar-track';
    track.setAttribute(
      'data-tip',
      tipText(
        `${r.institution.name}\n${r.institution.state ?? ''}\n${metric.label}: ${fmt(metric, r.value)}\nRank ${r.rank} of ${ranked.length}` +
          (med !== null ? `\nNational median: ${fmt(metric, med)}` : '')
      )
    );
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(1, (r.value / max) * 100)}%`;
    fill.style.background = stateColour(r.institution.state ?? '');
    track.append(fill);

    if (med !== null && max > 0) {
      const marker = document.createElement('div');
      marker.className = 'bar-median';
      marker.style.left = `${Math.min(99.6, (med / max) * 100)}%`;
      track.append(marker);
    }

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = fmt(metric, r.value);

    row.append(label, track, value);
    const open = () => ctx.openInstitution(r.institution);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    bars.append(row);
  }

  root.querySelector<HTMLSelectElement>('#rk-metric')!.addEventListener('change', (e) => {
    ctx.setParam('m', (e.target as HTMLSelectElement).value);
  });
  root.querySelector<HTMLSelectElement>('#rk-state')!.addEventListener('change', (e) => {
    ctx.setParam('state', (e.target as HTMLSelectElement).value || null);
  });
}
