// Display formatting. Every formatter takes `number | null` and renders null
// as an explicit "not published" rather than 0, — or an empty cell, both of
// which read as a real value.

export const NOT_PUBLISHED = 'not published';

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_PUBLISHED;
  return value.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_PUBLISHED;
  return `${value.toFixed(decimals)}%`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_PUBLISHED;
  return value.toFixed(1);
}

/** 1676077 -> "1.68m", 35003 -> "35.0k". For axis ticks and tight tiles. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatSigned(value: number | null | undefined, decimals = 1, suffix = '%'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_PUBLISHED;
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}${suffix}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Escape text destined for innerHTML. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tooltip text for `element.setAttribute('data-tip', …)`.
 *
 * setAttribute takes a raw string — the HTML parser never sees it, so entity
 * references are NOT decoded. Passing `&#10;` here puts the literal six
 * characters "&#10;" in the tooltip. Real newlines are what is wanted; they
 * render because .hover-tip sets `white-space: pre-line`.
 */
export function tipText(text: string): string {
  return text;
}

/**
 * Tooltip text interpolated into an HTML attribute inside a template string
 * that will be assigned to innerHTML.
 *
 * Here the parser DOES decode entities, so quotes and angle brackets must be
 * escaped (an unescaped quote ends the attribute early and mangles the
 * element) and newlines must become `&#10;` to survive attribute parsing.
 *
 * Using the wrong one of these two is silent: it renders as literal `&#10;`
 * noise, or as a broken element. Match the function to the sink.
 */
export function tipAttr(text: string): string {
  return escapeHtml(text).replace(/\n/g, '&#10;');
}
