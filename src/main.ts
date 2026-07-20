import './styles.css';
import { loadDataset } from './data';
import type { Dataset, Institution } from './data';
import { VIEWS } from './ctx';
import type { Ctx } from './ctx';
import { initTooltip } from './components/tooltip';
import { initGlossary } from './glossary';
import { openDrilldown, closeDrilldown } from './components/drilldown';
import { openAbout } from './components/about';
import { mountFeedback } from './feedback';
import { escapeHtml, formatNumber } from './format';
import { renderRankings } from './views/rankings';
import { renderOutcomes } from './views/outcomes';
import { renderExposure } from './views/exposure';
import { renderOrigins } from './views/origins';
import { renderFields } from './views/fields';
import { renderTrends } from './views/trends';
import { renderExplorer } from './views/explorer';
import { renderInsights } from './views/insights';

const RENDERERS: Record<string, (root: HTMLElement, ctx: Ctx) => void> = {
  rankings: renderRankings,
  outcomes: renderOutcomes,
  exposure: renderExposure,
  origins: renderOrigins,
  fields: renderFields,
  trends: renderTrends,
  explorer: renderExplorer,
  insights: renderInsights,
};

const app = document.getElementById('app')!;
let dataset: Dataset | null = null;
let controller: AbortController | null = null;

// ── Hash state ────────────────────────────────────────────────────────────
// Everything view-local lives in the hash so any state is shareable.
function readHash(): Map<string, string> {
  const raw = window.location.hash.replace(/^#/, '');
  const out = new Map<string, string>();
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out.set(decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1)));
  }
  return out;
}

