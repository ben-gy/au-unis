// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Join seven departmental workbooks into the JSON the site actually reads.
//
// Output (public/data/):
//   institutions.json  one row per real institution, every metric + 10y series
//   outcomes.json      Section 17 cohort decomposition by attribute
//   origins.json       state-of-origin x state-of-study matrix
//   national.json      national totals, field mix, time series, insights
//   meta.json          provenance + the assertions that passed
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './xlsx.mjs';
import {
  parseNum,
  isAggregateLabel,
  cleanInstitution,
  institutionKey,
  cleanRateSeries,
  nullLeadingZeroRun,
  latest,
  median,
  slugify,
  yearColumns,
  findHeaderRow,
  STATE_CODES,
} from './parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const OUT = join(HERE, '..', 'public', 'data');

const load = async (f) => readWorkbook(await readFile(join(RAW, f)));

/** Forward-fill a sparse leading column (state appears only on its first row). */
function carryDown(rows, col) {
  let last = '';
  for (const r of rows) {
    const v = String(r[col] ?? '').trim();
    if (v) last = v;
    else r[col] = last;
  }
  return rows;
}

/**
 * Walk a "State | Institution | ...values" table, yielding only real
 * institutions. `headerMatch` locates the header row by content because the
 * preamble rows differ between workbooks.
 */
function institutionRows(sheet, headerMatch) {
  const h = findHeaderRow(sheet, headerMatch);
  if (h < 0) throw new Error('could not locate header row');
  const body = carryDown(sheet.slice(h + 1).map((r) => r.slice()), 0);
  return {
    header: sheet[h],
    rows: body.filter((r) => {
      const inst = String(r[1] ?? '').trim();
      return inst && !isAggregateLabel(inst) && !isAggregateLabel(String(r[0] ?? ''));
    }),
  };
}

const registry = new Map();

function upsert(rawName, state) {
  const { code, name } = cleanInstitution(rawName);
  const key = institutionKey(name);
  if (!key) return null;
  let rec = registry.get(key);
  if (!rec) {
    rec = {
      key,
      code: code ?? null,
      name,
      slug: slugify(name),
      state: state ?? null,
      stateCode: state ? (STATE_CODES[state] ?? null) : null,
      notes: [],
    };
    registry.set(key, rec);
  }
  if (!rec.code && code) rec.code = code;
  if (!rec.state && state) {
    rec.state = state;
    rec.stateCode = STATE_CODES[state] ?? null;
  }
  // Prefer the longer name form ("The University of Sydney" over "University
  // of Sydney") so the display name matches the department's own usage.
  if (name.length > rec.name.length) rec.name = name;
  return rec;
}

