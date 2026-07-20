// Explorer — the analyst's view. One row per university, every metric, sortable,
// searchable, with the whole ten-year series as a sparkline. This is the view
// that replaces having six departmental spreadsheets open at once.
import type { Ctx } from '../ctx';
import { METRICS } from '../analysis';
import { formatNumber, formatPercent, formatRatio, tipText, escapeHtml, NOT_PUBLISHED } from '../format';
import { sparkline } from '../utils/svg';
import type { Institution, Maybe } from '../data';

interface Column {
  key: string;
  label: string;
  get: (i: Institution) => Maybe;
  render: (i: Institution) => string;
  numeric: boolean;
}

export function renderExplorer(root: HTMLElement, ctx: Ctx): void {
  const sortKey = ctx.param('sort') ?? 'students';
  const dir = ctx.param('dir') === 'asc' ? 'asc' : 'desc';
  const query = (ctx.param('q') ?? '').toLowerCase();
  const stateFilter = ctx.param('state') ?? '';

  const columns: Column[] = [
    ...METRICS.map((m) => ({
      key: m.key,
      label: m.short,
      get: m.get,
      render: (i: Institution) => {
        const v = m.get(i);
        if (v === null) return `<span class="muted-cell">${NOT_PUBLISHED}</span>`;
        return m.unit === 'percent' ? formatPercent(v) : m.unit === 'ratio' ? formatRatio(v) : formatNumber(v);
      },
      numeric: true,
    })),
  ];

  const states = [...new Set(ctx.data.institutions.map((i) => i.state).filter(Boolean))].sort() as string[];

  let rows = ctx.data.institutions.filter((i) => {
    if (stateFilter && i.state !== stateFilter) return false;
    if (!query) return true;
    return i.name.toLowerCase().includes(query) || (i.state ?? '').toLowerCase().includes(query);
  });

  const column = columns.find((c) => c.key === sortKey) ?? columns[0];
  rows = [...rows].sort((a, b) => {
    const av = column.get(a);
    const bv = column.get(b);
    // Unpublished values always sort last, in BOTH directions — an institution
    // with no published figure is not the smallest one.
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  });

  root.innerHTML = `
    <div class="view-head">
      <h1>Explore every university</h1>
      <p>Every measure for every university in one table, joined from the department's separate student and staff collections. Sort any column, filter by state, and click a row for the full profile. Blank measures are shown as “${NOT_PUBLISHED}” — never as zero.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="xp-q">Search</label>
        <input id="xp-q" class="text-input" type="search" placeholder="University or state" value="${escapeHtml(
          ctx.param('q') ?? ''
        )}" />
      </div>
      <div class="control-group">
        <label for="xp-state">State</label>
        <select id="xp-state">
          <option value="">All states</option>
          ${states
            .map((s) => `<option value="${escapeHtml(s)}"${s === stateFilter ? ' selected' : ''}>${escapeHtml(s)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="control-group">
        <span style="font-size:var(--font-size-sm);color:var(--text-secondary)">${rows.length} of ${
          ctx.data.institutions.length
        } universities</span>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>University</th>
            <th>State</th>
            ${columns
              .map(
                (c) =>
                  `<th class="right sortable" data-sort="${c.key}">${escapeHtml(c.label)}${
                    c.key === sortKey ? `<span class="arrow">${dir === 'asc' ? '▲' : '▼'}</span>` : ''
                  }</th>`
              )
              .join('')}
            <th class="right">Drop-out trend</th>
          </tr>
        </thead>
        <tbody id="xp-rows"></tbody>
      </table>
    </div>`;

  const tbody = root.querySelector<HTMLElement>('#xp-rows')!;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 3}" class="state-msg">No university matches that search.</td></tr>`;
  }

  for (const inst of rows) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';

    const name = document.createElement('td');
    name.className = 'name-cell';
    name.textContent = inst.name;

    const state = document.createElement('td');
    state.textContent = inst.state ?? '—';

    tr.append(name, state);
    for (const c of columns) {
      const td = document.createElement('td');
      td.className = 'right num';
      td.innerHTML = c.render(inst);
      tr.append(td);
    }

    const trend = document.createElement('td');
    trend.className = 'right';
    const series = inst.attritionDomestic;
    if (series) {
      trend.setAttribute(
        'data-tip',
        tipText(
          `${inst.name} — domestic drop-out rate\n` +
            series.years
              .map((yr, i) => `${yr}: ${series.series[i] === null ? 'not published' : `${series.series[i]!.toFixed(1)}%`}`)
              .join('\n')
        )
      );
      trend.append(sparkline(series.series, 110, 24, { colour: 'var(--status-bad)' }));
    } else {
      trend.innerHTML = `<span class="muted-cell">—</span>`;
    }
    tr.append(trend);

    tr.addEventListener('click', () => ctx.openInstitution(inst));
    tbody.append(tr);
  }

  root.querySelectorAll<HTMLElement>('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort!;
      if (key === sortKey) ctx.setParam('dir', dir === 'asc' ? 'desc' : 'asc');
      else ctx.goto('explorer', { sort: key, dir: 'desc', q: ctx.param('q') ?? '', state: stateFilter });
    });
  });

  const search = root.querySelector<HTMLInputElement>('#xp-q')!;
  let timer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const pos = search.selectionStart;
      ctx.setParam('q', search.value || null);
      const next = document.querySelector<HTMLInputElement>('#xp-q');
      if (next) {
        next.focus();
        if (pos !== null) next.setSelectionRange(pos, pos);
      }
    }, 300);
  });

  root.querySelector<HTMLSelectElement>('#xp-state')!.addEventListener('change', (e) => {
    ctx.setParam('state', (e.target as HTMLSelectElement).value || null);
  });
}
