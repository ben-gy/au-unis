// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Small SVG helpers. Building elements with createElementNS keeps data values
// out of innerHTML entirely, so nothing here can be broken by an institution
// name containing an ampersand or a quote.

const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined | null>;

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    el.setAttribute(k, String(v));
  }
  for (const c of children) el.append(c);
  return el;
}

export function chartSvg(width: number, height: number, label: string): SVGSVGElement {
  const svg = svgEl('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': label,
  });
  return svg;
}

/** Sparkline path for a series that may contain gaps. */
export function sparkline(
  values: (number | null)[],
  width: number,
  height: number,
  opts: { colour?: string; strokeWidth?: number } = {}
): SVGSVGElement {
  const svg = svgEl('svg', {
    class: 'spark',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    width,
    height,
    'aria-hidden': 'true',
  });
  const published = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (published.length < 2) return svg;

  const min = Math.min(...published);
  const max = Math.max(...published);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const toY = (v: number) => height - 2 - ((v - min) / span) * (height - 4);

  // A gap is a BREAK in the line, never a point at zero. Joining across a
  // suppressed year draws a plunge to the axis that never happened.
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = i * stepX;
    const yy = toY(v);
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)},${yy.toFixed(2)} `;
    pen = true;
  });

  svg.append(
    svgEl('path', {
      d: d.trim(),
      fill: 'none',
      stroke: opts.colour ?? 'var(--accent-primary)',
      'stroke-width': opts.strokeWidth ?? 1.5,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke',
    })
  );
  return svg;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: Box, b: Box): boolean {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

/**
 * Greedy label de-collision: keep a label only if it clears both the labels
 * already placed AND any fixed obstacles.
 *
 * Obstacles matter: checking labels against each other alone still lets a
 * label land squarely on top of a neighbouring data mark, which looks exactly
 * as broken as two overlapping labels.
 */
export function placeLabels<T extends Box>(candidates: T[], obstacles: Box[] = []): T[] {
  const placed: T[] = [];
  for (const c of candidates) {
    if (obstacles.some((o) => intersects(c, o))) continue;
    if (placed.some((p) => intersects(c, p))) continue;
    placed.push(c);
  }
  return placed;
}

/**
 * Place labels that each offer several candidate positions, taking the first
 * that clears everything.
 *
 * Single-position placement plus obstacle avoidance drops most labels in a
 * dense cluster — which is worse than a small overlap, because the labels that
 * get dropped are the big ones in the middle that most need naming. Offering
 * each label four corners around its mark keeps nearly all of them.
 */
export function placeLabelsMulti<P>(items: { payload: P; alternatives: Box[] }[], obstacles: Box[] = []): (Box & { payload: P })[] {
  const placed: (Box & { payload: P })[] = [];
  for (const item of items) {
    for (const box of item.alternatives) {
      if (obstacles.some((o) => intersects(box, o))) continue;
      if (placed.some((p) => intersects(box, p))) continue;
      placed.push({ ...box, payload: item.payload });
      break;
    }
  }
  return placed;
}
