# Universities

**Every Australian university compared — enrolments, international share, drop-out rates, completion odds and class sizes.**

🔗 **Live:** [https://au-unis.benrichardson.dev](https://au-unis.benrichardson.dev)

## What is this?

The Australian Government publishes an extraordinary amount of data about its universities, and almost nobody can read it. It arrives every year as about twenty Excel workbooks, each with a contents sheet, an explanatory-notes sheet, headers spanning three merged rows, footnote markers welded into institution names (`University of New South Wales(1.03)`), and `np` / `< 5` / `.` string sentinels sitting in otherwise-numeric columns. Nothing joins the workbooks to each other.

This site joins them. One row per university, with enrolments, international share, attrition, retention, subject success, completions, student-staff ratio and field mix, over ten years — plus the national cohort analysis that answers the question the league tables never do: **who actually finishes, and does your ATAR predict it?**

Two things here do not exist anywhere else in a usable form. The first is the **ATAR → completion curve**: the department follows real starting cohorts for nine years and splits them four ways, and the honest version of that number is genuinely surprising (93.7% of students admitted with an ATAR of 95–100 complete within nine years, against 55.0% of those admitted at 30–49). The second is the **origins matrix**: 598,882 of 1,676,077 students — 35.7% — have a permanent home residence outside Australia, a larger group than New South Wales and Victoria combined, and it is buried in a single table of Section 2.

## Who is this for?

- **Year 12 students and their parents**, mostly on a phone in December, who have an ATAR and a shortlist and are googling "which uni has the highest drop-out rate" or "do I need a high ATAR to finish a degree". They need a straight answer with the caveat attached to it, not in a footnote.
- **International students** choosing between institutions while Australia tightens student visa settings, who want to know how exposed an institution is to a policy shock.
- **Higher-education journalists, policy staff and university planners**, who currently open six departmental spreadsheets to answer one question.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| DoE Selected Higher Education Statistics — Student Data, Section 2 | Enrolments per institution by level, field, gender, mode and citizenship; the state-of-origin × state-of-study matrix | Annual (~September) |
| Student Data, Section 15 | Per-institution attrition, retention and success, domestic and overseas, 2014–2024 | Annual |
| Student Data, Section 17 | Cohort completion decomposition over 4/6/9 years by ATAR, SES, disability, First Nations status, regionality, NESB, gender, age and field | Annual |
| Student Data, Section 14 | Award course completions per institution, 2015–2024 | Annual |
| Student Data, Section 7 | Overseas student load and origin | Annual |
| Student Summary Time Series | National enrolment and equity-group series | Annual |
| DoE Staff Data, Appendix 2 | Student-staff ratios (academic and professional, including casuals) per institution, 2015–2024 | Annual (~March) |
| ABS ASGS state boundaries | Real state polygons for the map (CC BY 4.0) | Static |

## Features

- **Rankings** — every university on eight measures, with the national median marked so a number has a reference point.
- **Who finishes** — the signature view. A 100% stacked decomposition of each starting cohort into completed / still enrolled / re-enrolled-then-left / never came back, sliced by ATAR band, SES, disability, First Nations status, regionality and more. The 4/6/9-year toggle is the teaching device: moving it visibly drains "still enrolled" into "completed", which is exactly the misreading the four-year figure invites.
- **Exposure** — international share against size on a log scale, quadranted by the national medians, with zoom, pan and label de-collision.
- **Origins** — the origin–destination matrix as a Sankey, a state choropleth, and the exact numbers.
- **Study areas** — a squarified treemap of the national field mix plus an institution × field heatmap that separates comprehensive universities from specialists.
- **Trends** — ten years of enrolments, annotated with the 2020 border closure and the 2024 visa tightening.
- **Explorer** — every measure for every university in one sortable, searchable table with ten-year sparklines.
- **Insights** — auto-detected outliers, each a click-through into the view it came from.
- **Per-university drill-down**, hash-linkable (`#i=3035`), with rank on every measure, ten-year series, field mix and demographic composition.

## Tech Stack

- **Runtime:** Vanilla TypeScript (no framework — this is a view switcher over one dataset)
- **Build:** Vite 6
- **Testing:** Vitest (105 tests)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, yearly cron matched to the source's annual publication
- **Maps:** Leaflet with real ABS ASGS boundaries
- Charts are hand-rolled SVG; no charting library.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview

# Re-fetch and rebuild the data
npm run data
```

## How it works

`pipeline/collect.mjs` walks the department's stable index pages, finds the newest year that carries the sections it needs, scrapes each resource page for its actual `/download/…` href (the URLs embed node IDs that change every release, so nothing is hardcoded to a year), and saves seven workbooks.

`pipeline/aggregate.mjs` reads them with a **dependency-free** zip + xlsx reader (`zip.mjs`, `xlsx.mjs`) so CI never has to install anything, joins them on a normalised institution key, and writes the JSON in `public/data/` that the browser loads. It asserts its parsed national totals reproduce the department's own published figures and fails the build on drift.

All the semantic parsing lives in `pipeline/parse.mjs`, which is pure and directly unit-tested.

### Reaching the source

`education.gov.au` refuses bare `fetch()` clients, and the first CI run failed with
connect timeouts rather than an HTTP error. Two things fix it, and both are in
`collect.mjs`: a full set of browser headers (including the `Sec-Fetch-*` family) and
`dns.setDefaultResultOrder('ipv4first')` — GitHub runners advertise IPv6 and the host
only half-answers on it, which presents as a hang rather than a refusal.

The collector still distinguishes *unreachable* from *changed*, because the two need
different responses. On a transport failure it writes a warning to the job summary,
leaves the committed data in `public/data/` untouched and exits cleanly — a recurring
red X that re-running cannot fix would be worse than useless. Any other failure,
including a change in the shape of the source data, fails the build loudly.

To refresh by hand:

```bash
npm run data          # collect + aggregate
git add public/data && git commit -m "Update data"
```

### The traps this pipeline defends against

Every one of these was found in the raw files and produces a confidently wrong number if ignored:

1. **Aggregate rows share the institution column.** `National Total`, `Table A Providers`, `State Total`, `Total 2023` and a per-state `Non-University Higher Education Institutions` bucket all sit in the same column as real universities. Ranking them together counts the country several times.
2. **String sentinels in numeric columns.** `np`, `< 5` and `.` all parse to `null`, never `0` — `Number(x) || 0` turns every suppressed cell into a confident zero.
3. **Zeros in the historic series are not zeros.** Avondale University reads `0` attrition for 2014–2022 and `12.65` for 2023. It was not a 0%-attrition university; it was not a reporting provider yet. Left alone it ranks as the best-performing institution in Australia.
4. **Sector attrition ≠ provider attrition.** The domestic figure does not count a transfer to another university as dropping out; the overseas figure does. They are different measures with different denominators, and the site never puts them on one axis.
5. **The four-year completion rate is a trap, not a headline.** ~41% have completed at four years, but ~36% are still enrolled. The default timeframe is nine years and "still enrolled" is coloured neutral.
6. **Footnote markers and provider codes are welded into names**, inconsistently between workbooks, so the join key is normalised or the same university appears twice.
7. **Multi-row merged headers** in the staff workbooks span three rows with two metric blocks side by side.
8. **Footnote paragraphs are written into data columns** in Section 17 and the time series.

A ninth lives in the frontend rather than the pipeline: the interstate map excludes overseas students on purpose. Include them and every state is an "importer", so the whole map shades one colour and the interstate story disappears.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
