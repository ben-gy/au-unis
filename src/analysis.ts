// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Pure analysis: metric definitions, ranking, scales, binning.
// No DOM here — everything in this file is directly unit-tested.

import type { Institution, Maybe, Outcomes, OutcomeGroup } from './data';

export interface Metric {
  key: string;
  label: string;
  short: string;
  unit: 'count' | 'percent' | 'ratio';
  /** true when a HIGHER value is the better outcome for a student. */
  higherIsBetter: boolean | null;
  get: (i: Institution) => Maybe;
  describe: string;
}

export const METRICS: Metric[] = [
  {
    key: 'students',
    label: 'Total students',
    short: 'Students',
    unit: 'count',
    higherIsBetter: null,
    get: (i) => i.students,
    describe: 'Everyone enrolled in 2024, domestic and overseas, at every level from sub-bachelor to doctorate.',
  },
  {
    key: 'overseasShare',
    label: 'International share',
    short: 'International %',
    unit: 'percent',
    higherIsBetter: null,
    get: (i) => i.overseasShare,
    describe:
      'The share of all students who are overseas students. Neither good nor bad in itself, but it measures how exposed an institution is to a change in student visa policy.',
  },
  {
    key: 'attritionDomestic',
    label: 'Domestic drop-out rate (sector)',
    short: 'Drop-out %',
    unit: 'percent',
    higherIsBetter: false,
    get: (i) => i.attritionDomestic?.latest ?? null,
    describe:
      'Share of commencing domestic bachelor students who left higher education entirely after first year. Sector basis — transferring to another university does not count as leaving.',
  },
  {
    key: 'attritionOverseas',
    label: 'Overseas drop-out rate (provider)',
    short: 'O/S drop-out %',
    unit: 'percent',
    higherIsBetter: false,
    get: (i) => i.attritionOverseas?.latest ?? null,
    describe:
      'Share of commencing overseas bachelor students who left THIS institution after first year. Provider basis, so a transfer counts as leaving — not comparable with the domestic figure.',
  },
  {
    key: 'retentionAll',
    label: 'Retention rate',
    short: 'Retention %',
    unit: 'percent',
    higherIsBetter: true,
    get: (i) => i.retentionAll?.latest ?? null,
    describe: 'Share of all commencing bachelor students still studying the following year.',
  },
  {
    key: 'successAll',
    label: 'Subject success rate',
    short: 'Success %',
    unit: 'percent',
    higherIsBetter: true,
    get: (i) => i.successAll?.latest ?? null,
    describe: 'Share of enrolled study load that students actually passed.',
  },
  {
    key: 'staffRatio',
    label: 'Students per academic staff',
    short: 'Student:staff',
    unit: 'ratio',
    higherIsBetter: false,
    get: (i) => i.staffRatioLatest ?? null,
    describe:
      'Student load per full-time-equivalent academic, including casual staff. Lower generally means more access to teaching staff.',
  },
  {
    key: 'completions',
    label: 'Graduates a year',
    short: 'Graduates',
    unit: 'count',
    higherIsBetter: null,
    get: (i) => i.completions?.latest ?? null,
    describe: 'Award course completions in the latest year — how many people actually graduated.',
  },
];

export function metricByKey(key: string): Metric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export interface Ranked {
  institution: Institution;
  value: number;
  rank: number;
}

/**
 * Rank institutions on a metric, best first when the metric has a direction
 * and largest first when it does not. Institutions with no published value are
 * excluded rather than sorted to the bottom — an unranked institution is not
 * the worst one.
 */
export function rankBy(institutions: Institution[], metric: Metric): Ranked[] {
  const withValue = institutions
    .map((institution) => ({ institution, value: metric.get(institution) }))
    .filter((r): r is { institution: Institution; value: number } => r.value !== null && Number.isFinite(r.value));

  const descending = metric.higherIsBetter !== false;
  withValue.sort((a, b) => (descending ? b.value - a.value : a.value - b.value));
  return withValue.map((r, index) => ({ ...r, rank: index + 1 }));
}

