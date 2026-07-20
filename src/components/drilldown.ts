// Per-institution drill-down. Hash-linkable (#i=3040) so a profile can be
// shared directly — which matters when the visitor is a student sending a
// university to a parent.
import type { Dataset, Institution, Maybe } from '../data';
import { METRICS, rankOf, metricByKey } from '../analysis';
import { formatNumber, formatPercent, formatRatio, ordinal, tipText, escapeHtml, NOT_PUBLISHED } from '../format';
import { fieldColour } from '../data';
import { sparkline } from '../utils/svg';
import { glossaryTerm } from '../glossary';

let panel: HTMLElement | null = null;
let overlay: HTMLElement | null = null;
let lastFocused: Element | null = null;
let detachTimer: number | undefined;
let escapeBound = false;
let closeHandler: (() => void) | null = null;

// Must match --transition-normal in styles.css.
const TRANSITION_MS = 250;

function ensure(onClose: () => void): { panel: HTMLElement; overlay: HTMLElement } {
  closeHandler = onClose;

  // Bound once for the life of the page, not per panel — the panel is detached
  // and rebuilt on every close, and re-binding here would leak a listener each
  // time a profile is opened.
  if (!escapeBound) {
    escapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel?.classList.contains('open')) closeHandler?.();
    });
  }

  if (!panel || !overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.addEventListener('click', () => closeHandler?.());

    panel = document.createElement('aside');
    panel.className = 'drill';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'University profile');

    document.body.append(overlay, panel);
  }
  return { panel, overlay };
}

export function closeDrilldown(): void {
  if (!panel && !overlay) return;
  panel?.classList.remove('open');
  overlay?.classList.remove('open');
  if (lastFocused instanceof HTMLElement) lastFocused.focus();

  // Detach once the slide-out has finished.
  //
  // A closed drawer left in the DOM is still a real box: it is `position: fixed`
  // at `width: 100vw` translated to `translateX(100%)`, so it occupies
  // [100vw, 200vw]. Desktop Chrome ignores off-viewport fixed elements when
  // computing document scroll width, but iOS Safari does NOT — the user can
  // scroll the whole page sideways into empty space, which is exactly what was
  // reported. `visibility: hidden` makes it inert but does not remove the box,
  // and a root `overflow-x: clip` only papers over it. Removing the element is
  // the only fix that does not depend on per-browser overflow behaviour.
  window.clearTimeout(detachTimer);
  detachTimer = window.setTimeout(() => {
    if (panel && !panel.classList.contains('open')) {
      panel.remove();
      overlay?.remove();
      panel = null;
      overlay = null;
    }
  }, TRANSITION_MS + 60);
}

function metricValue(key: string, institution: Institution): string {
  const metric = metricByKey(key);
  const v = metric.get(institution);
  if (v === null) return NOT_PUBLISHED;
  return metric.unit === 'percent' ? formatPercent(v) : metric.unit === 'ratio' ? formatRatio(v) : formatNumber(v);
}

