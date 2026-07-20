// Pure parsing + normalisation for the Department of Education higher education
// workbooks. No fs, no zlib, no network — everything here is a pure function so
// the test suite can import it directly and CI never needs `npm install` in
// this directory.
//
// Every function in this file exists because the raw data lies in a specific
// way. The comments name the lie.

/**
 * Values the department writes into otherwise-numeric columns.
 *
 *   np    "not published" — suppressed, usually a small cell
 *   < 5   suppressed small count (the real value is 1–4, not 0)
 *   .     no students in the base cohort
 *   n/a   not applicable
 *
 * `Number('np')` is NaN, which is at least loud. The dangerous ones are
 * `parseInt('< 5')` -> NaN and the extremely common `Number(x) || 0`, which
 * turns every suppressed cell into a confident zero. A suppressed cell is
 * NOT a zero and must never be summed as one.
 */
const SENTINELS = new Set(['np', 'n/a', 'na', '.', '..', '-', '–', '—', '', 'n.p.', 'np.']);

/** Parse a spreadsheet cell to a number, or null when it is not a real value. */
export function parseNum(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (SENTINELS.has(s.toLowerCase())) return null;
  // "< 5" / "<5" — suppressed small cell. Real value is 1–4; we know it is
  // non-zero but not what it is, so it stays null rather than becoming 0 or 5.
  if (/^<\s*\d+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}

/** True when a cell was suppressed rather than simply absent. */
export function isSuppressed(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'np' || s === 'n.p.' || /^<\s*\d+$/.test(s);
}

/**
 * Rows that are totals/subtotals sitting in the same column as real
 * institutions. Ranking these alongside institutions counts the country
 * several times over — Section 2 alone carries National Total, Table A
 * Providers, Table B Providers and a State Total per state.
 */
const AGGREGATE_PATTERNS = [
  /^national total/i,
  /^table [abc] providers?/i,
  /^state total/i,
  /^total(\s|$)/i,
  /^total \d{4}$/i,
  /^australia$/i,
  /^all providers?$/i,
  /^sub-?total/i,
  // Appears once per state as a bucket of many small providers, not as one
  // institution. Ranking it puts a whole sector category in the league table.
  /^non-university higher education institutions?$/i,
  /private universities \(table c\)/i,
  /^nuhei/i,
  /^% change/i,
  /^multi-?state$/i,
  /^grand total/i,
];

export function isAggregateLabel(label) {
  const s = String(label ?? '').trim();
  if (!s) return true;
  return AGGREGATE_PATTERNS.some((re) => re.test(s));
}

/**
 * Institution labels arrive with the provider code and footnote markers welded
 * into the name, and inconsistently between workbooks:
 *
 *   "Avondale University (2252)(1.08)"        -> 2252, Avondale University
 *   "University of New South Wales(1.03)"     -> null, University of New South Wales
 *   "3005 Charles Sturt University"           -> 3005, Charles Sturt University
 *
 * Codes are 4 digits; footnote markers are digits.digits. Keying on the raw
 * string makes the same university appear as two entities across workbooks,
 * which is how a join silently loses half its rows.
 */
export function cleanInstitution(raw) {
  let s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  let code = null;

  // Leading "3005 Name" form (staff workbooks).
  const lead = /^(\d{4})\s+(.*)$/.exec(s);
  if (lead) {
    code = lead[1];
    s = lead[2];
  }

  // Trailing "(3005)" form. Footnote markers always contain a dot, so a
  // bare 4-digit group is unambiguously the provider code.
  const codeMatch = [...s.matchAll(/\((\d{4})\)/g)];
  if (codeMatch.length) code = codeMatch[codeMatch.length - 1][1];

  const name = s
    .replace(/\(\d+\.\d+[a-z]?\)/gi, '') // footnote markers (1.03) (7.02)
    .replace(/\(\d{4}\)/g, '') // provider code
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,\s]+$/, '');

  return { code, name };
}

