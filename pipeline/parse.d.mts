// Types for the dependency-free parsing layer, so the TypeScript test suite
// can import it without loosening `strict`.

export type Cell = string | number | null | undefined;

export function parseNum(raw: Cell): number | null;
export function isSuppressed(raw: Cell): boolean;
export function isAggregateLabel(label: Cell): boolean;
export function cleanInstitution(raw: Cell): { code: string | null; name: string };
export function institutionKey(name: Cell): string;
export function cleanRateSeries(values: (number | null)[]): (number | null)[];
export function nullLeadingZeroRun(values: (number | null)[]): (number | null)[];
export function latest(values: (number | null)[]): { value: number | null; index: number };
export function median(values: (number | null)[]): number | null;
export function sumKnown(values: (number | null)[]): { total: number; known: number; missing: number };
export function findHeaderRow(
  rows: Cell[][],
  predicate: (row: Cell[]) => boolean,
  from?: number
): number;
export function yearColumns(headerRow: Cell[]): { year: number; col: number }[];
export function slugify(s: Cell): string;

export const STATES: string[];
export const STATE_CODES: Record<string, string>;
export const OUTCOMES: { key: string; label: string; tone: string }[];
