import type { Dataset, Institution } from './data';

/** Everything a view needs: the data, and the ways it can navigate. */
export interface Ctx {
  data: Dataset;
  /** Switch to another view, optionally with view-local state. */
  goto: (view: string, params?: Record<string, string>) => void;
  /** Open the institution drill-down panel. */
  openInstitution: (institution: Institution) => void;
  /** Read a view-local param from the hash. */
  param: (key: string) => string | null;
  /** Set a view-local param without a full re-render of the shell. */
  setParam: (key: string, value: string | null) => void;
}

export const VIEWS = [
  { id: 'rankings', label: 'Rankings' },
  { id: 'outcomes', label: 'Who finishes' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'origins', label: 'Origins' },
  { id: 'fields', label: 'Study areas' },
  { id: 'trends', label: 'Trends' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'insights', label: 'Insights' },
] as const;
