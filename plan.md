# Site Plan: Universities

## Overview
- **Name:** Universities
- **Repo name:** au-unis
- **Tagline:** Every Australian university compared — enrolments, international share, drop-out rates, completion odds and class sizes.

### Naming Convention
Plain topic name, no country in the name. `country: "AU"` in the index entry renders the flag.

## Target Audience
Three overlapping groups, in priority order:

1. **Year 12 students and their parents (Nov–Jan peak, mobile-heavy).** They have an
   ATAR and a shortlist of universities and they are googling "which uni has the
   highest drop-out rate", "do I need a high ATAR to finish a degree", "how big are
   the classes at X". They are anxious, not statistical, and they need a straight
   answer with context.
2. **Current and prospective international students** deciding between institutions
   while the Australian government tightens student visa settings — they want to know
   how exposed an institution is to a policy shock that could reshape it.
3. **Higher-ed journalists, policy staff and university planners** who currently have
   to open six separate departmental spreadsheets with three-row merged headers to
   answer one question.

## Value Proposition
The Department of Education publishes all of this, and almost nobody can read it. It
lives in ~20 Excel workbooks per year, each with a Contents sheet, an Explanatory
Notes sheet, multi-row merged headers, footnote markers welded into institution names
(`University of New South Wales(1.03)`), and `np` / `< 5` / `.` string sentinels sitting
in numeric columns. Nothing joins the workbooks together.

This site joins them: one row per institution, with enrolments, international share,
attrition, retention, success, completions, student-staff ratio and field mix, over ten
years — plus the national completion-rate cohort analysis that answers the question the
league tables never do: **who actually finishes, and does your ATAR predict it?**

Two things here do not exist anywhere else in a usable form:
- **The ATAR → completion curve.** Section 17 tracks real cohorts for nine years and
  decomposes them four ways (completed / still enrolled / re-enrolled but dropped out /
  never came back after first year). Every "is my ATAR good enough" article cites a
  vibe; this is the actual answer, and the honest version of it (see the four-year trap
  below) is genuinely surprising.
- **The origins matrix.** 598,882 of 1,676,077 students — 35.7% — have a permanent home
  residence outside Australia. That single number reframes what an Australian
  university is, and it is buried in Table 2.4 of Section 2.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| DoE Selected Higher Education Statistics — Student Data, Section 2 (All Students) | education.gov.au/higher-education-statistics/resources/2024-section-2-all-students | Enrolments per institution by level, field, gender, mode, citizenship; interstate origin×study matrix | Annual (~Sept) | No |
| DoE Student Data, Section 15 (Attrition, Success, Retention) | .../2024-section-15-attrition-success-and-retention | Per-institution attrition/retention/success, domestic + overseas, 2014–2024 | Annual | No |
| DoE Student Data, Section 17 (Completion Rates) | .../2024-section-17-completion-rates | Cohort completion decomposition over 4/6/9 years by ATAR, SES, disability, First Nations, regionality, NESB, gender, age, field | Annual | No |
| DoE Student Data, Section 14 (Award Course Completions) | .../2024-section-14-award-course-completions | Completions per institution, level, field, citizenship, 2015–2024 | Annual | No |
| DoE Student Data, Section 7 (Overseas Students) | .../2024-section-7-overseas-students | Overseas student load and country of origin | Annual | No |
| DoE Student Data — Summary Time Series | .../2024-student-summary-time-series | National enrolment/EFTSL/equity-group series 2011–2024 | Annual | No |
| DoE Staff Data 2025, Appendix 2 | .../2025-staff-appendix-2-student-staff-ratios | Student-staff ratios (academic + professional, incl. casuals) per institution 2015–2024 | Annual (~Mar) | No |
| ABS ASGS state boundaries | patterns/geo/au-states.geojson | Real state polygons for the map | Static | No |

All files are public XLSX behind stable *resource pages*; the download URLs embed
node IDs that change each release, so the pipeline scrapes the resource page for the
`/download/{id}/…/document/xlsx` href rather than hardcoding it.