/** Rank of one institution on a metric, or null when it has no value. */
export function rankOf(institutions: Institution[], metric: Metric, key: string): { rank: number; of: number } | null {
  const ranked = rankBy(institutions, metric);
  const hit = ranked.findIndex((r) => r.institution.key === key);
  return hit < 0 ? null : { rank: hit + 1, of: ranked.length };
}

export function mean(values: Maybe[]): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(values: Maybe[]): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function extent(values: Maybe[]): [number, number] {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!xs.length) return [0, 1];
  return [Math.min(...xs), Math.max(...xs)];
}

/** Linear scale mapping [d0,d1] onto [r0,r1], degenerate-domain safe. */
export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/**
 * Log scale for strongly right-skewed magnitudes (enrolment counts span
 * 1,000 to 80,000). Non-positive inputs are clamped to the domain floor rather
 * than producing -Infinity.
 */
export function logScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const d0 = Math.max(domain[0], 1);
  const d1 = Math.max(domain[1], d0 * 10);
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const [r0, r1] = range;
  return (v: number) => {
    const clamped = Math.max(v, d0);
    return r0 + ((Math.log10(clamped) - l0) / (l1 - l0)) * (r1 - r0);
  };
}

/** Human-friendly axis ticks covering [min,max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export interface Bin {
  x0: number;
  x1: number;
  items: Institution[];
}

/**
 * Equal-width histogram bins. Deliberately NOT quantile bins: with a skewed
 * distribution quantile bins hide the very spread the histogram exists to
 * show, and put wildly different values in the same bucket.
 */
export function histogram(institutions: Institution[], metric: Metric, binCount = 12): Bin[] {
  const values = institutions.map((i) => metric.get(i));
  const [min, max] = extent(values);
  if (max <= min) return [{ x0: min, x1: min + 1, items: institutions }];
  const step = (max - min) / binCount;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * step,
    x1: min + (i + 1) * step,
    items: [],
  }));
  for (const institution of institutions) {
    const v = metric.get(institution);
    if (v === null || !Number.isFinite(v)) continue;
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / step)));
    bins[idx].items.push(institution);
  }
  return bins;
}

/** Percent change between the first and last published points of a series. */
export function seriesChange(series: Maybe[]): number | null {
  const published = series.filter((v): v is number => v !== null && Number.isFinite(v));
  if (published.length < 2) return null;
  const first = published[0];
  const last = published[published.length - 1];
  if (!first) return null;
  return ((last - first) / first) * 100;
}

/** The last point of a cohort attribute at a given timeframe. */
export function outcomeAt(group: OutcomeGroup, category: string, duration: string) {
  const cat = group.categories.find((c) => c.category === category);
  if (!cat) return null;
  const points = cat.points.filter((p) => p.duration === duration);
  return points.length ? points[points.length - 1] : null;
}

/** Groups worth offering in the Outcomes selector, in a sensible order. */
export function outcomeGroups(outcomes: Outcomes): OutcomeGroup[] {
  const preferred = [
    'Australian Tertiary Admission Rank (ATAR) - for school leavers',
    'National Totals',
    'Socio-Economic Status',
    'Regional Classification',
    'Indigenous Indicator',
    'Disability Indicator',
    'Type of Attendance',
    'Mode of Attendance',
    'Age',
    'Gender',
    'Basis for Admission',
    'Non-English Speaking Background (NESB) Indicator',
    'Liability Category',
    'Course Level',
    'Broad Field of Education',
  ];
  const order = new Map(preferred.map((p, i) => [p, i]));
  return [...outcomes.groups].sort(
    (a, b) => (order.get(a.group) ?? 999) - (order.get(b.group) ?? 999) || a.group.localeCompare(b.group)
  );
}
