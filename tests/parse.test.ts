// Tests for the pipeline's parsing layer.
//
// These import pipeline/parse.mjs directly — it is deliberately free of fs,
// zlib and network imports so CI can run this without installing anything in
// the pipeline directory.
import { describe, expect, it } from 'vitest';
import {
  parseNum,
  isSuppressed,
  isAggregateLabel,
  cleanInstitution,
  institutionKey,
  cleanRateSeries,
  nullLeadingZeroRun,
  latest,
  median,
  sumKnown,
  yearColumns,
  findHeaderRow,
  slugify,
} from '../pipeline/parse.mjs';

describe('parseNum', () => {
  it('parses plain numbers', () => {
    expect(parseNum('35003')).toBe(35003);
    expect(parseNum('12.65')).toBe(12.65);
    expect(parseNum(0)).toBe(0);
  });

  it('strips thousands separators and percent signs', () => {
    expect(parseNum('1,676,077')).toBe(1676077);
    expect(parseNum('12.5%')).toBe(12.5);
  });

  it('returns null for "np" — not published is NOT zero', () => {
    expect(parseNum('np')).toBeNull();
    expect(parseNum('NP')).toBeNull();
    expect(parseNum('n.p.')).toBeNull();
  });

  it('returns null for suppressed small cells, not 5 and not 0', () => {
    // parseInt('< 5') is NaN and Number('< 5') is NaN, but the common
    // `Number(x) || 0` idiom turns this into a confident zero. The real value
    // is between 1 and 4.
    expect(parseNum('< 5')).toBeNull();
    expect(parseNum('<5')).toBeNull();
  });

  it('returns null for the "." no-students-in-base sentinel', () => {
    expect(parseNum('.')).toBeNull();
    expect(parseNum('')).toBeNull();
    expect(parseNum(null)).toBeNull();
    expect(parseNum(undefined)).toBeNull();
  });

  it('returns null for unparseable text rather than NaN', () => {
    expect(parseNum('Data not available')).toBeNull();
    expect(parseNum('Total')).toBeNull();
  });
});

describe('isSuppressed', () => {
  it('distinguishes withheld cells from merely absent ones', () => {
    expect(isSuppressed('np')).toBe(true);
    expect(isSuppressed('< 5')).toBe(true);
    expect(isSuppressed('')).toBe(false);
    expect(isSuppressed('123')).toBe(false);
  });
});

describe('isAggregateLabel', () => {
  it('rejects the total rows that share the institution column', () => {
    expect(isAggregateLabel('National Total')).toBe(true);
    expect(isAggregateLabel('Table A Providers')).toBe(true);
    expect(isAggregateLabel('Table B Providers')).toBe(true);
    expect(isAggregateLabel('State Total')).toBe(true);
    expect(isAggregateLabel('Total')).toBe(true);
    expect(isAggregateLabel('Total 2023')).toBe(true);
    expect(isAggregateLabel('Australia')).toBe(true);
    expect(isAggregateLabel('% change on 2023')).toBe(true);
  });

  it('rejects the per-state non-university bucket', () => {
    // This is many small colleges reported as one row, not an institution.
    expect(isAggregateLabel('Non-University Higher Education Institutions')).toBe(true);
    expect(isAggregateLabel('Private Universities (Table C) and Non-University Higher Education Institutions')).toBe(
      true
    );
  });

  it('treats a blank label as an aggregate so footnote rows are dropped', () => {
    expect(isAggregateLabel('')).toBe(true);
    expect(isAggregateLabel(null)).toBe(true);
  });

  it('keeps real institutions', () => {
    expect(isAggregateLabel('The University of Sydney')).toBe(false);
    expect(isAggregateLabel('Charles Sturt University')).toBe(false);
    expect(isAggregateLabel('Australian Catholic University')).toBe(false);
    // Contains "total" as a substring but is not a total row.
    expect(isAggregateLabel('Totalis University')).toBe(false);
  });
});

describe('cleanInstitution', () => {
  it('splits a trailing provider code from the name', () => {
    expect(cleanInstitution('Charles Sturt University (3005)')).toEqual({ code: '3005', name: 'Charles Sturt University' });
  });

  it('strips footnote markers that are welded into the name', () => {
    expect(cleanInstitution('University of New South Wales(1.03)')).toEqual({
      code: null,
      name: 'University of New South Wales',
    });
  });

  it('handles a code and a footnote together', () => {
    expect(cleanInstitution('Avondale University (2252)(1.08)')).toEqual({ code: '2252', name: 'Avondale University' });
  });

  it('handles the leading-code form used by the staff workbooks', () => {
    expect(cleanInstitution('3005 Charles Sturt University')).toEqual({ code: '3005', name: 'Charles Sturt University' });
  });

  it('does not mistake a footnote for a provider code', () => {
    // (7.02) is a footnote, not code 702.
    expect(cleanInstitution('Some University(7.02)').code).toBeNull();
  });
});

