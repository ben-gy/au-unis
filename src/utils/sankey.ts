// Two-column Sankey layout. Pure geometry — no DOM, no libs — so the position
// assertions in tests/sankey.test.ts can check it directly.
//
// Nodes are stacked in each column proportional to their throughput; links
// leave a source and enter a target at running offsets so that the ribbons
// entering a node exactly fill its height with no gaps and no overlap.

export interface SankeyInput {
  sources: string[];
  targets: string[];
  /** value[sourceIndex][targetIndex]; null/0 links are dropped. */
  values: (number | null)[][];
}

export interface SankeyNode {
  id: string;
  name: string;
  side: 'source' | 'target';
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
}

export interface SankeyLink {
  sourceIndex: number;
  targetIndex: number;
  source: string;
  target: string;
  value: number;
  /** Vertical extent where the ribbon leaves the source / enters the target. */
  y0: number;
  y1: number;
  width: number;
  path: string;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total: number;
}

export interface SankeyOptions {
  width: number;
  height: number;
  nodeWidth?: number;
  padding?: number;
}

export function sankey(input: SankeyInput, options: SankeyOptions): SankeyLayout {
  const { width, height } = options;
  const nodeWidth = options.nodeWidth ?? 16;
  const padding = options.padding ?? 8;

  const sourceTotals = input.sources.map((_, si) =>
    input.targets.reduce((acc, _t, ti) => acc + Math.max(0, input.values[si]?.[ti] ?? 0), 0)
  );
  const targetTotals = input.targets.map((_, ti) =>
    input.sources.reduce((acc, _s, si) => acc + Math.max(0, input.values[si]?.[ti] ?? 0), 0)
  );

  const total = sourceTotals.reduce((a, b) => a + b, 0);

  // Only nodes carrying value take up space; a zero node would otherwise
  // consume a padding gap and push everything else off the canvas.
  const liveSources = input.sources.map((n, i) => ({ n, i, v: sourceTotals[i] })).filter((d) => d.v > 0);
  const liveTargets = input.targets.map((n, i) => ({ n, i, v: targetTotals[i] })).filter((d) => d.v > 0);

  const scaleFor = (live: { v: number }[]) => {
    const gaps = Math.max(0, live.length - 1) * padding;
    const usable = Math.max(1, height - gaps);
    const sum = live.reduce((a, b) => a + b.v, 0);
    return sum > 0 ? usable / sum : 0;
  };
  const sourceScale = scaleFor(liveSources);
  const targetScale = scaleFor(liveTargets);

  const nodes: SankeyNode[] = [];
  const sourceGeom = new Map<number, { y: number; h: number }>();
  const targetGeom = new Map<number, { y: number; h: number }>();

  let y = 0;
  for (const d of liveSources) {
    const h = d.v * sourceScale;
    sourceGeom.set(d.i, { y, h });
    nodes.push({
      id: `s${d.i}`,
      name: d.n,
      side: 'source',
      index: d.i,
      x: 0,
      y,
      w: nodeWidth,
      h,
      value: d.v,
    });
    y += h + padding;
  }

  y = 0;
  for (const d of liveTargets) {
    const h = d.v * targetScale;
    targetGeom.set(d.i, { y, h });
    nodes.push({
      id: `t${d.i}`,
      name: d.n,
      side: 'target',
      index: d.i,
      x: width - nodeWidth,
      y,
      w: nodeWidth,
      h,
      value: d.v,
    });
    y += h + padding;
  }

  // Running offsets so ribbons stack flush inside each node.
  const sourceOffset = new Map<number, number>();
  const targetOffset = new Map<number, number>();

  const links: SankeyLink[] = [];
  for (const s of liveSources) {
    for (const t of liveTargets) {
      const value = Math.max(0, input.values[s.i]?.[t.i] ?? 0);
      if (value <= 0) continue;
      const sg = sourceGeom.get(s.i)!;
      const tg = targetGeom.get(t.i)!;
      const so = sourceOffset.get(s.i) ?? 0;
      const to = targetOffset.get(t.i) ?? 0;

      const wS = value * sourceScale;
      const wT = value * targetScale;
      const y0 = sg.y + so + wS / 2;
      const y1 = tg.y + to + wT / 2;

      sourceOffset.set(s.i, so + wS);
      targetOffset.set(t.i, to + wT);

      const x0 = nodeWidth;
      const x1 = width - nodeWidth;
      const cx = (x0 + x1) / 2;

      links.push({
        sourceIndex: s.i,
        targetIndex: t.i,
        source: s.n,
        target: t.n,
        value,
        y0,
        y1,
        width: Math.max(wS, 0.5),
        path: `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}`,
      });
    }
  }

  return { nodes, links, total };
}