/** Map a header label to a short key, tolerating footnote markers. */
const clean = (s) =>
  String(s ?? '')
    .replace(/\(\d+\.\d+[a-z]?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

async function main() {
  await mkdir(OUT, { recursive: true });

  // collect.mjs exits cleanly without downloading when the source host is
  // unreachable (see the note there). In that case there is nothing to
  // aggregate and the committed data must be left exactly as it is.
  let manifestRaw;
  try {
    manifestRaw = await readFile(join(RAW, 'manifest.json'), 'utf8');
  } catch {
    process.stdout.write(
      'No collected workbooks found — skipping aggregation and leaving public/data/ untouched.\n'
    );
    return;
  }
  const manifest = JSON.parse(manifestRaw);
  const assertions = [];
  const assert = (ok, msg) => {
    assertions.push({ ok, msg });
    if (!ok) throw new Error(`assertion failed: ${msg}`);
  };

  const s2 = await load('section2.xlsx');
  const s14 = await load('section14.xlsx');
  const s15 = await load('section15.xlsx');
  const s17 = await load('section17.xlsx');
  const ts = await load('timeseries.xlsx');
  const staff = await load('staff-ratios.xlsx');

  const studentYear = manifest.studentDataYear;

  // ── Citizenship / totals (2.12) — the canonical institution list ──────────
  {
    const { rows } = institutionRows(s2.sheet('2.12'), (r) => clean(r[2]) === 'Australian citizen');
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      const aus = parseNum(r[2]);
      const nz = parseNum(r[3]);
      const pr = parseNum(r[4]);
      const hum = parseNum(r[5]);
      const onshore = parseNum(r[6]);
      const offshore = parseNum(r[7]);
      const total = parseNum(r[8]);
      const domestic = [aus, nz, pr, hum].reduce((a, b) => a + (b ?? 0), 0);
      const overseas = (onshore ?? 0) + (offshore ?? 0);
      rec.citizenship = { australian: aus, nz, permanentResident: pr, humanitarian: hum, onshore, offshore };
      rec.students = total;
      rec.domestic = domestic;
      rec.overseas = overseas;
      // Share is computed over the published total, so a suppressed component
      // shows up as a share that does not quite reconcile rather than as a
      // silently wrong denominator.
      rec.overseasShare = total ? (overseas / total) * 100 : null;
    }
    assert(registry.size >= 35, `expected >=35 institutions, got ${registry.size}`);
  }

  // ── Broad level of course (2.5) ──────────────────────────────────────────
  {
    const { header, rows } = institutionRows(s2.sheet('2.5'), (r) => clean(r[2]) === 'Postgraduate by Research');
    const cols = header.map(clean);
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      rec.levels = {};
      for (let c = 2; c < cols.length - 1; c++) {
        if (!cols[c]) continue;
        rec.levels[cols[c]] = parseNum(r[c]);
      }
    }
  }

  // ── Gender (2.9) ─────────────────────────────────────────────────────────
  {
    const { rows } = institutionRows(s2.sheet('2.9'), (r) => clean(r[2]) === 'Males');
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      rec.gender = { males: parseNum(r[2]), females: parseNum(r[3]), other: parseNum(r[4]) };
    }
  }

  // ── Broad field of education (2.10) ──────────────────────────────────────
  const fieldNames = [];
  {
    const sheet = s2.sheet('2.10');
    const { header, rows } = institutionRows(sheet, (r) => clean(r[2]) === 'Natural and Physical Sciences');
    const cols = header.map(clean);
    for (let c = 2; c < cols.length; c++) {
      if (cols[c] && !/^total$/i.test(cols[c])) fieldNames.push({ col: c, name: cols[c] });
    }
    // The final column is the row total; drop it from the field list.
    const totalCol = cols.findIndex((v, i) => i > 2 && /^total$/i.test(v));
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      rec.fields = {};
      for (const f of fieldNames) {
        if (f.col === totalCol) continue;
        rec.fields[f.name] = parseNum(r[f.col]);
      }
    }
  }

  // ── Completions per institution, 2015..2024 (14.4) ───────────────────────
  {
    const sheet = s14.sheet('14.4');
    const { header, rows } = institutionRows(sheet, (r) => yearColumns(r).length >= 5);
    const years = yearColumns(header);
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      const series = nullLeadingZeroRun(years.map((y) => parseNum(r[y.col])));
      rec.completions = { years: years.map((y) => y.year), series, latest: latest(series).value };
    }
  }

  // ── Attrition / retention / success (Section 15) ─────────────────────────
  // 15.1 domestic attrition is a SECTOR rate (a student who transfers to
  // another university is not counted as lost). 15.2 overseas attrition is a
  // PROVIDER rate (a transfer IS counted as lost). They are different
  // measures with different denominators and must never share an axis.
  const RATE_TABLES = [
    ['15.1', 'attritionDomestic', 'sector'],
    ['15.2', 'attritionOverseas', 'provider'],
    ['15.3', 'attritionAll', 'provider'],
    ['15.4', 'retentionDomestic', 'sector'],
    ['15.5', 'retentionOverseas', 'provider'],
    ['15.6', 'retentionAll', 'provider'],
    ['15.7', 'successDomestic', 'n/a'],
    ['15.8', 'successOverseas', 'n/a'],
    ['15.9', 'successAll', 'n/a'],
  ];
  for (const [tab, field, basis] of RATE_TABLES) {
    const sheet = s15.sheet(tab);
    const { header, rows } = institutionRows(sheet, (r) => yearColumns(r).length >= 5);
    const years = yearColumns(header);
    for (const r of rows) {
      const rec = upsert(r[1], r[0]);
      if (!rec) continue;
      const series = cleanRateSeries(years.map((y) => parseNum(r[y.col])));
      rec[field] = { years: years.map((y) => y.year), series, latest: latest(series).value, basis };
    }
  }

  // ── Student-staff ratios + EFTSL (staff appendices) ──────────────────────
  // These sheets put code and name in SEPARATE columns and span the header
  // over three rows (label / metric-block / years), with two metric blocks
  // side by side. Locate the year row by content and split the blocks on the
  // gap between them.
  for (const [tab, key] of [
    ['A2.01', 'staffRatio'],
    ['A2.02', 'load'],
  ]) {
    const sheet = staff.sheet(tab);
    const yearRow = findHeaderRow(sheet, (r) => yearColumns(r).length >= 8);
    if (yearRow < 0) continue;
    const years = yearColumns(sheet[yearRow]);
    // Two blocks of the same years side by side: academic|professional for
    // A2.01, students|staff for A2.02. Split where the year sequence restarts.
    const blocks = [[years[0]]];
    for (let i = 1; i < years.length; i++) {
      if (years[i].year <= years[i - 1].year) blocks.push([]);
      blocks[blocks.length - 1].push(years[i]);
    }
    const body = carryDown(sheet.slice(yearRow + 1).map((r) => r.slice()), 0);
    for (const r of body) {
      const name = String(r[2] ?? '').trim();
      if (!name || isAggregateLabel(name)) continue;
      const rec = upsert(`${String(r[1] ?? '').trim()} ${name}`.trim(), String(r[0] ?? '').trim());
      if (!rec) continue;
      const read = (block) => nullLeadingZeroRun(block.map((y) => parseNum(r[y.col])));
      if (key === 'staffRatio') {
        rec.staffRatio = {
          years: blocks[0].map((y) => y.year),
          academic: read(blocks[0]),
          professional: blocks[1] ? read(blocks[1]) : [],
        };
        rec.staffRatioLatest = latest(rec.staffRatio.academic).value;
      } else {
        rec.load = {
          years: blocks[0].map((y) => y.year),
          eftsl: read(blocks[0]),
        };
      }
    }
  }

  // ── Section 17: cohort outcome decomposition ─────────────────────────────
  const outcomes = buildOutcomes(s17.sheet('17.1'));
  assert(outcomes.groups.length >= 8, `expected >=8 outcome attribute groups, got ${outcomes.groups.length}`);

  // ── Origins matrix (2.4) ─────────────────────────────────────────────────
  const origins = buildOrigins(s2.sheet('2.4'));
  assert(
    origins.grandTotal === 1676077 || origins.grandTotal > 1_000_000,
    `origins grand total implausible: ${origins.grandTotal}`
  );

  // ── National field mix (2.3) ─────────────────────────────────────────────
  const nationalFields = buildNationalFields(s2.sheet('2.3'));

  // ── National time series (summary time series, Table 2) ──────────────────
  const nationalSeries = buildNationalSeries(ts);

  // ── Finalise institutions ────────────────────────────────────────────────
  const institutions = [...registry.values()]
    .filter((r) => r.students !== null && r.students !== undefined)
    .sort((a, b) => (b.students ?? 0) - (a.students ?? 0));

  const sumStudents = institutions.reduce((a, r) => a + (r.students ?? 0), 0);
  assert(sumStudents > 1_000_000, `institution enrolment sum implausible: ${sumStudents}`);
  // Institutions alone must NOT reconcile to the national total — the
  // difference is the Non-University Higher Education Institutions buckets we
  // deliberately excluded. Assert the gap is a plausible size rather than zero,
  // which would mean the aggregate rows leaked back into the list.
  const gap = origins.grandTotal - sumStudents;
  assert(gap > 0 && gap < origins.grandTotal * 0.2, `institution/NUHEI gap implausible: ${gap}`);

  for (const r of institutions) {
    if (/notre dame/i.test(r.name)) {
      r.notes.push(
        'A 2024 cyber-security incident may affect the quality of this institution’s 2024 data. The department advises interpreting 2024 trends with care; other years are unaffected.'
      );
    }
  }

  const medians = {
    students: median(institutions.map((r) => r.students)),
    overseasShare: median(institutions.map((r) => r.overseasShare)),
    attritionDomestic: median(institutions.map((r) => r.attritionDomestic?.latest ?? null)),
    attritionAll: median(institutions.map((r) => r.attritionAll?.latest ?? null)),
    successAll: median(institutions.map((r) => r.successAll?.latest ?? null)),
    retentionAll: median(institutions.map((r) => r.retentionAll?.latest ?? null)),
    staffRatio: median(institutions.map((r) => r.staffRatioLatest ?? null)),
    completions: median(institutions.map((r) => r.completions?.latest ?? null)),
  };

  const national = {
    studentYear,
    staffYear: manifest.staffDataYear,
    totalStudents: origins.grandTotal,
    institutionStudents: sumStudents,
    nuheiStudents: gap,
    overseasStudents: institutions.reduce((a, r) => a + (r.overseas ?? 0), 0),
    fields: nationalFields,
    series: nationalSeries,
    medians,
    insights: buildInsights(institutions, medians, origins, outcomes),
  };

  await writeFile(join(OUT, 'institutions.json'), JSON.stringify(institutions));
  await writeFile(join(OUT, 'outcomes.json'), JSON.stringify(outcomes));
  await writeFile(join(OUT, 'origins.json'), JSON.stringify(origins));
  await writeFile(join(OUT, 'national.json'), JSON.stringify(national));
  await writeFile(
    join(OUT, 'meta.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      studentDataYear: studentYear,
      staffDataYear: manifest.staffDataYear,
      sources: manifest.files,
      assertions,
    })
  );

  // Real ABS-derived state boundaries, copied from the fleet's shared geo
  // directory — never hand-authored.
  try {
    await copyFile(join(HERE, 'geo', 'au-states.geojson'), join(OUT, 'au-states.geojson'));
  } catch {
    /* geo file is committed in public/data already */
  }

  process.stdout.write(
    `Wrote ${institutions.length} institutions, ${outcomes.groups.length} outcome groups, ` +
      `${origins.rows.length}x${origins.cols.length} origins matrix.\n` +
      `National total ${national.totalStudents.toLocaleString()} ` +
      `(institutions ${sumStudents.toLocaleString()}, NUHEI bucket ${gap.toLocaleString()}).\n`
  );
}

