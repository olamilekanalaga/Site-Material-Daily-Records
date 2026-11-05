## Construction Delivery Management SaaS

The new functional P0 pilot lives in [`saas/`](saas/README.md): Next.js, authenticated capture, private photographs, independent supervisor verification, reporting, offline drafts and Supabase tenant/site RLS. All SaaS demo data is fictional. The proposed DJ Civils pilot is unofficial and has no company approval.

Run and deploy from `saas/` using its instructions. The original static application below is preserved and is not served or imported by the SaaS. Do not deploy the repository root or its real-data public snapshot as the new prototype.

## Current local revision — Site Progress

Navigation contains Overview, Deliveries and Site Progress, with the supplied DJ Civils logo and proof-of-work disclaimer. Site Progress now uses `progress_posts`: one row per reviewed WhatsApp post. All 29 posts are dated Thursday 17 September 2026, explicitly confirmed by the owner. Eight confirmed display names document at least 52 photographs and five video posts. A separate `activities` dataset contains 12 caption-backed activities and never infers work from photographs. Friday has delivery records but zero progress posts.

The Time column is removed from both registers. Desktop and mobile retain actual tables; narrow screens use wrapped cells without horizontal scrolling. Thursday and Friday site hours are both 7:00 am–5:30 pm. Delivery counts remain 11 + 23 = 34.

Raw WhatsApp screenshots remain private. Evidence dialogs show the reviewed structured post and private evidence identifier; no raw screenshot or telephone number is publicly served. Raw WhatsApp screenshots are stored outside this repository and are never packaged or served. No phone numbers are included in extracted data.

Run `npm test` for source regression checks and `npm run build` to verify the compiled snapshot. The compiled package contains the current local review, including its pending-preview disclosure. Pushing this revision is not deployment approval. Automatic Vercel deployment from main remains disabled; do not deploy or change access without explicit authorization.

The previous delivery handoff below is historical; its Time-column and unknown-Friday-hours instructions are superseded above.

---

# Second Gate Deliveries — LIME LOGISTICS

An interactive dashboard of real, user-supplied delivery tallies for Second Gate. The GitHub repository is private; public viewing of the delivery records was explicitly authorised by the owner.

Public dashboard: https://site-material-daily-records.vercel.app

## Authoritative records

| Date | Day | Time | Material | Number of deliveries | Supplier | Gate |
| --- | --- | --- | --- | ---: | --- | --- |
| 17 Sep 2026 | Thursday | — | 6F5 crushed concrete | 7 | LIME LOGISTICS | Second Gate |
| 17 Sep 2026 | Thursday | — | Type 1 / recycled Type 1 | 4 | LIME LOGISTICS | Second Gate |
| 18 Sep 2026 | Friday | — | 6F5 crushed concrete | 19 | LIME LOGISTICS | Second Gate |
| 18 Sep 2026 | Friday | — | Type 1 | 4 | LIME LOGISTICS | Second Gate |

Thursday: 11; Friday: 23; combined: 34. Material categories: 26 crushed concrete + 8 Type 1/recycled Type 1. Friday's original Type 1 label is retained in the register and grouped with Type 1/recycled Type 1 in charts.

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

