# Universities — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Custom domain:** https://au-unis.benrichardson.dev
- **GitHub Pages:** https://ben-gy.github.io/au-unis/ *(redirects to the custom domain)*

## What was built

Every Australian university joined into one interface from seven separate Department of
Education workbooks — 42 institutions, 1,676,077 students, ten years of series — with
eight views and a hash-linkable per-university drill-down.

The two findings worth the build:

- **93.7% of school leavers admitted with an ATAR of 95–100 complete a bachelor degree
  within nine years, against 55.0% of those admitted at 30–49.** The four-year figure
  everyone quotes (41.5%) is not the failure rate — 35.5% of that cohort are still
  enrolled. The "Who finishes" view defaults to nine years and teaches the caveat
  through its timeframe toggle rather than a footnote.
- **35.7% of all students have a permanent home residence outside Australia** — a larger
  group than New South Wales and Victoria combined.

## DNS and TLS

DNS and the Pages CNAME were provisioned automatically during the build:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `au-unis` | `ben-gy.github.io` | DNS only (grey cloud) |

If the Let's Encrypt certificate is still issuing, re-cycle it with:

```bash
gh api repos/ben-gy/au-unis/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/au-unis/pages -X PUT -f cname="au-unis.benrichardson.dev"
```