// ── Section 17 ─────────────────────────────────────────────────────────────
function buildOutcomes(sheet) {
  const h = findHeaderRow(sheet, (r) => /completed/i.test(String(r[4] ?? '')));
  const body = sheet.slice(h + 1);

  const byGroup = new Map();
  for (const r of body) {
    const group = clean(r[0]);
    const category = clean(r[1]);
    const duration = clean(r[2]);
    const cohort = clean(r[3]);
    // Footnote paragraphs are written into the Group column as data rows. A
    // real group row always carries all four leading fields plus a numeric
    // completed value; anything else is prose.
    const completed = parseNum(r[4]);
    if (!group || !category || !duration || !cohort || completed === null) continue;
    if (!/^(Four|Six|Nine) Years?$/i.test(duration)) continue;

    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const cats = byGroup.get(group);
    if (!cats.has(category)) cats.set(category, []);
    cats.get(category).push({
      duration,
      cohort,
      completed,
      stillEnrolled: parseNum(r[5]),
      droppedOut: parseNum(r[6]),
      neverReturned: parseNum(r[7]),
    });
  }

  const groups = [];
  for (const [group, cats] of byGroup) {
    const categories = [];
    for (const [category, points] of cats) {
      categories.push({ category, points });
    }
    if (categories.length) groups.push({ group, label: clean(group), categories });
  }
  const durations = ['Four Years', 'Six Years', 'Nine Years'];
  return { groups, durations };
}

