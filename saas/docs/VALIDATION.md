# Two-page delivery logger validation — 6 November 2026

All checks use fictional records. These results were recorded before release; no hosted database migration was applied as part of this validation.

| Check                                                             | Result              |
| ----------------------------------------------------------------- | ------------------- |
| Unit, local adapter, PostgreSQL/RLS and browser-demo engine tests | 58 passed           |
| TypeScript                                                        | Passed              |
| Authenticated HTTP API integration                                | 20 passed           |
| Authenticated phone/tablet/desktop browser workflows              | 6 passed            |
| Credential-free demo phone/tablet/desktop browser workflows       | 6 passed            |
| Optimised Next.js production build                                | Passed with Webpack |
| Git whitespace check                                              | Passed              |

The unit suite covers additive migration preservation, company/site/creator isolation, gate role changes, private evidence rules, immutable simple captures, duplicate retries, local persistence, demo behaviour and site-local time/DST. Existing legacy backend tests remain in place.

Browser checks exercise login, both marshal cards, the minimal form, required-image validation, upload recovery after refresh, duplicate-safe saving, supervisor record/photo access, date/material filters and responsive layouts. The demo suite checks that fictional records and photos stay in IndexedDB and no real authentication or company API request is made. See [browser/API results](../tests/e2e/RESULTS.md).

The production bundle passed `npm run build -- --webpack`, including Next.js TypeScript validation, page generation and build traces. Default Turbopack was blocked by this workspace's CSS-worker port permission (`EPERM`); the normal deployment build should be rechecked in the target environment. No application checks were disabled.

A separate default-path development smoke test confirmed that repeated SQLite writes cause no page reloads after the runtime-path tracing fix. Future-time validation keeps the field editable, and correcting the time allows a photo-backed save. Phone and tablet screenshots were visually inspected.

## Verification boundaries

- PostgreSQL tests execute both migrations in PGlite with mocked Supabase identity and storage metadata. They do not connect to a hosted Supabase Auth or Storage service.
- Authenticated HTTP/browser tests use the persistent SQLite development adapter. Independent supervisor browser contexts check shared server data and private photo access.
- Phone/tablet tests emulate viewports in Chromium. Camera upload uses a synthetic image through the real file input; physical camera hardware and iOS HEIC behaviour remain untested.
- Public `/demo` data is stored only in that browser. It is not a shared company database and has no server backup.
- The simple form keeps attempts locally after Save Delivery is pressed. It does not autosave untouched typing, perform background uploads, or guarantee an offline cold start. Failed attempts keep immutable details for safe retry.
- Images are limited to JPEG, PNG and WebP up to 3 MiB. There is no automatic compression or HEIC conversion.
- Company/site/user/marshal provisioning is an operator task. Existing historical rows are retained; aggregate notebook summaries remain separate and are not converted into individual deliveries.

Apply the additive migration and run the hosted workflow smoke test in [DEPLOYMENT.md](DEPLOYMENT.md) in an authorised test environment before a production release. Production deployment requires the user's explicit approval.

## Changed files

Paths below are relative to `saas/`.

| Area                        | Files                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home and login              | `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/delivery-log/simple-app.tsx`, `src/components/auth/login.tsx`, `src/components/demo/demo-access.tsx`, `src/components/legacy/ledger-app.tsx`                                                                                                           |
| Capture and records         | `src/components/delivery-log/simple-form.tsx`, `src/components/delivery-log/simple-records.tsx`, `src/app/globals.css`, `public/marshal-placeholder.svg`                                                                                                                                                         |
| Save recovery and site time | `src/lib/client/simple-drafts.ts`, `src/lib/site-time.ts`                                                                                                                                                                                                                                                        |
| Authenticated logging       | `src/app/api/log-deliveries/route.ts`, `src/lib/types.ts`, `src/lib/server/core.ts`, `src/lib/server/local.ts`, `src/lib/server/supabase.ts`                                                                                                                                                                     |
| Fictional browser demo      | `src/lib/demo/engine.ts`                                                                                                                                                                                                                                                                                         |
| Database and provisioning   | `supabase/migrations/202611060001_simple_delivery_log.sql`, `scripts/setup-supabase-demo.mjs`                                                                                                                                                                                                                    |
| Tests                       | `playwright.config.ts`, `tests/all.ts`, `tests/integration/database.test.ts`, `tests/unit/demo.test.ts`, `tests/integration/simple-database.test.ts`, `tests/integration/simple-local.test.ts`, `tests/unit/site-time.test.ts`, `tests/e2e/simple-api.spec.ts`, `tests/e2e/ui.spec.ts`, `tests/e2e/demo.spec.ts` |
| Instructions and results    | `README.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/VALIDATION.md`, `tests/e2e/RESULTS.md`                                                                                                                                                                                                              |