/**
 * Stable join key. Workbooks disagree on "The" and on punctuation
 * ("The University of Sydney" vs "University of Sydney").
 */
export function institutionKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * Rate series carry structural zeros that are not zeros.
 *
 * Avondale University reads 0, 0, 0, 0, 0, 0, 0, 0, 0, 12.65 across 2014-2023.
 * It did not have a 0% attrition rate for nine years — it was not a reporting
 * provider yet. Left as zeros it ranks as the single best-performing
 * institution in the country.
 *
 * An exact 0.00 rate is not credible for any provider large enough to clear
 * the department's own small-cell suppression, so exact zeros in a rate series
 * are treated as "not reporting" and nulled. Genuine values are never exactly
 * zero to two decimal places at these cohort sizes.
 */
export function cleanRateSeries(values) {
  return values.map((v) => (v === null || v === 0 ? null : v));
}

/**
 * Count series carry the same "not reporting yet" zeros as the rate series
 * (Avondale reads 0 completions 2015-2022, then 224 in 2023), but here an
 * interior zero can be genuine — a small provider really can graduate nobody
 * in a given year. So only the LEADING run of zeros is nulled, and only when
 * the series later becomes non-zero.
 */
export function nullLeadingZeroRun(values) {
  const firstReal = values.findIndex((v) => v !== null && v !== 0);
  if (firstReal <= 0) return values.slice();
  return values.map((v, i) => (i < firstReal ? null : v));
}

/** Last non-null value in a series, with its index. */
export function latest(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && values[i] !== undefined) return { value: values[i], index: i };
  }
  return { value: null, index: -1 };
}

/** Median of the non-null values. Returns null when there is nothing to rank. */
export function median(values) {
  const xs = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Sum that propagates "unknown": suppressed cells must not read as zero. */
export function sumKnown(values) {
  let total = 0;
  let known = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    total += v;
    known++;
  }
  return { total, known, missing: values.length - known };
}

/**
 * Find the row index whose cells match a header predicate, starting the search
 * at `from`. The workbooks put a "< Back to Contents >" link on row 1 and a
 * title on row 2, and the real header is somewhere after that — but not always
 * on the same row, so it has to be located by content.
 */
export function findHeaderRow(rows, predicate, from = 0) {
  for (let i = from; i < rows.length; i++) {
    if (predicate(rows[i] ?? [])) return i;
  }
  return -1;
}

/**
 * Read the year columns out of a header row, returning [{ year, col }].
 * Used for the 2014..2024 series tables.
 */
export function yearColumns(headerRow) {
  const out = [];
  headerRow.forEach((cell, col) => {
    const m = /^(19|20)\d{2}$/.exec(String(cell ?? '').trim());
    if (m) out.push({ year: Number(m[0]), col });
  });
  return out;
}

/** Slug for hash routing and file names. */
export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const STATES = [
  'New South Wales',
  'Victoria',
  'Queensland',
  'Western Australia',
  'South Australia',
  'Tasmania',
  'Northern Territory',
  'Australian Capital Territory',
];

export const STATE_CODES = {
  'New South Wales': 'NSW',
  Victoria: 'VIC',
  Queensland: 'QLD',
  'Western Australia': 'WA',
  'South Australia': 'SA',
  Tasmania: 'TAS',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT',
  'Multi-State': 'MULTI',
};

/**
 * The four mutually exclusive cohort outcomes in Section 17, in the order they
 * should always be stacked: good -> neutral -> bad. "Still enrolled" sits
 * second deliberately. It is NOT a failure — many degrees run longer than four
 * years — and colouring it as one is how "60% of students don't finish" gets
 * published every year.
 */
export const OUTCOMES = [
  { key: 'completed', label: 'Completed', tone: 'good' },
  { key: 'stillEnrolled', label: 'Still enrolled', tone: 'neutral' },
  { key: 'droppedOut', label: 'Re-enrolled, then left', tone: 'bad' },
  { key: 'neverReturned', label: 'Never came back after first year', tone: 'worst' },
];