## Key Features
1. **Rankings** — every institution ranked on 8 metrics with the national median marked.
2. **Explorer** — searchable, sortable table of all ~60 institutions with 10-year sparklines.
3. **Outcomes** — the Section 17 cohort decomposition, sliced by ATAR/SES/equity, with the 4/6/9-year timeframe toggle that makes it honest.
4. **Origins** — the interstate + overseas flow matrix, as a Sankey and a state choropleth.
5. **Exposure** — scatter of international share against size, quadranted by national medians.
6. **Fields** — treemap of study areas plus an institution × field matrix.
7. **Trends** — ten years of enrolments and attrition, annotated with COVID and the 2024–25 international student policy squeeze.
8. **Insights** — auto-detected outliers.
9. **Per-institution drill-down**, hash-linkable (`#i=3040`).

## Target Audience (detailed)
The dominant visitor is a 17-year-old on a phone in December, or their parent on a
laptop, in a decision that feels enormous and irreversible. They arrive from a Google
query about one university and one number. They are not going to read a methodology
note before looking at the chart, so every number must be safe to read at a glance and
the caveat must travel *with* it — inline, not in a footnote. The secondary desktop
audience (journalists, planners) needs the opposite: the full table, the definitions,
and the ability to check that the number matches the department's own published total.

The site must serve the anxious phone visitor first without lying to the analyst.

## Style Direction
**Tone:** civic / trustworthy, with a consumer-guide warmth — this is a decision aid, not a dashboard.
**Colour palette:** light theme, deep academic navy (`#1e3a5f`) as the primary with a warm amber accent (`#d97706`) for emphasis and a restrained teal for positive outcomes. Navy reads as institutional and calm — it borrows the register of a university prospectus without imitating any one institution's branding. Avoids both the "hacker terminal" look (wrong for a nervous parent) and primary-colour brightness (reads as marketing, undermines trust in the numbers).
**UI density:** balanced — generous on the landing/ranking views where a phone visitor lands, denser in Explorer and the matrix where the analyst works.
**Dark/light theme:** light. This is a civic/consumer tool for a general audience.
**Reference sites for tone:** the UK's Discover Uni (discoveruni.gov.uk) for the calm decision-aid register; ABS Data Explorer for taking dense official data seriously.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (no routing, no deep component tree — a view switcher over one dataset)
- **Data strategy:** pipeline. Source publishes **annually** (student data ~September, staff data ~March), so the cron is **yearly** — `0 6 9 10 *` (9 October, after the September student release settles). Never daily/weekly.
- **Key libraries:** Leaflet (state choropleth). Everything else hand-rolled SVG from `patterns/`.

## Layout
Fixed 52px header (wordmark, view tabs, search, About `?`). Main content is a
`max-width: 1680px` centred column that grows to fill wide desktops. Rankings and
Explorer use full-width tables with sticky headers inside their own `overflow-x: auto`
scrollports. Charts sit in cards on a `minmax(0, 1fr)` auto-fill grid. The drill-down is
a right-hand slide-in panel (full-width sheet below 768px). Below 768px the tab bar
scrolls horizontally, tables become card lists, and the two-column chart grid collapses
to one.

## Pages/Views
Single page, nine hash-routed views: `#v=rankings|explorer|outcomes|origins|exposure|fields|trends|insights` plus `#i={institution code}` for the drill-down.

## Visualization Strategy

Design research first. The bar for this domain: the UK's **Discover Uni** (per-course
outcome bars with an explicit "what happened to this cohort" decomposition — the right
instinct, weak execution), **NCES College Navigator** (dense, authoritative, ugly), and
the fleet's own `au-insolvency` Trajectory scatter (current level vs change, quadranted
by medians — the form that separates "always been this way" from "getting worse fast").

The shape of this data is **not** a network and **not** geographic at any fine grain, so
the house defaults (force graph, choropleth) are mostly wrong here. What it actually is:
(a) a set of ~60 entities with parallel 10-year series, (b) one 9×10 origin–destination
matrix, and (c) a cohort that decomposes into four mutually exclusive outcomes across
three time horizons. The views follow from those three shapes.

