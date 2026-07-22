// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Types and loading for the pipeline's JSON output.
//
// Every numeric field is `number | null`. Null means "the department did not
// publish this", which is NOT zero — see pipeline/parse.mjs. Treating a
// suppressed cell as zero is the single easiest way to publish a wrong number
// from this dataset, so the type system is kept deliberately annoying about it.

export type Maybe = number | null;

export interface Series {
  years: number[];
  series: Maybe[];
  latest: Maybe;
  /** 'sector' | 'provider' | 'n/a' — which denominator this rate uses. */
  basis?: string;
}

export interface Institution {
  key: string;
  code: string | null;
  name: string;
  slug: string;
  state: string | null;
  stateCode: string | null;
  notes: string[];
  students: Maybe;
  domestic: Maybe;
  overseas: Maybe;
  overseasShare: Maybe;
  citizenship?: Record<string, Maybe>;
  levels?: Record<string, Maybe>;
  gender?: { males: Maybe; females: Maybe; other: Maybe };
  fields?: Record<string, Maybe>;
  completions?: Series;
  attritionDomestic?: Series;
  attritionOverseas?: Series;
  attritionAll?: Series;
  retentionDomestic?: Series;
  retentionOverseas?: Series;
  retentionAll?: Series;
  successDomestic?: Series;
  successOverseas?: Series;
  successAll?: Series;
  staffRatio?: { years: number[]; academic: Maybe[]; professional: Maybe[] };
  staffRatioLatest?: Maybe;
  load?: { years: number[]; eftsl: Maybe[] };
}

export interface OutcomePoint {
  duration: string;
  cohort: string;
  completed: number;
  stillEnrolled: Maybe;
  droppedOut: Maybe;
  neverReturned: Maybe;
}

export interface OutcomeGroup {
  group: string;
  label: string;
  categories: { category: string; points: OutcomePoint[] }[];
}

export interface Outcomes {
  groups: OutcomeGroup[];
  durations: string[];
}

export interface OriginRow {
  origin: string;
  values: Maybe[];
  total: number;
  withheld: number;
  suppressedCells: number;
}

export interface Origins {
  cols: string[];
  rows: OriginRow[];
  grandTotal: number;
}

export interface Insight {
  severity: 'info' | 'warn' | 'alert';
  title: string;
  body: string;
  view: string;
}

export interface National {
  studentYear: number;
  staffYear: number;
  totalStudents: number;
  institutionStudents: number;
  nuheiStudents: number;
  overseasStudents: number;
  fields: { name: string; value: number }[];
  series: {
    commencing?: NationalSeries;
    enrolments?: NationalSeries;
    equity?: { years: number[]; rows: { label: string; vintage: string | null; series: Maybe[]; points: number }[] };
  };
  medians: Record<string, Maybe>;
  insights: Insight[];
}

export interface NationalSeries {
  years: number[];
  total: Maybe[];
  domestic: Maybe[];
  overseas: Maybe[];
  levels: { label: string; series: Maybe[] }[];
}

export interface Meta {
  generatedAt: string;
  studentDataYear: number;
  staffDataYear: number;
  sources: { filename: string; year: number; bytes: number; source: string }[];
}

export interface Dataset {
  institutions: Institution[];
  outcomes: Outcomes;
  origins: Origins;
  national: National;
  meta: Meta;
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadDataset(signal: AbortSignal): Promise<Dataset> {
  const [institutions, outcomes, origins, national, meta] = await Promise.all([
    fetchJson<Institution[]>('data/institutions.json', signal),
    fetchJson<Outcomes>('data/outcomes.json', signal),
    fetchJson<Origins>('data/origins.json', signal),
    fetchJson<National>('data/national.json', signal),
    fetchJson<Meta>('data/meta.json', signal),
  ]);
  return { institutions, outcomes, origins, national, meta };
}

/** Colour for a broad field of education, stable across every view. */
const FIELD_COLOURS: Record<string, string> = {
  'Management and Commerce': '#1e3a5f',
  'Society and Culture': '#0f766e',
  Health: '#b91c1c',
  'Information Technology': '#d97706',
  Education: '#6d28d9',
  'Engineering and Related Technologies': '#0369a1',
  'Natural and Physical Sciences': '#15803d',
  'Creative Arts': '#be185d',
  'Architecture and Building': '#7c5e10',
  'Agriculture, Environmental and Related Studies': '#4d7c0f',
  'Food, Hospitality and Personal Services': '#a16207',
  'Mixed Field Programmes': '#64748b',
  'Non-award courses': '#94a3b8',
};

export function fieldColour(name: string): string {
  return FIELD_COLOURS[name] ?? '#64748b';
}

export const STATE_COLOURS: Record<string, string> = {
  'New South Wales': '#1e3a5f',
  Victoria: '#0f766e',
  Queensland: '#b45309',
  'Western Australia': '#6d28d9',
  'South Australia': '#b91c1c',
  Tasmania: '#0369a1',
  'Northern Territory': '#4d7c0f',
  'Australian Capital Territory': '#be185d',
  'Multi-State': '#64748b',
  'Outside Australia': '#d97706',
};

export function stateColour(name: string): string {
  return STATE_COLOURS[name] ?? '#94a3b8';
}
