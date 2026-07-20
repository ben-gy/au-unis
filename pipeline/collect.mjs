// Download the Department of Education higher education workbooks.
//
// The download URLs embed Drupal node IDs that change with every annual
// release (`/download/19481/2024-section-2-all-students/41929/document/xlsx`),
// so nothing here is hardcoded to a year. The collector walks the stable index
// pages, finds the newest year that has the sections we need, then scrapes each
// resource page for its actual download href.
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';

// Prefer IPv4. GitHub-hosted runners advertise IPv6, and a host that only
// half-answers on v6 turns into a connect timeout rather than a clean error.
try {
  setDefaultResultOrder('ipv4first');
} catch {
  /* older Node — ignore */
}

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'raw');
const BASE = 'https://www.education.gov.au';

// education.gov.au serves a bot-check to bare fetch() clients, so these are the
// headers a real browser sends. Nothing here evades a rate limit — the
// collector fetches ~15 documents once a year.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-AU,en-GB;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  Connection: 'keep-alive',
};

/**
 * Thrown when the source host cannot be reached at all, as distinct from the
 * source having changed shape. The two need different responses: unreachable
 * is an environment problem and must not overwrite good committed data, while
 * a parse failure is a real regression that should fail loudly.
 */
class SourceUnreachableError extends Error {}

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
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  // A transport-level failure (connect timeout, DNS, TLS, abort) means the host
  // is unreachable from here — not that the data has changed.
  const transport = /fetch failed|timeout|ECONN|ENOTFOUND|EAI_AGAIN|abort|network/i.test(
    `${lastErr?.message} ${lastErr?.cause?.code ?? ''}`
  );
  const detail = `${lastErr?.message}${lastErr?.cause?.code ? ` (${lastErr.cause.code})` : ''}`;
  if (transport) throw new SourceUnreachableError(`could not reach ${url}: ${detail}`);
  throw new Error(`failed to fetch ${url}: ${detail}`);
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
  if (err instanceof SourceUnreachableError) {
    // education.gov.au does not answer from every network — GitHub-hosted
    // runners in particular get connect timeouts. Failing the job here would
    // just produce a recurring red X that means "someone else's firewall",
    // and re-running would not help. The committed data in public/data/ is
    // untouched and the site keeps working, so exit clean and say so loudly.
    // Refresh locally with `npm run data` when the annual release lands.
    process.stderr.write(
      `\n⚠️  SOURCE UNREACHABLE — data NOT refreshed, existing public/data/ left as-is.\n` +
        `   ${err.message}\n` +
        `   education.gov.au refuses connections from some networks (including CI runners).\n` +
        `   Run \`npm run data\` locally to refresh, then commit public/data/.\n\n`
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `### ⚠️ Data not refreshed\n\nThe Department of Education site was unreachable from this runner, so the committed data was left untouched.\n\n\`\`\`\n${err.message}\n\`\`\`\n\nRun \`npm run data\` locally and commit \`public/data/\` to refresh.\n`
        );
      } catch {
        /* summary is best-effort */
      }
    }
    process.exit(0);
  }
  process.stderr.write(`collect failed: ${err.message}\n`);
  process.exit(1);
});
