// Positional tests for the Sankey layout.
//
// Area/total-only assertions pass on visually broken flow diagrams — a layout
// that stacks every ribbon at the same offset conserves total value perfectly
// and renders as a single smear. What catches that is asserting that ribbons
// stack FLUSH inside their node (no gaps, no overlap) and that nodes stay
// inside the canvas.
import { describe, expect, it } from 'vitest';
import { sankey } from '../src/utils/sankey';
import type { SankeyInput } from '../src/utils/sankey';

const EPS = 1e-6;

function fixture(): SankeyInput {
  return {
    sources: ['NSW', 'VIC', 'Outside Australia'],
    targets: ['NSW', 'VIC', 'QLD'],
    values: [
      [275720, 13354, 9902],
      [22028, 232690, 5870],
      [203561, 204773, 62848],
    ],
  };
}

describe('sankey layout — positional correctness', () => {
  const width = 900;
  const height = 600;

  it('places every node inside the canvas with finite geometry', () => {
    const layout = sankey(fixture(), { width, height });
    expect(layout.nodes.length).toBe(6);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.w) && Number.isFinite(n.h)).toBe(true);
      expect(n.h).toBeGreaterThan(0);
      expect(n.x).toBeGreaterThanOrEqual(-EPS);
      expect(n.y).toBeGreaterThanOrEqual(-EPS);
      expect(n.x + n.w).toBeLessThanOrEqual(width + EPS);
      expect(n.y + n.h).toBeLessThanOrEqual(height + EPS);
    }
  });

  it('puts sources on the left edge and targets on the right edge', () => {
    const layout = sankey(fixture(), { width, height, nodeWidth: 16 });
    for (const n of layout.nodes) {
      if (n.side === 'source') expect(n.x).toBe(0);
      else expect(n.x).toBeCloseTo(width - 16, 6);
    }
  });

  it('does not overlap nodes within a column', () => {
    const layout = sankey(fixture(), { width, height });
    for (const side of ['source', 'target'] as const) {
      const col = layout.nodes.filter((n) => n.side === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) {
        expect(col[i].y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h - EPS);
      }
    }
  });

  it('sizes nodes proportionally to their throughput', () => {
    const layout = sankey(fixture(), { width, height });
    const sources = layout.nodes.filter((n) => n.side === 'source');
    const nsw = sources.find((n) => n.name === 'NSW')!;
    const vic = sources.find((n) => n.name === 'VIC')!;
    // NSW total 298,976 vs VIC 260,588 — heights must hold the same ratio.
    expect(nsw.h / vic.h).toBeCloseTo(nsw.value / vic.value, 5);
  });

  it('fills each column exactly, gaps included', () => {
    const padding = 8;
    const layout = sankey(fixture(), { width, height, padding });
    for (const side of ['source', 'target'] as const) {
      const col = layout.nodes.filter((n) => n.side === side);
      const used = col.reduce((a, n) => a + n.h, 0) + (col.length - 1) * padding;
      expect(Math.abs(used - height)).toBeLessThan(1e-6 * height + 1e-6);
    }
  });

  it('stacks ribbons flush inside each node — no gaps and no overlap', () => {
    const layout = sankey(fixture(), { width, height });
    for (const node of layout.nodes.filter((n) => n.side === 'source')) {
      const links = layout.links
        .filter((l) => l.sourceIndex === node.index)
        .sort((a, b) => a.y0 - b.y0);
      // Ribbon extents are centre-based; reconstruct edges and check they
      // tile the node exactly from top to bottom.
      let cursor = node.y;
      for (const l of links) {
        const top = l.y0 - l.width / 2;
        expect(Math.abs(top - cursor)).toBeLessThan(1e-5);
        cursor = l.y0 + l.width / 2;
      }
      expect(Math.abs(cursor - (node.y + node.h))).toBeLessThan(1e-5);
    }
  });

  it('emits one link per non-zero cell and none for zero or null cells', () => {
    const input = fixture();
    input.values[1][2] = 0;
    input.values[0][2] = null;
    const layout = sankey(input, { width, height });
    expect(layout.links).toHaveLength(7);
    expect(layout.links.some((l) => l.source === 'VIC' && l.target === 'QLD')).toBe(false);
    expect(layout.links.some((l) => l.source === 'NSW' && l.target === 'QLD')).toBe(false);
  });

  it('produces a path string with only finite coordinates', () => {
    const layout = sankey(fixture(), { width, height });
    for (const l of layout.links) {
      expect(l.path).not.toMatch(/NaN|Infinity|undefined/);
      expect(l.width).toBeGreaterThan(0);
    }
  });

  it('conserves total value across the links', () => {
    const layout = sankey(fixture(), { width, height });
    const sum = layout.links.reduce((a, l) => a + l.value, 0);
    expect(sum).toBe(layout.total);
  });

  it('handles degenerates without NaN: empty, all-zero, single flow', () => {
    const empty = sankey({ sources: [], targets: [], values: [] }, { width, height });
    expect(empty.nodes).toEqual([]);
    expect(empty.links).toEqual([]);

    const zero = sankey({ sources: ['A'], targets: ['B'], values: [[0]] }, { width, height });
    expect(zero.nodes).toEqual([]);
    expect(zero.links).toEqual([]);

    const one = sankey({ sources: ['A'], targets: ['B'], values: [[100]] }, { width, height });
    expect(one.nodes).toHaveLength(2);
    expect(one.nodes[0].h).toBeCloseTo(height, 6);
    expect(one.links).toHaveLength(1);
    for (const n of one.nodes) expect(Number.isFinite(n.y)).toBe(true);
  });

  it('drops an empty node rather than letting it consume a padding gap', () => {
    const layout = sankey(
      { sources: ['A', 'Empty', 'B'], targets: ['X'], values: [[10], [0], [20]] },
      { width, height, padding: 10 }
    );
    expect(layout.nodes.filter((n) => n.side === 'source')).toHaveLength(2);
    const col = layout.nodes.filter((n) => n.side === 'source');
    const used = col.reduce((a, n) => a + n.h, 0) + (col.length - 1) * 10;
    expect(Math.abs(used - height)).toBeLessThan(1e-6 * height + 1e-6);
  });
});