describe('institutionKey', () => {
  it('joins the same university across workbooks that disagree on "The"', () => {
    expect(institutionKey('The University of Sydney')).toBe(institutionKey('University of Sydney'));
  });

  it('ignores punctuation and case', () => {
    expect(institutionKey('RMIT University')).toBe(institutionKey('rmit  university'));
  });

  it('keeps genuinely different universities apart', () => {
    expect(institutionKey('University of Melbourne')).not.toBe(institutionKey('University of Newcastle'));
  });
});

describe('cleanRateSeries', () => {
  it('nulls the structural zeros that mean "not a reporting provider yet"', () => {
    // Avondale's real series: nine years of 0 then 12.65. Left alone it ranks
    // as the lowest-attrition university in Australia.
    const raw = [0, 0, 0, 0, 0, 0, 0, 0, 0, 12.65];
    expect(cleanRateSeries(raw)).toEqual([null, null, null, null, null, null, null, null, null, 12.65]);
  });

  it('preserves real values and existing nulls', () => {
    expect(cleanRateSeries([22.77, null, 23.14])).toEqual([22.77, null, 23.14]);
  });
});

describe('nullLeadingZeroRun', () => {
  it('nulls only the leading run for count series', () => {
    expect(nullLeadingZeroRun([0, 0, 224, 240])).toEqual([null, null, 224, 240]);
  });

  it('keeps an interior zero, which can be a genuine year with no graduates', () => {
    expect(nullLeadingZeroRun([10, 0, 12])).toEqual([10, 0, 12]);
  });

  it('leaves an all-zero series untouched rather than nulling everything', () => {
    expect(nullLeadingZeroRun([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('leaves a series that starts non-zero untouched', () => {
    expect(nullLeadingZeroRun([5, 0, 7])).toEqual([5, 0, 7]);
  });
});

describe('latest', () => {
  it('finds the last published value, skipping trailing gaps', () => {
    expect(latest([1, 2, null])).toEqual({ value: 2, index: 1 });
  });

  it('returns null for an empty or all-null series', () => {
    expect(latest([])).toEqual({ value: null, index: -1 });
    expect(latest([null, null])).toEqual({ value: null, index: -1 });
  });
});

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('ignores nulls rather than treating them as zero', () => {
    expect(median([1, null, 3])).toBe(2);
  });

  it('returns null when nothing is published', () => {
    expect(median([null, null])).toBeNull();
    expect(median([])).toBeNull();
  });
});

describe('sumKnown', () => {
  it('reports how much of a sum is missing instead of hiding it', () => {
    expect(sumKnown([10, null, 20])).toEqual({ total: 30, known: 2, missing: 1 });
  });

  it('does not count nulls as zeros in the known count', () => {
    expect(sumKnown([null, null])).toEqual({ total: 0, known: 0, missing: 2 });
  });
});

describe('yearColumns', () => {
  it('finds year headers and ignores other columns', () => {
    expect(yearColumns(['State', 'Institution', '2014', '2015', '% change'])).toEqual([
      { year: 2014, col: 2 },
      { year: 2015, col: 3 },
    ]);
  });

  it('does not match a year embedded in a title', () => {
    expect(yearColumns(['Table 14.4: completions, 2015 to 2024'])).toEqual([]);
  });
});

describe('findHeaderRow', () => {
  const rows: string[][] = [
    ['< Back to Contents >'],
    ['Table 2.4: ... State of Permanent Home Residence ...'],
    ['State of Permanent Home Residence', 'New South Wales'],
  ];

  it('finds a row by exact content, not by substring of the title', () => {
    // Matching the title row instead of the header is a real bug this guards:
    // the title contains the same phrase and yields a header with no columns.
    const exact = findHeaderRow(rows, (r: unknown[]) => r[0] === 'State of Permanent Home Residence');
    expect(exact).toBe(2);
  });

  it('returns -1 when nothing matches', () => {
    expect(findHeaderRow(rows, (r: unknown[]) => r[0] === 'nope')).toBe(-1);
  });
});

describe('slugify', () => {
  it('makes a url-safe slug', () => {
    expect(slugify('The University of Sydney')).toBe('the-university-of-sydney');
    expect(slugify('RMIT  University!')).toBe('rmit-university');
  });
});
