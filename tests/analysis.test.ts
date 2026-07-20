import { describe, expect, it } from 'vitest';
import {
  METRICS,
  metricByKey,
  rankBy,
  rankOf,
  median,
  mean,
  extent,
  linearScale,
  logScale,
  niceTicks,
  histogram,
  seriesChange,
} from '../src/analysis';
import type { Institution } from '../src/data';

function inst(partial: Partial<Institution> & { key: string; name: string }): Institution {
  return {
    code: null,
    slug: partial.key,
    state: 'New South Wales',
    stateCode: 'NSW',
    notes: [],
    students: null,
    domestic: null,
    overseas: null,
    overseasShare: null,
    ...partial,
  } as Institution;
}

const pool: Institution[] = [
  inst({ key: 'a', name: 'A', students: 100, overseasShare: 10 }),
  inst({ key: 'b', name: 'B', students: 300, overseasShare: 50 }),
  inst({ key: 'c', name: 'C', students: 200, overseasShare: null }),
];

describe('metricByKey', () => {
  it('finds each declared metric', () => {
    for (const m of METRICS) expect(metricByKey(m.key).key).toBe(m.key);
  });

  it('falls back to the first metric for an unknown key', () => {
    expect(metricByKey('nonsense').key).toBe(METRICS[0].key);
  });
});

describe('rankBy', () => {
  it('ranks largest first for a directionless metric', () => {
    const ranked = rankBy(pool, metricByKey('students'));
    expect(ranked.map((r) => r.institution.key)).toEqual(['b', 'c', 'a']);
    expect(ranked[0].rank).toBe(1);
  });

  it('ranks lowest first when lower is better', () => {
    const metric = { ...metricByKey('students'), higherIsBetter: false };
    const ranked = rankBy(pool, metric);
    expect(ranked.map((r) => r.institution.key)).toEqual(['a', 'c', 'b']);
  });

  it('excludes unpublished values instead of ranking them last', () => {
    // An institution with no published figure is not the worst one — it is
    // simply not comparable, so it must not appear in the ranking at all.
    const ranked = rankBy(pool, metricByKey('overseasShare'));
    expect(ranked).toHaveLength(2);
    expect(ranked.some((r) => r.institution.key === 'c')).toBe(false);
  });

  it('returns an empty ranking when nothing is published', () => {
    expect(rankBy([inst({ key: 'z', name: 'Z' })], metricByKey('students'))).toEqual([]);
  });
});

describe('rankOf', () => {
  it('reports rank and field size', () => {
    expect(rankOf(pool, metricByKey('students'), 'b')).toEqual({ rank: 1, of: 3 });
  });

  it('returns null for an institution with no published value', () => {
    expect(rankOf(pool, metricByKey('overseasShare'), 'c')).toBeNull();
  });
});

describe('median / mean / extent', () => {
  it('ignores nulls rather than counting them as zero', () => {
    expect(median([1, null, 3])).toBe(2);
    expect(mean([2, null, 4])).toBe(3);
    expect(extent([5, null, 1])).toEqual([1, 5]);
  });

  it('returns null / a safe default when empty', () => {
    expect(median([])).toBeNull();
    expect(mean([null])).toBeNull();
    expect(extent([])).toEqual([0, 1]);
  });
});

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(100);
  });

  it('does not divide by zero on a degenerate domain', () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(Number.isFinite(s(5))).toBe(true);
    expect(s(5)).toBe(50);
  });
});

describe('logScale', () => {
  it('is monotonic across orders of magnitude', () => {
    const s = logScale([1000, 100000], [0, 500]);
    expect(s(1000)).toBeLessThan(s(10000));
    expect(s(10000)).toBeLessThan(s(100000));
  });

  it('clamps non-positive input instead of producing -Infinity', () => {
    const s = logScale([1000, 100000], [0, 500]);
    expect(Number.isFinite(s(0))).toBe(true);
    expect(Number.isFinite(s(-5))).toBe(true);
  });
});

describe('niceTicks', () => {
  it('produces round ticks inside the range', () => {
    const ticks = niceTicks(0, 100, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it('degrades safely when max <= min', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(10, 1)).toEqual([10]);
  });
});

describe('histogram', () => {
  const metric = metricByKey('students');

  it('uses equal-width bins so the spread stays visible', () => {
    // Quantile bins would put 100 and 300 in equally-sized buckets and hide
    // exactly the skew a histogram exists to show.
    const bins = histogram(pool, metric, 4);
    const widths = bins.map((b) => b.x1 - b.x0);
    for (const w of widths) expect(w).toBeCloseTo(widths[0], 9);
  });

  it('places every published institution in exactly one bin', () => {
    const bins = histogram(pool, metric, 4);
    const total = bins.reduce((a, b) => a + b.items.length, 0);
    expect(total).toBe(3);
  });

  it('puts the maximum value in the last bin, not past the end', () => {
    const bins = histogram(pool, metric, 4);
    expect(bins[bins.length - 1].items.map((i) => i.key)).toContain('b');
  });

  it('skips institutions with no published value', () => {
    const bins = histogram(pool, metricByKey('overseasShare'), 4);
    const keys = bins.flatMap((b) => b.items.map((i) => i.key));
    expect(keys).not.toContain('c');
  });

  it('degrades safely when every value is identical', () => {
    const flat = [inst({ key: 'x', name: 'X', students: 5 }), inst({ key: 'y', name: 'Y', students: 5 })];
    const bins = histogram(flat, metric, 4);
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.every((b) => Number.isFinite(b.x0) && Number.isFinite(b.x1))).toBe(true);
  });
});

describe('seriesChange', () => {
  it('measures first published to last published', () => {
    expect(seriesChange([100, 150])).toBeCloseTo(50, 9);
  });

  it('skips gaps rather than treating them as zero', () => {
    // A null year must not read as a collapse to zero and back.
    expect(seriesChange([100, null, 200])).toBeCloseTo(100, 9);
  });

  it('returns null when there is not enough published data', () => {
    expect(seriesChange([null, 5])).toBeNull();
    expect(seriesChange([])).toBeNull();
  });

  it('returns null rather than Infinity when the base is zero', () => {
    expect(seriesChange([0, 50])).toBeNull();
  });
});
