// Origins — where students come from, and where they study.
//
// Table 2.4 is a genuine origin-destination matrix, which is the one place in
// this collection where a flow diagram is the honest form rather than
// decoration. The single biggest band is "Outside Australia": 598,882 of
// 1,676,077 students, larger than New South Wales and Victoria put together.
// That reframes what an Australian university is, and it is invisible in every
// per-institution table.
import type { Ctx } from '../ctx';
import { sankey } from '../utils/sankey';
import { svgEl, chartSvg } from '../utils/svg';
import { formatNumber, formatPercent, tipText, tipAttr, escapeHtml } from '../format';
import { glossaryTerm } from '../glossary';
import { stateColour } from '../data';
import { renderStateMap } from '../map';

export function renderOrigins(root: HTMLElement, ctx: Ctx): void {
  const { origins } = ctx.data;
  const mode = ctx.param('om') ?? 'flow';

  const overseas = origins.rows.find((r) => /outside australia/i.test(r.origin));
  const interstateShare = (() => {
    let moved = 0;
    let domestic = 0;
    origins.rows.forEach((r) => {
      if (/outside australia/i.test(r.origin)) return;
      domestic += r.total;
      r.values.forEach((v, ci) => {
        if (v === null) return;
        if (origins.cols[ci] !== r.origin) moved += v;
      });
    });
    return domestic ? (moved / domestic) * 100 : null;
  })();

  root.innerHTML = `
    <div class="view-head">
      <h1>Where students come from</h1>
      <p>Every student placed by where they permanently live (left) against the state where they study (right). This is the view that shows what an Australian university actually is now — the largest single origin is not a state.</p>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="label">Live outside Australia</div>
        <div class="value">${formatPercent(overseas ? (overseas.total / origins.grandTotal) * 100 : null)}</div>
        <div class="note">${formatNumber(overseas?.total ?? null)} students — more than NSW and Victoria combined</div>
      </div>
      <div class="stat">
        <div class="label">Total students</div>
        <div class="value">${formatNumber(origins.grandTotal)}</div>
        <div class="note">All providers, ${ctx.data.national.studentYear}</div>
      </div>
      <div class="stat">
        <div class="label">Study interstate</div>
        <div class="value">${formatPercent(interstateShare)}</div>
        <div class="note">Of students living in Australia, share studying outside their home state</div>
      </div>
      <div class="stat">
        <div class="label">Largest destination</div>
        <div class="value">${escapeHtml(largestDestination(origins).code)}</div>
        <div class="note">${escapeHtml(largestDestination(origins).name)} — ${formatNumber(
          largestDestination(origins).value
        )} students</div>
      </div>
    </div>

    <div class="controls">
      <div class="control-group">
        <label>View</label>
        <div class="seg" id="or-mode">
          <button type="button" data-om="flow"${mode === 'flow' ? ' class="active"' : ''}>Flow</button>
          <button type="button" data-om="map"${mode === 'map' ? ' class="active"' : ''}>Map</button>
          <button type="button" data-om="matrix"${mode === 'matrix' ? ' class="active"' : ''}>Matrix</button>
        </div>
      </div>
    </div>

    <div class="card" id="or-card"></div>`;

  const card = root.querySelector<HTMLElement>('#or-card')!;
  if (mode === 'map') renderMapMode(card, ctx);
  else if (mode === 'matrix') renderMatrix(card, ctx);
  else renderFlow(card, ctx);

  root.querySelectorAll<HTMLButtonElement>('#or-mode button').forEach((btn) => {
    btn.addEventListener('click', () => ctx.setParam('om', btn.dataset.om ?? null));
  });
}

function largestDestination(origins: { cols: string[]; rows: { values: (number | null)[] }[] }) {
  const totals = origins.cols.map((name, ci) => ({
    name,
    value: origins.rows.reduce((a, r) => a + (r.values[ci] ?? 0), 0),
  }));
  totals.sort((a, b) => b.value - a.value);
  const top = totals[0] ?? { name: '—', value: 0 };
  const code =
    { 'New South Wales': 'NSW', Victoria: 'VIC', Queensland: 'QLD', 'Western Australia': 'WA', 'South Australia': 'SA' }[
      top.name
    ] ?? top.name;
  return { ...top, code };
}