export function openDrilldown(institution: Institution, data: Dataset, onClose: () => void): void {
  lastFocused = document.activeElement;
  const { panel: el, overlay: ov } = ensure(onClose);

  const rankRows = METRICS.map((m) => {
    const r = rankOf(data.institutions, m, institution.key);
    return { metric: m, rank: r, value: metricValue(m.key, institution) };
  });

  const fields = Object.entries(institution.fields ?? {})
    .filter(([, v]) => v !== null && (v as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 8) as [string, number][];
  const fieldTotal = Object.values(institution.fields ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);

  el.innerHTML = `
    <button class="modal-close" type="button" aria-label="Close">×</button>
    <h2>${escapeHtml(institution.name)}</h2>
    <div class="sub">${escapeHtml(institution.state ?? '')}${
      institution.code ? ` · provider code ${escapeHtml(institution.code)}` : ''
    } · ${data.national.studentYear} data</div>

    ${
      institution.notes.length
        ? institution.notes.map((n) => `<div class="note-box">${escapeHtml(n)}</div>`).join('')
        : ''
    }

    <h3>At a glance</h3>
    <dl class="kv">
      <dt>Total students</dt><dd>${formatNumber(institution.students)}</dd>
      <dt>${glossaryTerm('domestic-student', 'Domestic')}</dt><dd>${formatNumber(institution.domestic)}</dd>
      <dt>${glossaryTerm('overseas-student', 'Overseas')}</dt><dd>${formatNumber(institution.overseas)}</dd>
      <dt>International share</dt><dd>${formatPercent(institution.overseasShare)}</dd>
      <dt>Graduates in ${data.national.studentYear}</dt><dd>${formatNumber(institution.completions?.latest ?? null)}</dd>
      <dt>${glossaryTerm('student-staff-ratio', 'Students per academic')}</dt><dd>${formatRatio(
        institution.staffRatioLatest ?? null
      )}</dd>
    </dl>

    <h3>Rank against every other university</h3>
    <div id="dd-ranks"></div>

    <h3>Ten-year trends</h3>
    <div id="dd-series"></div>

    <h3>What students study here</h3>
    <div id="dd-fields"></div>

    <h3>Who studies here</h3>
    <dl class="kv" id="dd-mix"></dl>`;

  // ── Ranks ──
  const ranks = el.querySelector<HTMLElement>('#dd-ranks')!;
  for (const r of rankRows) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:var(--space-sm);align-items:center;padding:4px 0;border-bottom:1px solid var(--border-subtle)';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:var(--font-size-sm);min-width:0;color:var(--text-secondary)';
    label.textContent = r.metric.label;

    const value = document.createElement('span');
    value.className = 'num';
    value.style.fontWeight = '650';
    value.textContent = r.value;

    const pill = document.createElement('span');
    pill.className = 'rank-pill';
    if (r.rank) {
      pill.textContent = `${ordinal(r.rank.rank)} of ${r.rank.of}`;
      pill.setAttribute(
        'data-tip',
        tipText(
          `${r.metric.label}\n${r.metric.describe}\n\n${institution.name} ranks ${ordinal(r.rank.rank)} of ${
            r.rank.of
          } universities with a published value.`
        )
      );
    } else {
      pill.textContent = 'unranked';
      pill.style.background = 'var(--bg-elevated)';
      pill.style.color = 'var(--text-tertiary)';
      pill.setAttribute('data-tip', tipText('No published value for this measure, so this university is not ranked on it.'));
    }
    row.append(label, value, pill);
    ranks.append(row);
  }

  // ── Series ──
  const seriesHost = el.querySelector<HTMLElement>('#dd-series')!;
  const seriesSpecs: { label: string; years: number[]; values: Maybe[]; suffix: string; colour: string }[] = [];
  if (institution.attritionDomestic)
    seriesSpecs.push({
      label: 'Domestic drop-out rate',
      years: institution.attritionDomestic.years,
      values: institution.attritionDomestic.series,
      suffix: '%',
      colour: 'var(--status-bad)',
    });
  if (institution.successAll)
    seriesSpecs.push({
      label: 'Subject success rate',
      years: institution.successAll.years,
      values: institution.successAll.series,
      suffix: '%',
      colour: 'var(--status-good)',
    });
  if (institution.completions)
    seriesSpecs.push({
      label: 'Graduates a year',
      years: institution.completions.years,
      values: institution.completions.series,
      suffix: '',
      colour: 'var(--accent-primary)',
    });
  if (institution.staffRatio)
    seriesSpecs.push({
      label: 'Students per academic',
      years: institution.staffRatio.years,
      values: institution.staffRatio.academic,
      suffix: '',
      colour: 'var(--accent-secondary)',
    });

  if (!seriesSpecs.length) {
    seriesHost.innerHTML = `<p style="color:var(--text-tertiary);font-size:var(--font-size-sm)">No time series published for this institution.</p>`;
  }
  for (const spec of seriesSpecs) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid;grid-template-columns:minmax(0,1fr) 130px auto;gap:var(--space-sm);align-items:center;padding:5px 0;border-bottom:1px solid var(--border-subtle)';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:var(--font-size-sm);min-width:0;color:var(--text-secondary)';
    label.textContent = spec.label;

    const chart = document.createElement('span');
    chart.setAttribute(
      'data-tip',
      tipText(
        `${spec.label}\n` +
          spec.years
            .map(
              (yr, i) =>
                `${yr}: ${
                  spec.values[i] === null
                    ? 'not published'
                    : spec.suffix === '%'
                      ? `${spec.values[i]!.toFixed(1)}%`
                      : formatNumber(spec.values[i])
                }`
            )
            .join('\n')
      )
    );
    chart.append(sparkline(spec.values, 126, 26, { colour: spec.colour }));

    const latest = document.createElement('span');
    latest.className = 'num';
    latest.style.fontWeight = '650';
    const last = [...spec.values].reverse().find((v) => v !== null) ?? null;
    latest.textContent = last === null ? '—' : spec.suffix === '%' ? `${last.toFixed(1)}%` : formatNumber(last);

    row.append(label, chart, latest);
    seriesHost.append(row);
  }

  // ── Fields ──
  const fieldHost = el.querySelector<HTMLElement>('#dd-fields')!;
  if (!fields.length) {
    fieldHost.innerHTML = `<p style="color:var(--text-tertiary);font-size:var(--font-size-sm)">No field breakdown published.</p>`;
  }
  for (const [name, value] of fields) {
    const share = fieldTotal ? (value / fieldTotal) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.style.cursor = 'default';
    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'bar-track';
    track.setAttribute('data-tip', tipText(`${name}\n${formatNumber(value)} students\n${formatPercent(share)} of this university`));
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(1, share)}%`;
    fill.style.background = fieldColour(name);
    track.append(fill);
    const val = document.createElement('div');
    val.className = 'bar-value';
    val.textContent = formatPercent(share, 0);
    row.append(label, track, val);
    fieldHost.append(row);
  }

  // ── Mix ──
  const mix = el.querySelector<HTMLElement>('#dd-mix')!;
  const entries: [string, string][] = [];
  if (institution.gender) {
    entries.push(['Women', formatNumber(institution.gender.females)]);
    entries.push(['Men', formatNumber(institution.gender.males)]);
  }
  for (const [name, value] of Object.entries(institution.levels ?? {})) {
    if (value === null || value === 0) continue;
    entries.push([name, formatNumber(value)]);
  }
  mix.innerHTML = entries
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('');

  el.querySelector<HTMLButtonElement>('.modal-close')!.addEventListener('click', onClose);

  el.classList.add('open');
  ov.classList.add('open');
  el.querySelector<HTMLButtonElement>('.modal-close')!.focus();
  el.scrollTop = 0;
}
