// Download the Department of Education higher education workbooks.
//
// The download URLs embed Drupal node IDs that change with every annual
// release (`/download/19481/2024-section-2-all-students/41929/document/xlsx`),
// so nothing here is hardcoded to a year. The collector walks the stable index
// pages, finds the newest year that has the sections we need, then scrapes each
// resource page for its actual download href.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const BASE = 'https://www.education.gov.au';

// education.gov.au serves a bot-check page to bare fetch() clients. A normal
// browser Accept/UA pair is enough; nothing here evades a rate limit.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// Section slug fragment -> local filename. Slugs are prefixed with the year.
const STUDENT_SECTIONS = {
  'section-2-all-students': 'section2.xlsx',
  'section-7-overseas-students': 'section7.xlsx',
  'section-14-award-course-completions': 'section14.xlsx',
  'section-15-attrition-success-and-retention': 'section15.xlsx',
  'section-17-completion-rates': 'section17.xlsx',
  'student-summary-time-series': 'timeseries.xlsx',
};

const STAFF_SECTIONS = {
  'staff-appendix-2-student-staff-ratios': 'staff-ratios.xlsx',
};

async function get(url, { binary = false } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (attempt === 4) throw new Error(`failed to fetch ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

/** All `/higher-education-statistics/resources/...` hrefs on a page. */
function resourceLinks(html) {
  return [...html.matchAll(/href="(\/higher-education-statistics\/resources\/[^"#?]+)"/g)].map((m) => m[1]);
}

/**
 * Pick the newest year present among links matching `fragment`.
 * Returns { year, path } or null.
 */
function newestFor(links, fragment) {
  let best = null;
  for (const path of links) {
    const slug = path.split('/').pop();
    if (!slug.includes(fragment)) continue;
    const year = Number(/(\d{4})/.exec(slug)?.[1] ?? 0);
    if (!year) continue;
    if (!best || year > best.year) best = { year, path };
  }
  return best;
}

/** Scrape a resource page for its xlsx download href. */
async function downloadHref(path) {
  const html = await get(BASE + path);
  const m = /href="(\/download\/\d+\/[^"]+\/document\/xlsx?)"/i.exec(html);
  if (!m) throw new Error(`no xlsx download link on ${path}`);
  return m[1].replace(/&amp;/g, '&');
}

/**
 * The student-data index lists resource pages directly, but the staff-data
 * index only lists per-year landing pages — the appendices live one hop
 * further in. Follow that hop when the index yields nothing useful.
 */
async function resolveLinks(indexPath, sections) {
  const html = await get(BASE + indexPath);
  let links = resourceLinks(html);
  const fragments = Object.keys(sections);
  if (fragments.some((f) => newestFor(links, f))) return links;

  const yearPages = [
    ...html.matchAll(new RegExp(`href="(${indexPath}/[^"#?]*?(\\d{4})[^"#?]*)"`, 'g')),
  ].map((m) => ({ path: m[1], year: Number(m[2]) }));
  if (!yearPages.length) return links;

  yearPages.sort((a, b) => b.year - a.year);
  // Walk back from the newest year until one carries the sections we need —
  // the current year's page can appear before its appendices are published.
  for (const page of yearPages.slice(0, 3)) {
    const inner = resourceLinks(await get(BASE + page.path));
    if (fragments.every((f) => newestFor(inner, f))) return inner;
    links = inner.length ? inner : links;
  }
  return links;
}

async function collectGroup(indexPath, sections, label) {
  const links = await resolveLinks(indexPath, sections);
  const results = [];

  for (const [fragment, filename] of Object.entries(sections)) {
    const found = newestFor(links, fragment);
    if (!found) throw new Error(`could not find a ${label} resource matching "${fragment}" on ${indexPath}`);
    const href = await downloadHref(found.path);
    const buf = await get(BASE + href, { binary: true });
    if (buf.length < 5000) throw new Error(`${filename} is implausibly small (${buf.length} bytes)`);
    await writeFile(join(RAW, filename), buf);
    results.push({ filename, year: found.year, bytes: buf.length, source: BASE + found.path });
    process.stdout.write(`  ${filename.padEnd(20)} ${found.year}  ${(buf.length / 1024).toFixed(0)} KB\n`);
  }
  return results;
}

async function main() {
  await mkdir(RAW, { recursive: true });

  process.stdout.write('Student data:\n');
  const student = await collectGroup('/higher-education-statistics/student-data', STUDENT_SECTIONS, 'student');

  process.stdout.write('Staff data:\n');
  const staff = await collectGroup('/higher-education-statistics/staff-data', STAFF_SECTIONS, 'staff');

  const manifest = {
    collectedAt: new Date().toISOString(),
    studentDataYear: Math.max(...student.map((f) => f.year)),
    staffDataYear: Math.max(...staff.map((f) => f.year)),
    files: [...student, ...staff],
  };
  await writeFile(join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stdout.write(
    `\nCollected ${manifest.files.length} workbooks (student ${manifest.studentDataYear}, staff ${manifest.staffDataYear}).\n`
  );
}

main().catch((err) => {
  process.stderr.write(`collect failed: ${err.message}\n`);
  process.exit(1);
});