function renderFlow(card: HTMLElement, ctx: Ctx): void {
  const { origins } = ctx.data;
  const sources = origins.rows.map((r) => r.origin);
  const values = origins.rows.map((r) => r.values);

  const width = 940;
  const height = 620;
  const layout = sankey({ sources, targets: origins.cols, values }, { width, height: height - 40, nodeWidth: 15, padding: 9 });

  card.innerHTML = `
    <div class="chart-head">
      <h2>Home state to state of study</h2>
      <p>Ribbon thickness is the number of students. Hover a ribbon for the exact flow; hover a block to isolate everything touching it. The thick amber band from “Outside Australia” is the international student intake.</p>
    </div>
    <div class="chart-scroll" id="or-flow"></div>
    <div class="legend">
      <span class="legend-item" style="cursor:default">Left: where the student permanently lives · Right: state of the institution they study at</span>
      <span class="legend-item" style="cursor:default">“Multi-State” is an institution operating across several states.</span>
    </div>`;

  const svg = chartSvg(width, height, 'Flow of students from home state to state of study');
  const g = svgEl('g', { transform: 'translate(0,20)' });

  const linkGroup = svgEl('g', { fill: 'none' });
  for (const link of layout.links) {
    const path = svgEl('path', {
      d: link.path,
      stroke: stateColour(link.source),
      'stroke-width': Math.max(1, link.width),
      'stroke-opacity': 0.42,
      class: 'mark',
      'data-source': link.source,
      'data-target': link.target,
      'aria-label': `${link.source} to ${link.target}: ${formatNumber(link.value)} students`,
      'data-tip': tipText(
        `${link.source}  →  ${link.target}\n${formatNumber(link.value)} students\n${formatPercent(
          (link.value / layout.total) * 100
        )} of all students`
      ),
    });
    linkGroup.append(path);
  }
  g.append(linkGroup);

  const nodeGroup = svgEl('g', {});
  for (const node of layout.nodes) {
    const rect = svgEl('rect', {
      x: node.x,
      y: node.y,
      width: node.w,
      height: Math.max(node.h, 1),
      fill: stateColour(node.name),
      rx: 2,
      class: 'mark',
      'data-node': node.name,
      'data-side': node.side,
      'aria-label': `${node.name}: ${formatNumber(node.value)} students`,
      'data-tip': tipText(
        `${node.name}\n${node.side === 'source' ? 'Students who live here' : 'Students who study here'}: ${formatNumber(
          node.value
        )}\n${formatPercent((node.value / layout.total) * 100)} of all students`
      ),
    });
    nodeGroup.append(rect);

    const isSource = node.side === 'source';
    if (node.h >= 11) {
      const label = svgEl('text', {
        x: isSource ? node.x + node.w + 6 : node.x - 6,
        y: node.y + node.h / 2 + 4,
        'text-anchor': isSource ? 'start' : 'end',
        class: 'axis-text',
        'font-weight': node.name === 'Outside Australia' ? 700 : 500,
        fill: node.name === 'Outside Australia' ? 'var(--accent-secondary)' : 'var(--text-secondary)',
        'pointer-events': 'none',
      });
      label.textContent = `${abbreviate(node.name)} ${formatNumber(node.value)}`;
      nodeGroup.append(label);
    }
  }
  g.append(nodeGroup);

  const head = (text: string, x: number, anchor: string) => {
    const t = svgEl('text', { x, y: 12, 'text-anchor': anchor, class: 'axis-title' });
    t.textContent = text;
    return t;
  };
  svg.append(head('Lives in', 0, 'start'), head('Studies in', width, 'end'), g);

  // Hover a node to isolate its flows.
  const dimAll = (predicate: ((el: SVGElement) => boolean) | null) => {
    linkGroup.querySelectorAll<SVGElement>('path').forEach((p) => {
      p.classList.toggle('dim', predicate ? !predicate(p) : false);
    });
  };
  nodeGroup.querySelectorAll<SVGElement>('rect').forEach((rect) => {
    const name = rect.getAttribute('data-node');
    const side = rect.getAttribute('data-side');
    rect.addEventListener('mouseenter', () =>
      dimAll((p) => p.getAttribute(side === 'source' ? 'data-source' : 'data-target') === name)
    );
    rect.addEventListener('mouseleave', () => dimAll(null));
  });

  card.querySelector('#or-flow')!.append(svg);
}