1. **Rankings (default)** — horizontal bars, national median marked, metric selector across 8 measures. *Answers: how does my shortlist compare?* Hover = exact value + rank; click = drill-down.
2. **Explorer** — sortable/filterable table, one row per institution, 10-year sparkline per metric. *Answers: show me everything about everyone.* The analyst's view.
3. **Outcomes — the signature view.** A 100% stacked decomposition of each cohort into Completed / Still enrolled / Re-enrolled but dropped out / Never came back, with a 4/6/9-year toggle and a cohort-attribute selector (ATAR band, SES, First Nations, disability, regional, NESB, gender, age, mode, field). *Answers: do people like me finish?* This is the view no one else builds, because the four-way decomposition only makes sense once you understand that "still enrolled" is not failure — which the timeframe toggle teaches by letting the user watch "still enrolled" drain into "completed" as the horizon moves 4 → 6 → 9 years. **An ATAR-band small-multiples strip** sits beneath it: eight mini stacked bars, one per ATAR band, revealing the gradient at a glance.
4. **Origins** — the 9×10 O–D matrix as a Sankey (home state → state of study, with "Outside Australia" as the largest single band) plus a toggle to a Leaflet state choropleth (net importer/exporter of students). *Answers: where do students come from, and which states import them?* Hover a band = exact flow; click a state = filter.
5. **Exposure** — scatter: international share (x) against total enrolment (y, log), quadranted by national medians, zoom/pan, labelled hubs. *Answers: which institutions are most exposed to a visa-policy shock, and how big are they?* The quadrant that matters is high-share/high-size — a policy change there moves the sector.
6. **Fields** — squarified treemap of broad fields of education (national), plus an institution × field heatmap that separates comprehensive universities from specialists. *Answers: what does Australia study, and what is this university actually for?*
7. **Trends** — 10-year multi-line of enrolments and attrition with a state/institution selector, annotated with COVID (2020–21 border closure) and the 2024–25 international student policy squeeze. *Answers: is this a trend or a blip?*
8. **Insights** — auto-detected outliers as severity-coded cards (institutions >2× median attrition, >50% international share, fastest movers, largest domestic/overseas completion gaps), each click-through to the relevant view.
9. **Drill-down panel** — per institution: rank on every metric, 10-year series, field mix, citizenship mix, student-staff ratio, and comparison to the national median.

**Deliberate omissions:** no force-directed network (institutions do not connect to
each other in this data — a graph would be decoration), and no fine-grained map (the
data has no geography below state, so a suburb-level map would be fabrication).

## Data traps to defend against (found during research, all confirmed in the raw files)

1. **Aggregate rows share the institution column.** `National Total`, `Table A Providers`,
   `Table B Providers`, `State Total`, `Total 2023` sit in the same column as real
   institutions. Ranking them together double-counts the country. Filter by an explicit
   aggregate-label set and assert the institution count.
2. **String sentinels in numeric columns.** `np` (not published), `< 5` (suppressed small
   cell), `.` (no students in base). `Number('np')` → NaN, but `parseInt` / `|| 0` give a
   confident 0. Parse to `null`, never 0, and render as "not published".
3. **Zeros in the attrition tables are not zero.** Avondale University reads `0` for
   2014–2022 and `12.65` for 2023 — it was not a 0%-attrition university, it was not a
   reporting provider yet. Treating those as real would make it the best-performing
   institution in Australia. Leading zero-runs are nulled.
4. **Sector attrition ≠ provider attrition.** Table 15.1 (domestic) is *sector* attrition —
   a student who transfers to another university is not counted as lost. Table 15.2
   (overseas) is *provider* attrition — a transfer counts as lost. Comparing them
   directly makes international students look far more likely to drop out than they are.
   The site never puts the two on one axis; each is labelled with its denominator.
5. **The four-year completion rate is a trap, not a headline.** Only ~40% of domestic
   bachelor students have completed at four years — but ~36% are *still enrolled*, because
   many degrees take longer than four years. "60% don't finish" would be false and is
   exactly the sentence a careless reading produces. The default timeframe is **nine
   years**, and "still enrolled" is coloured as neutral, never as failure.
6. **Footnote markers are welded into institution names** — `University of New South
   Wales(1.03)`, `Avondale University (2252)(1.08)` — and the institution code is inside the
   same string. Strip to a stable `{code, name}` and key on the code, or the same
   university appears as two entities across workbooks.
7. **Multi-row merged headers.** The staff-ratio workbook spans its header over rows 4–6
   (label row, category row, year row) with two metric blocks side by side. A
   single-header-row assumption silently reads the wrong years.
8. **Footnote text leaks into data columns.** In Section 17 the Group column contains
   long footnote paragraphs as rows. Rows whose group is not in the known group set are
   dropped.

The pipeline asserts its parsed national totals reproduce the department's own published
totals (1,676,077 all students, 2024) and fails the build on drift.