// ── Section 2.4 ────────────────────────────────────────────────────────────
function buildOrigins(sheet) {
  // Exact match, not a substring test: the sheet TITLE on row 2 also contains
  // the phrase "State of Permanent Home Residence", and matching it silently
  // selects a header row with no year/total columns at all.
  const h = findHeaderRow(sheet, (r) => clean(r[0]) === 'State of Permanent Home Residence');
  const header = sheet[h].map(clean);
  const cols = [];
  for (let c = 1; c < header.length; c++) {
    if (!header[c] || /^total$/i.test(header[c])) continue;
    cols.push({ name: header[c], col: c });
  }

  const totalCol = header.findIndex((v) => /^total$/i.test(v));

  const rows = [];
  let grandTotal = 0;
  for (const r of sheet.slice(h + 1)) {
    const origin = clean(r[0]);
    if (!origin || /^not provided$/i.test(origin)) continue;
    if (/^total 20\d\d$/i.test(origin) || /^% change/i.test(origin)) continue;
    if (/^total$/i.test(origin)) {
      grandTotal = parseNum(r[totalCol]) ?? 0;
      continue;
    }
    const values = cols.map((c) => parseNum(r[c.col]));
    // The row total comes from the department's own published Total column,
    // not from summing the cells: small interstate flows are suppressed (the
    // NT row hides two of them), so a computed sum silently under-reports.
    // Keeping both makes the withheld amount visible instead of invisible.
    const published = parseNum(r[totalCol]);
    const summed = values.reduce((a, b) => a + (b ?? 0), 0);
    rows.push({
      origin,
      values,
      total: published ?? summed,
      withheld: published !== null ? published - summed : 0,
      suppressedCells: values.filter((v) => v === null).length,
    });
  }

  return { cols: cols.map((c) => c.name), rows, grandTotal };
}