function renderMatrix(card: HTMLElement, ctx: Ctx): void {
  const { origins } = ctx.data;
  const max = Math.max(...origins.rows.flatMap((r) => r.values.map((v) => v ?? 0)));

  const cells = origins.rows
    .map((r) => {
      const tds = r.values
        .map((v, ci) => {
          const col = origins.cols[ci];
          if (v === null) {
            return `<td class="right muted-cell" data-tip="${tipAttr(
              `${r.origin} → ${col}\nNot published — the department withholds cells too small to publish without identifying individuals. The real value is small but not zero.`
            )}">np</td>`;
          }
          // Sqrt keeps the mid-range readable: linear intensity on a matrix
          // where one cell is 275,720 and another is 115 renders everything
          // except the diagonal as white.
          const alpha = Math.sqrt(v / max);
          const home = col === r.origin;
          return `<td class="right num" style="background:rgba(30,58,95,${(alpha * 0.85).toFixed(
            3
          )});color:${alpha > 0.55 ? '#fff' : 'var(--text-primary)'};font-weight:${home ? 700 : 400}" data-tip="${tipAttr(
            `${r.origin} → ${col}\n${formatNumber(v)} students\n${formatPercent((v / r.total) * 100)} of students from ${
              r.origin
            }${home ? '\n\n(studying in their home state)' : ''}`
          )}">${formatNumber(v)}</td>`;
        })
        .join('');
      return `<tr><td class="name-cell">${escapeHtml(r.origin)}</td>${tds}<td class="right num" style="font-weight:700">${formatNumber(
        r.total
      )}</td></tr>`;
    })
    .join('');

  card.innerHTML = `
    <div class="chart-head">
      <h2>Origin by destination, exact numbers</h2>
      <p>Rows are where students live, columns are where they study. Shading is square-root scaled so mid-range flows stay visible next to the very large home-state diagonal. Cells marked ${glossaryTerm(
        'suppressed',
        'np'
      )} were withheld.</p>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Lives in ↓ studies in →</th>
            ${ctx.data.origins.cols.map((c) => `<th class="right">${escapeHtml(abbreviate(c))}</th>`).join('')}
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>${cells}</tbody>
      </table>
    </div>`;
}

function renderMapMode(card: HTMLElement, ctx: Ctx): void {
  const { origins } = ctx.data;

  // DOMESTIC students only. Including overseas students makes every single
  // state an "importer" — they all take in students from outside Australia,
  // so the map comes out uniformly red and says nothing. Excluding them turns
  // it into the question that actually varies: do young people leave this
  // state to study, or come to it?
  const domesticRows = origins.rows.filter((r) => !/outside australia/i.test(r.origin));

  const flow = new Map<string, { studyHere: number; liveHere: number; overseasHere: number }>();
  origins.cols.forEach((col, ci) => {
    const studyHere = domesticRows.reduce((a, r) => a + (r.values[ci] ?? 0), 0);
    const overseasHere =
      origins.rows.find((r) => /outside australia/i.test(r.origin))?.values[ci] ?? 0;
    const liveHere = domesticRows.find((r) => r.origin === col)?.total ?? 0;
    flow.set(col, { studyHere, liveHere, overseasHere });
  });

  card.innerHTML = `
    <div class="chart-head">
      <h2>Do young people leave the state to study?</h2>
      <p>Shaded by the ratio of <strong>domestic</strong> students who study in a state to domestic students who live there. Above 1.0 the state takes in more students than it sends away; below 1.0 it loses them. Overseas students are excluded here on purpose — every state imports them, so including them shades the whole map the same colour and hides the interstate story. Hover a state for the numbers, click to see its universities.</p>
    </div>
    <div class="map-shell" id="or-map"></div>
    <div class="legend">
      <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#b91c1c"></span>Takes in domestic students</span>
      <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#cbd5e1"></span>Balanced (ratio 1.0)</span>
      <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#1e3a5f"></span>Loses domestic students</span>
      <span class="legend-item" style="cursor:default">Boundaries: ABS ASGS (CC BY 4.0)</span>
    </div>`;

  void renderStateMap(card.querySelector<HTMLElement>('#or-map')!, {
    valueFor: (stateName) => {
      const f = flow.get(stateName);
      if (!f || !f.liveHere) return null;
      return f.studyHere / f.liveHere;
    },
    tooltipFor: (stateName) => {
      const f = flow.get(stateName);
      if (!f || !f.liveHere) return `<strong>${escapeHtml(stateName)}</strong><br>No published data`;
      const ratio = f.studyHere / f.liveHere;
      const net = f.studyHere - f.liveHere;
      return `<strong>${escapeHtml(stateName)}</strong><br>
        Domestic students living here: ${formatNumber(f.liveHere)}<br>
        Domestic students studying here: ${formatNumber(f.studyHere)}<br>
        Net: <strong>${net >= 0 ? '+' : ''}${formatNumber(net)}</strong> (ratio ${ratio.toFixed(2)}) — ${
          ratio >= 1 ? 'takes in' : 'loses'
        } domestic students<br>
        <span style="opacity:.75">Plus ${formatNumber(f.overseasHere)} students from overseas</span>`;
    },
    domain: [0.8, 1.5],
    midpoint: 1,
    onSelect: (stateName) => ctx.goto('rankings', { m: 'students', state: stateName }),
  });
}

function abbreviate(name: string): string {
  return (
    {
      'New South Wales': 'NSW',
      Victoria: 'VIC',
      Queensland: 'QLD',
      'Western Australia': 'WA',
      'South Australia': 'SA',
      Tasmania: 'TAS',
      'Northern Territory': 'NT',
      'Australian Capital Territory': 'ACT',
      'Multi-State': 'Multi',
      'Outside Australia': 'Overseas',
    }[name] ?? name
  );
}
