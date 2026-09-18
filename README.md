# Second Gate Deliveries — LIME LOGISTICS

Portable handoff of Ola’s dashboard, updated 18 September 2026. This archive contains real supplied records, not sample data. It does not update the existing ChatGPT-hosted Site.

## Deploy to Vercel

Import this folder’s root from a private GitHub repository. Select framework **Other**, build command `npm run build`, output directory `public`. The top-level project has no dependencies: the dashboard is already compiled, and the build command checks its contents. No database or environment variables are required to view this static export.

For local HTTP preview: `python3 -m http.server 4173 --directory public`, then open http://localhost:4173.

## Contents

- `public/index.html`: self-contained interactive dashboard with bundled data.
- `source/`: original editable React project, full recorded data and runtime instructions.
- `CODEX-PROMPT.md`: deployment handoff prompt.
- `verify.mjs`: focused data/export verification.
- `vercel.json`: static hosting configuration.

## Records and scope

Second Gate (Gate 2) only; Thursday’s delivery company is LIME LOGISTICS. Thursday 17 September 2026: 7 crushed concrete 6F5 visits + 4 Type 1/recycled Type 1 visits = 11. Friday 18 September remains pending with no delivery rows. Counts are visits, not tonnes. Time notes are partial examples, not additional deliveries; the 12:56pm material remains unconfirmed.

## Editing and rebuilding

Follow `source/AGENTS.md` for canonical Data builds, then export the completed build to offline HTML and copy it to `public/index.html`. The top-level build verifies the current export; it does not compile React changes automatically. Keep source and export synchronized. Runtime dependencies and lockfile are included in source for maintainers; node_modules is excluded.

## Hosting boundaries

This is a static snapshot with interactive filtering; records do not refresh automatically. ChatGPT Sites authentication, shared edit persistence, and server-backed features are not supplied by static Vercel hosting. The original Site was private. Set appropriate Vercel access protection before sharing real records; a private GitHub repository alone does not make a deployed website private.

The updated export passed compilation and data checks. Prior day filtering was verified in the original preview; this export still needs its Vercel browser/access verification, as specified in the Codex prompt.