// ── Section 2.3 ────────────────────────────────────────────────────────────
function buildNationalFields(sheet) {
  const h = findHeaderRow(sheet, (r) => clean(r[1]) === 'Natural and Physical Sciences');
  const header = sheet[h].map(clean);
  const totals = new Map();
  for (const r of sheet.slice(h + 1)) {
    const level = clean(r[0]);
    if (!level || isAggregateLabel(level)) continue;
    for (let c = 1; c < header.length; c++) {
      const name = header[c];
      if (!name || /^total$/i.test(name)) continue;
      const v = parseNum(r[c]);
      if (v === null) continue;
      totals.set(name, (totals.get(name) ?? 0) + v);
    }
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

// ── Summary time series ────────────────────────────────────────────────────
// These sheets carry a Group column and a Category column, so the row label is
// the pair — reading only the first column collapses "Citizenship / Domestic"
// and "Citizenship / Overseas" into two rows both labelled "Citizenship".
function readSeriesTab(ts, tab) {
  let sheet;
  try {
    sheet = ts.sheet(tab);
  } catch {
    return null;
  }
  const h = findHeaderRow(sheet, (r) => yearColumns(r).length >= 5);
  if (h < 0) return null;
  const years = yearColumns(sheet[h]);
  const hasCategory = /category/i.test(String(sheet[h][1] ?? ''));
  const rows = [];
  for (const r of sheet.slice(h + 1)) {
    const group = clean(r[0]);
    const category = hasCategory ? clean(r[1]) : '';
    if (!group) continue;
    // Footnote paragraphs sit in the label column; real labels are short.
    if (group.length > 70) continue;
    const series = years.map((y) => parseNum(r[y.col]));
    if (series.every((v) => v === null)) continue;
    rows.push({ group, category, label: category || group, series });
  }
  return { years: years.map((y) => y.year), rows };
}

function buildNationalSeries(ts) {
  const out = {};

  for (const [tab, key] of [
    ['1', 'commencing'],
    ['2', 'enrolments'],
  ]) {
    const t = readSeriesTab(ts, tab);
    if (!t) continue;
    out[key] = {
      years: t.years,
      total: t.rows.find((r) => /^all students$/i.test(r.group))?.series ?? [],
      domestic: t.rows.find((r) => /citizenship/i.test(r.group) && /domestic/i.test(r.category))?.series ?? [],
      overseas: t.rows.find((r) => /citizenship/i.test(r.group) && /overseas/i.test(r.category))?.series ?? [],
      levels: t.rows.filter((r) => /broad level/i.test(r.group)).map((r) => ({ label: r.label, series: r.series })),
    };
  }

  // Equity groups are reported against successive SEIFA/ASGS vintages, and a
  // vintage that was not yet in use is written as a run of literal 0s. Charted
  // as-is that draws a line collapsing to zero and then leaping back — the
  // classic zero-filled-gap artefact. Structural zeros become nulls, and each
  // vintage stays its own series rather than being spliced into a false
  // continuous history.
  const t5 = readSeriesTab(ts, '5');
  if (t5) {
    out.equity = {
      years: t5.years,
      rows: t5.rows
        .map((r) => {
          const series = r.series.map((v) => (v === 0 ? null : v));
          const vintage = /(\d{4}) (SEIFA|ASGS)/.exec(r.group)?.[1] ?? null;
          return {
            label: r.group.replace(/\s*\((SA1 measure )?\d{4} (SEIFA|ASGS)\)/, '').replace(/\s*-\s*\d{4} ASGS/, '').trim(),
            vintage,
            series,
            points: series.filter((v) => v !== null).length,
          };
        })
        .filter((r) => r.points >= 3),
    };
  }

  return out;
}

// ── Insights ───────────────────────────────────────────────────────────────
function buildInsights(institutions, medians, origins, outcomes) {
  const out = [];
  const fmtPct = (v) => `${v.toFixed(1)}%`;

  const overseasRow = origins.rows.find((r) => /outside australia/i.test(r.origin));
  if (overseasRow && origins.grandTotal) {
    out.push({
      severity: 'info',
      title: 'More than a third of students live outside Australia',
      body: `${overseasRow.total.toLocaleString()} of ${origins.grandTotal.toLocaleString()} students (${fmtPct(
        (overseasRow.total / origins.grandTotal) * 100
      )}) give a permanent home residence outside Australia — the single largest origin in the country, larger than New South Wales and Victoria combined.`,
      view: 'origins',
    });
  }

  const topOverseas = institutions
    .filter((r) => r.overseasShare !== null && (r.students ?? 0) >= 5000)
    .sort((a, b) => b.overseasShare - a.overseasShare)
    .slice(0, 3);
  if (topOverseas.length) {
    out.push({
      severity: 'warn',
      title: 'A handful of large universities are majority international',
      body: `${topOverseas
        .map((r) => `${r.name} (${fmtPct(r.overseasShare)})`)
        .join(', ')} — against a national median of ${fmtPct(medians.overseasShare ?? 0)} across institutions. A change to student visa settings lands hardest here.`,
      view: 'exposure',
    });
  }

  const highAttrition = institutions
    .filter((r) => r.attritionDomestic?.latest !== null && r.attritionDomestic?.latest !== undefined)
    .filter((r) => medians.attritionDomestic && r.attritionDomestic.latest > medians.attritionDomestic * 2)
    .sort((a, b) => b.attritionDomestic.latest - a.attritionDomestic.latest)
    .slice(0, 4);
  if (highAttrition.length) {
    out.push({
      severity: 'alert',
      title: 'Domestic drop-out rates vary more than fourfold',
      body: `${highAttrition
        .map((r) => `${r.name} (${fmtPct(r.attritionDomestic.latest)})`)
        .join(', ')} sit at more than double the national median of ${fmtPct(
        medians.attritionDomestic ?? 0
      )}. These are sector attrition rates, so students who transferred to another university are not counted as lost.`,
      view: 'rankings',
    });
  }

  const crowded = institutions
    .filter((r) => r.staffRatioLatest !== null && r.staffRatioLatest !== undefined)
    .sort((a, b) => b.staffRatioLatest - a.staffRatioLatest)
    .slice(0, 3);
  if (crowded.length && medians.staffRatio) {
    out.push({
      severity: 'warn',
      title: 'Students per academic staff member differ sharply',
      body: `${crowded
        .map((r) => `${r.name} (${r.staffRatioLatest.toFixed(1)} students per academic FTE)`)
        .join(', ')} carry the heaviest loads, against a median of ${medians.staffRatio.toFixed(
        1
      )}. The ratio counts casual academic staff, so it understates how many students share a continuing teacher.`,
      view: 'rankings',
    });
  }

  const national = outcomes.groups.find((g) => /national totals/i.test(g.group));
  const domestic = national?.categories.find((c) => /domestic/i.test(c.category));
  if (domestic) {
    const four = domestic.points.filter((p) => p.duration === 'Four Years').at(-1);
    const nine = domestic.points.filter((p) => p.duration === 'Nine Years').at(-1);
    if (four && nine) {
      out.push({
        severity: 'info',
        title: 'The four-year completion rate is the most misread number in higher education',
        body: `Only ${fmtPct(four.completed)} of domestic bachelor students had completed four years after starting (${
          four.cohort
        }) — but ${fmtPct(
          four.stillEnrolled
        )} were still enrolled, because many degrees run longer than four years. Given nine years (${
          nine.cohort
        }), ${fmtPct(nine.completed)} have completed. "Most students don't finish" is an artefact of the short window.`,
        view: 'outcomes',
      });
    }
  }

  const atar = outcomes.groups.find((g) => /australian tertiary admission rank/i.test(g.group));
  if (atar) {
    const nineOf = (cat) => cat.points.filter((p) => p.duration === 'Nine Years').at(-1);
    const bands = atar.categories
      .filter((c) => /^\d/.test(c.category))
      .map((c) => ({ band: c.category, point: nineOf(c) }))
      .filter((b) => b.point);
    const top = bands.find((b) => /95/.test(b.band));
    const low = bands.find((b) => /^(30-49|50-59)/.test(b.band));
    if (top && low) {
      out.push({
        severity: 'alert',
        title: 'ATAR still predicts completion nine years later',
        body: `${fmtPct(top.point.completed)} of school leavers admitted with an ATAR of ${
          top.band
        } had completed a bachelor degree within nine years, against ${fmtPct(low.point.completed)} of those in the ${
          low.band
        } band — a gap of ${(top.point.completed - low.point.completed).toFixed(
          1
        )} percentage points that the four-year view understates.`,
        view: 'outcomes',
      });
    }
  }

  const movers = institutions
    .filter((r) => r.completions?.series?.length >= 2)
    .map((r) => {
      const s = r.completions.series.filter((v) => v !== null);
      if (s.length < 2) return null;
      const first = s[0];
      const last = s[s.length - 1];
      if (!first) return null;
      return { name: r.name, change: ((last - first) / first) * 100, first, last, slug: r.slug };
    })
    .filter(Boolean)
    .sort((a, b) => b.change - a.change);
  if (movers.length) {
    const up = movers[0];
    const down = movers[movers.length - 1];
    out.push({
      severity: 'info',
      title: 'Graduate output is diverging between institutions',
      body: `${up.name} has grown completions the fastest (${up.first.toLocaleString()} to ${up.last.toLocaleString()}, ${
        up.change > 0 ? '+' : ''
      }${up.change.toFixed(0)}%), while ${down.name} has fallen the furthest (${down.first.toLocaleString()} to ${down.last.toLocaleString()}, ${down.change.toFixed(
        0
      )}%).`,
      view: 'trends',
    });
  }

  return out;
}

main().catch((err) => {
  process.stderr.write(`aggregate failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