function writeHash(map: Map<string, string>): void {
  const parts: string[] = [];
  for (const [k, v] of map) {
    if (v === '' || v === null || v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  const next = parts.length ? `#${parts.join('&')}` : '#';
  if (next !== window.location.hash) window.location.hash = next;
}

function currentView(): string {
  const v = readHash().get('v');
  return v && RENDERERS[v] ? v : 'rankings';
}

// ── Shell ─────────────────────────────────────────────────────────────────
function shell(): void {
  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="wordmark" href="#v=rankings">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 16 L56 25 L32 34 L8 25 Z" fill="#ffffff" />
            <path d="M18 29.5 L18 42 C18 46 25 49 32 49 C39 49 46 46 46 42 L46 29.5 L32 35.2 Z" fill="#d97706" />
          </svg>
          <span>Universities</span>
          <span class="sub">Australia</span>
        </a>
        <div class="header-spacer"></div>
        <div class="header-search">
          <span class="icon" aria-hidden="true">⌕</span>
          <input id="site-search" type="search" placeholder="Find a university" aria-label="Find a university" autocomplete="off" />
          <div class="search-results" id="site-search-results" role="listbox"></div>
        </div>
        <button class="icon-btn" id="about-btn" type="button" aria-label="About this site" title="About this site">?</button>
      </div>
      <nav class="tab-bar" aria-label="Views">
        <div class="tab-inner" id="tab-inner"></div>
      </nav>
    </header>
    <main class="main-content" id="view-root">
      <div class="skeleton"></div>
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-src" id="footer-src"></div>
        <div>Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></div>
      </div>
    </footer>`;

  const tabs = document.getElementById('tab-inner')!;
  for (const view of VIEWS) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.type = 'button';
    btn.dataset.view = view.id;
    // Words only — never a count badge. Counts belong inside the view.
    btn.textContent = view.label;
    btn.addEventListener('click', () => goto(view.id));
    tabs.append(btn);
  }

  document.getElementById('about-btn')!.addEventListener('click', () => {
    if (dataset) openAbout(dataset);
  });
}

function syncTabs(): void {
  const active = currentView();
  document.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
    const on = tab.dataset.view === active;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

// ── Navigation ────────────────────────────────────────────────────────────
function goto(view: string, params: Record<string, string> = {}): void {
  const map = new Map<string, string>();
  map.set('v', view);
  for (const [k, v] of Object.entries(params)) if (v) map.set(k, v);
  writeHash(map);
}

function setParam(key: string, value: string | null): void {
  const map = readHash();
  if (value === null || value === '') map.delete(key);
  else map.set(key, value);
  writeHash(map);
}

function makeCtx(data: Dataset): Ctx {
  return {
    data,
    goto,
    openInstitution: (institution) => {
      const map = readHash();
      map.set('i', institution.code ?? institution.slug);
      writeHash(map);
    },
    param: (key) => readHash().get(key) ?? null,
    setParam,
  };
}

function findInstitution(data: Dataset, id: string): Institution | undefined {
  return data.institutions.find((i) => i.code === id || i.slug === id || i.key === id);
}

// ── Render ────────────────────────────────────────────────────────────────
// Sentinel, not '': an empty hash produces an empty view key, so initialising
// this to '' makes the very first render a no-op and the page never leaves
// its loading skeleton.
let lastRenderKey: string | null = null;

function render(): void {
  if (!dataset) return;
  syncTabs();

  const hash = readHash();
  const view = currentView();
  const ctx = makeCtx(dataset);

  // Re-render the view only when something the VIEW depends on changed —
  // opening or closing the drill-down must not rebuild (and scroll-reset) the
  // page behind it.
  const viewKey = [...hash.entries()]
    .filter(([k]) => k !== 'i')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&');
  if (viewKey !== lastRenderKey) {
    lastRenderKey = viewKey;
    const root = document.getElementById('view-root')!;
    root.innerHTML = '';
    try {
      RENDERERS[view](root, ctx);
    } catch (err) {
      root.innerHTML = `<p class="state-msg error">Something went wrong drawing this view. Try reloading the page.</p>`;
      throw err;
    }
    window.scrollTo({ top: 0 });
  }

  const institutionId = hash.get('i');
  if (institutionId) {
    const institution = findInstitution(dataset, institutionId);
    if (institution) {
      openDrilldown(institution, dataset, () => setParam('i', null));
    } else {
      setParam('i', null);
    }
  } else {
    closeDrilldown();
  }
}

// ── Search ────────────────────────────────────────────────────────────────
function wireSearch(data: Dataset): void {
  const input = document.getElementById('site-search') as HTMLInputElement;
  const results = document.getElementById('site-search-results')!;
  let timer: number | undefined;

  const close = () => results.classList.remove('open');

  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return close();
    const hits = data.institutions
      .filter((i) => i.name.toLowerCase().includes(q) || (i.state ?? '').toLowerCase().includes(q))
      .slice(0, 8);
    if (!hits.length) {
      results.innerHTML = `<button type="button" disabled><span class="r-name">No match</span></button>`;
      results.classList.add('open');
      return;
    }
    results.innerHTML = '';
    for (const hit of hits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const name = document.createElement('div');
      name.className = 'r-name';
      name.textContent = hit.name;
      const meta = document.createElement('div');
      meta.className = 'r-meta';
      meta.textContent = `${hit.state ?? ''} · ${formatNumber(hit.students)} students`;
      btn.append(name, meta);
      btn.addEventListener('click', () => {
        input.value = '';
        close();
        const map = readHash();
        map.set('i', hit.code ?? hit.slug);
        writeHash(map);
      });
      results.append(btn);
    }
    results.classList.add('open');
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 300);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim()) run();
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.header-search')) close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      close();
    }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  shell();
  initTooltip();
  initGlossary();
  mountFeedback();

  controller?.abort();
  controller = new AbortController();

  try {
    dataset = await loadDataset(controller.signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    document.getElementById('view-root')!.innerHTML = `
      <div class="state-msg error">
        <p>Could not load the university data.</p>
        <p style="margin-top:var(--space-sm)"><button class="icon-btn" style="width:auto;border-radius:var(--radius-md);padding:6px 14px;background:var(--accent-primary)" type="button" id="retry">Try again</button></p>
      </div>`;
    document.getElementById('retry')?.addEventListener('click', () => void boot());
    return;
  }

  document.getElementById('footer-src')!.innerHTML =
    `Source: Australian Government Department of Education — Selected Higher Education Statistics ` +
    `(student data ${escapeHtml(String(dataset.national.studentYear))}, staff data ${escapeHtml(
      String(dataset.national.staffYear)
    )}). Boundaries: ABS ASGS (CC BY 4.0). ` +
    `${formatNumber(dataset.national.totalStudents)} students across ${dataset.institutions.length} universities.`;

  wireSearch(dataset);
  window.addEventListener('hashchange', render);
  render();
}

void boot();
