import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  formatPercent,
  formatRatio,
  formatCompact,
  formatSigned,
  ordinal,
  escapeHtml,
  tipText,
  tipAttr,
  NOT_PUBLISHED,
} from '../src/format';

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1676077)).toBe('1,676,077');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-1234)).toBe('-1,234');
  });

  it('renders null as "not published", never as 0', () => {
    // The whole point: a withheld cell must never read as a real zero.
    expect(formatNumber(null)).toBe(NOT_PUBLISHED);
    expect(formatNumber(undefined)).toBe(NOT_PUBLISHED);
    expect(formatNumber(NaN)).toBe(NOT_PUBLISHED);
  });

  it('honours a decimal count', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });
});

describe('formatPercent', () => {
  it('formats to one decimal by default', () => {
    expect(formatPercent(50.75)).toBe('50.8%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('renders null as "not published"', () => {
    expect(formatPercent(null)).toBe(NOT_PUBLISHED);
  });
});

describe('formatRatio', () => {
  it('formats to one decimal', () => {
    expect(formatRatio(22.83)).toBe('22.8');
  });
  it('renders null as "not published"', () => {
    expect(formatRatio(null)).toBe(NOT_PUBLISHED);
  });
});

describe('formatCompact', () => {
  it('abbreviates by magnitude', () => {
    expect(formatCompact(1676077)).toBe('1.68m');
    expect(formatCompact(35003)).toBe('35k');
    expect(formatCompact(1500)).toBe('1.5k');
    expect(formatCompact(250)).toBe('250');
  });

  it('renders null as a dash for axis use', () => {
    expect(formatCompact(null)).toBe('—');
  });
});

describe('formatSigned', () => {
  it('always shows the sign for a positive change', () => {
    expect(formatSigned(12.3)).toBe('+12.3%');
    expect(formatSigned(-4.5)).toBe('-4.5%');
  });

  it('renders null as "not published"', () => {
    expect(formatSigned(null)).toBe(NOT_PUBLISHED);
  });
});

describe('ordinal', () => {
  it('handles the common cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(21)).toBe('21st');
  });

  it('handles the teens, which are all "th"', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });
});

describe('tipAttr — for innerHTML interpolation', () => {
  it('escapes quotes so the attribute cannot be terminated early', () => {
    // An unescaped quote in a data-tip value ends the attribute and mangles
    // the element — this is why tooltip text is never interpolated raw.
    expect(tipAttr('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('encodes newlines so multi-line tooltips survive attribute parsing', () => {
    expect(tipAttr('a\nb')).toBe('a&#10;b');
  });

  it('escapes markup rather than passing it through', () => {
    expect(tipAttr('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('tipText — for setAttribute', () => {
  it('keeps real newlines instead of entity-encoding them', () => {
    // setAttribute takes a raw string and the HTML parser never sees it, so
    // an entity reference is NOT decoded: passing '&#10;' here renders the
    // literal characters "&#10;" in the tooltip. This shipped once.
    expect(tipText('a\nb')).toBe('a\nb');
    expect(tipText('a\nb')).not.toContain('&#10;');
  });

  it('leaves quotes and markup alone — nothing re-parses this value', () => {
    expect(tipText('say "hi"')).toBe('say "hi"');
    expect(tipText('<b>x</b>')).toBe('<b>x</b>');
  });
});
