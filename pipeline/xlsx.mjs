// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Read an .xlsx into plain row arrays. No dependencies beyond ./zip.mjs.
//
// The department's workbooks are simple in structure but hostile in detail:
// merged multi-row headers, shared strings with rich-text runs, and inline
// strings. This reader normalises all of that to `string[][]` per sheet and
// lets pipeline/parse.mjs do the semantic work.
import { unzip } from './zip.mjs';

// Attributes are matched as explicit name="value" pairs rather than with a
// greedy [^>]* run. A greedy run happily swallows the `/` of a self-closing
// `<c r="D3" s="41"/>`, matches the following `>`, and then consumes every
// cell up to the next `</c>` — so an EMPTY cell silently steals the value of
// the next non-empty one and shifts the rest of the row. That bug produces a
// spreadsheet that parses without error and is quietly wrong.
const ATTRS = '((?:\\s+[\\w:.-]+\\s*=\\s*"[^"]*")*)\\s*';
const ROW_RE = new RegExp(`<row${ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/row>)`, 'g');
const CELL_RE = new RegExp(`<c${ATTRS}(?:(\\/>)|>([\\s\\S]*?)<\\/c>)`, 'g');

/** Parse `AB12` -> 0-based column index 27. */
export function colIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Strip XML tags/entities from a fragment, concatenating text nodes. */
function textOf(xml) {
  return xml
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function readSharedStrings(files) {
  const part = files.get('xl/sharedStrings.xml');
  if (!part) return [];
  const xml = part.toString('utf8');
  const out = [];
  // Each <si> may hold one <t> or several <r><t> runs (rich text) — join runs.
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1] === undefined ? '' : textOf(m[1]));
  }
  return out;
}

/**
 * Returns { sheetNames: string[], sheet(name): string[][] }.
 * Cells are strings; empty/missing cells are ''. Rows are padded so that a
 * given column index means the same column on every row.
 */
export function readWorkbook(buf) {
  const files = unzip(buf);
  const shared = readSharedStrings(files);

  const wb = files.get('xl/workbook.xml').toString('utf8');
  const rels = files.get('xl/_rels/workbook.xml.rels').toString('utf8');

  const relTarget = new Map();
  for (const m of rels.matchAll(new RegExp(`<Relationship${ATTRS}\\/?>`, 'g'))) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) relTarget.set(id, target);
  }

  const sheets = [];
  for (const m of wb.matchAll(new RegExp(`<sheet${ATTRS}\\/?>`, 'g'))) {
    const name = textOf(/name="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    let target = rid ? relTarget.get(rid) : undefined;
    if (!target) continue;
    if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\/+/, '');
    sheets.push({ name, target });
  }

  const cache = new Map();

  function sheet(name) {
    if (cache.has(name)) return cache.get(name);
    const entry = sheets.find((s) => s.name === name);
    if (!entry) throw new Error(`sheet not found: ${name} (have: ${sheets.map((s) => s.name).join(', ')})`);
    const xml = files.get(entry.target).toString('utf8');

    const rows = [];
    let width = 0;
    for (const rm of xml.matchAll(ROW_RE)) {
      const body = rm[2] ?? '';
      const cells = [];
      for (const cm of body.matchAll(CELL_RE)) {
        const attrs = cm[1];
        const inner = cm[3] ?? '';
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const idx = ref ? colIndex(ref) : cells.length;

        let value = '';
        if (type === 's') {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          value = v === undefined ? '' : (shared[Number(v)] ?? '');
        } else if (type === 'inlineStr') {
          value = textOf(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          value = v === undefined ? '' : textOf(v);
        }
        while (cells.length < idx) cells.push('');
        cells[idx] = value;
      }
      const rowNum = Number(/r="(\d+)"/.exec(rm[1] ?? '')?.[1] ?? rows.length + 1);
      while (rows.length < rowNum - 1) rows.push([]);
      rows[rowNum - 1] = cells;
      if (cells.length > width) width = cells.length;
    }
    for (const r of rows) while (r.length < width) r.push('');

    cache.set(name, rows);
    return rows;
  }

  return { sheetNames: sheets.map((s) => s.name), sheet };
}
