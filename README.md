# Second Gate Deliveries — LIME LOGISTICS

An interactive dashboard of real, user-supplied delivery tallies for Second Gate. The GitHub repository is private; public viewing of the delivery records was explicitly authorised by the owner.

Public dashboard: https://site-material-daily-records.vercel.app

## Authoritative records

| Date | Day | Time | Material | Number of deliveries | Supplier | Gate |
| --- | --- | --- | --- | ---: | --- | --- |
| 17 Sep 2026 | Thursday | — | 6F5 crushed concrete | 7 | LIME LOGISTICS | Second Gate |
| 17 Sep 2026 | Thursday | — | Type 1 / recycled Type 1 | 4 | LIME LOGISTICS | Second Gate |
| 18 Sep 2026 | Friday | — | 6F5 crushed concrete | 17 | LIME LOGISTICS | Second Gate |
| 18 Sep 2026 | Friday | — | Type 1 | 4 | LIME LOGISTICS | Second Gate |

Thursday: 11; Friday: 21; combined: 32. Material categories: 24 crushed concrete + 8 Type 1/recycled Type 1. Friday's original Type 1 label is retained in the register and grouped with Type 1/recycled Type 1 in charts.

Tally counts are authoritative. Incomplete handwritten arrival notes never recalculate or override them. All current row times are —; no individual arrivals or tonnage are inferred. Previously supplied Thursday site opening hours remain separate operating context; Friday site hours are unknown.

## Build and deployment

- Framework: Other; build command: `npm run build`; output: `public`.
- `public/index.html` is the self-contained compiled dashboard. Root build verifies its embedded records against `source/src/data.json`; it does not compile React automatically.
- Follow `source/AGENTS.md` for canonical Data builds. Build with `--separate-data`, export offline under `source/.data-app-offline/exports/`, then copy the completed export to `public/index.html` and run `npm run build`.
- Preview locally with `python -m http.server 4187 --bind 127.0.0.1 --directory public`.
- Use the existing Vercel project `site-material-daily-records`. After verification, an authorised production update uses `vercel deploy --prod`. Automatic Git deployment from main remains disabled, so pushing alone does not publish changes.
- Keep GitHub private. Never commit credentials, `.env*`, `.vercel`, `node_modules`, or intermediate offline build copies.

## Hosting boundaries

The production URL is public; anyone can view and forward its delivery records. This static snapshot supports interactive filtering but does not refresh its records automatically or inherit ChatGPT authentication, shared presentation editing, or server-backed functions.