## Smart arrivals upgrade — 6 November 2026

This is a later validation pass for the browser-demo catalogue and classification upgrade. The earlier results above are retained as historical release evidence. The smart upgrade does not activate a production backend, apply a hosted database migration or introduce a paid external service.

| Check                                                                                                                  | Current result                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`npm run typecheck`)                                                                                       | Passed                                                                                                                                                        |
| Unit, local adapter, PostgreSQL/RLS and browser-demo engine/client suite (`npm test`)                                  | **86 passed**: the prior 70 checks retained, plus 5 catalogue, 9 smart-arrival engine and 2 smart-draft client tests                                          |
| Credential-free browser demo, phone/tablet/desktop (`npm run test:demo`)                                               | **21 unique cases passed across runs**: 12 retained cases in the initial demo run and all 9 smart-arrival cases in a fresh rerun, across phone/tablet/desktop |
| Authenticated browser UI (`npx playwright test tests/e2e/ui.spec.ts`)                                                  | **9 passed** in the combined authenticated compatibility run                                                                                                  |
| Authenticated HTTP API (`npx playwright test tests/e2e/simple-api.spec.ts tests/e2e/portal-api.spec.ts --project=api`) | **16 passed**: 5 simple-logger and 11 portal API checks                                                                                                       |
| Optimised Next.js build with Webpack (`npm run build -- --webpack`)                                                    | **Passed**; compilation, TypeScript, all 13 static pages and build traces completed                                                                           |
| Production deployment / updated live URL                                                                               | Not claimed                                                                                                                                                   |

The new unit checks cover deterministic known-item and alias matching, legacy names and IDs, pending-item deduplication, unknown-name validation, allowed supervisor classifications, save-time ISO timestamps, separate repeated arrivals, immutable retry IDs, canonical timestamps during recovery and CSV preservation of legacy timestamp meanings. The unit, demo-browser and authenticated compatibility results reflect executed checks. The release build also passed with Webpack, including TypeScript validation, all 13 static pages and build traces. Expected demo delivery, records and supervisor routes, alongside the existing sign-in routes, were present in the build output.

The passing demo-browser cases cover both marshal profiles, known deliveries and service visits, unknown-item saving and supervisor approval, approval after refresh, reconciled date-period totals and filtered records/CSV, photo evidence, repeated saves and narrow layouts. The initial full demo run passed the 12 retained cases and 6 new cases; 3 new cases failed on an ambiguous Timber option in the test helper. After fixing the exact option selector and download-filename expectation, all 9 smart cases passed in a fresh rerun. This is combined evidence across runs, not a claim that the initial full command was green. No application defect was identified by those test-helper failures. The separate authenticated local adapter also passed all **25 compatibility checks** in one run: 9 browser UI checks and 16 HTTP API checks. This validates the maintained subsets rather than claiming a full `npm run test:e2e` pass.

Verification boundaries remain unchanged: demo roles are simulated, IndexedDB records and approvals are not shared across devices, camera tests use synthetic files rather than physical hardware, and no hosted Supabase Auth/Storage smoke test is implied. Catalogue approval does not verify physical receipt. See [SMART-ARRIVALS.md](SMART-ARRIVALS.md) for storage limits and the grouped upgrade file inventory.
