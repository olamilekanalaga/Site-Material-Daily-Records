# Demo display defaults — all recorded dates

Both public demo record views now open on **All recorded dates**. Clear filters restores all dates; a custom range still applies to records, cards, workload, review and CSV. Older entries remain visible after refresh, reopening and day changes. Original delivery objects, dates and timestamps are unchanged. The live staff records page, marshal entry form, storage engine/schema and backend configuration are unchanged.

The extra Arrival breakdown section and explanatory/empty classification paragraphs were removed. Existing pending approval controls and success/error feedback remain in Review.

Validation for this revision: TypeScript passed; **117/117 unit/database tests passed**; **24/24 browser scenarios passed** across phone, tablet and desktop. The updated date scenario checks a multi-day historical dataset, midnight changes, refresh/reopen, custom October ranges and CSV, Clear filters returning to all records, the marshal own-records view, and exact unchanged stored delivery snapshots. The optimised Next.js 16.4.5 / Turbopack build passed, including TypeScript and all 13 static pages.

---

# Gate supervisor workspace — 10 November 2026

The `feat/supervisor-workspace` branch adds a frontend-only supervisor view on top of the existing demo. It is based on the existing unmerged backend-review branch so the reviewed demo continues to work; this change does not activate Supabase, production authentication or a live database. The marshal form, IndexedDB schema/engine, existing catalogue, migrations, archived dashboard and Vercel configuration are unchanged.

The dark workspace has Arrivals / Marshals / To Classify cards and Records / Workload / Review tabs. All counters and tabs use the same filtered, deduplicated submitted arrivals. To Classify counts distinct pending catalogue IDs with matching arrivals; original names and arrival occurrences remain visible for review. Classification approval uses the existing demo operation and audit history, preserving the complete original delivery objects and evidence.

| Check                                                    | Executed result                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`npm run typecheck`)                         | Passed                                                                                                                                      |
| Unit/database suite (`npm test`)                         | **117/117 passed**, including six new supervisor model checks                                                                               |
| Complete public demo browser suite (`npm run test:demo`) | **24/24 passed** in the final complete run, across phone/tablet/desktop                                                                     |
| Optimised Next.js build (`npm run build`)                | Passed with Next.js 16.4.5 / Turbopack, TypeScript and all 13 static pages                                                                  |
| Review and visual inspection                             | Independent read-only code review completed; phone Records and Review screenshots visually inspected; responsive checks include 320px width |
| Hosted Auth/Storage or production rollout                | Not performed by this UI upgrade                                                                                                            |

Browser scenarios cover both demo entrances, unchanged marshal capture, shared same-browser records, correct recording/legacy timestamps, date rollover and fixed custom ranges, date/marshal/item/category/type/classification filters, matching CSV output, evidence access, workload grouping/activity, keyboard tabs, and classification approval with unchanged delivery snapshots. The runner starts without Supabase credentials and verifies that public demo workflows issue no real company API requests or staff session cookies.

The initial browser run passed 21 of 24 scenarios. The remaining three were one assertion repeated across viewports: it assumed original-name variants would display in creation order. The assertion now compares their exact contents without prescribing order, preserving whitespace/case and the full immutable-delivery checks. Record button labels were also improved to announce material names. The final complete 24-scenario run passed on the resulting source.

The referenced supervisor illustration was not attached. The written dark layout has been implemented, but no exact screenshot comparison is claimed. Browser checks use Chromium device emulation and synthetic images; physical phone-camera behaviour remains a manual check. Records remain local to a browser profile and origin, so a new preview URL has its own demo storage and does not automatically show records from an older URL.

See [workspace behaviour and counting rules](SUPERVISOR-WORKSPACE.md). Earlier validation below belongs to earlier implementation stages and is not a new hosted-backend verification.

---

# Production backend integration — review validation

The `feat/production-delivery-backend` branch upgrades the existing application. It is prepared for pull-request review; production merge/deployment requires approval. The results below this section are **earlier release evidence**, not proof that the supplied hosted Supabase project is connected.

Current verification targets are authenticated Gate Delivery and Delivery Records, persisted material/supplier additions, server recording time and explicit correction, account-bound marshal selection, private delivery/portrait files, tenant/site isolation, immutable upload retries and cross-device supervisor viewing. Follow [deployment setup](DEPLOYMENT.md) for the hosted two-device check and [production audit](PRODUCTION-AUDIT.md) for reuse and scope.

At the start of this branch the environment contained no Supabase credentials and the connected Vercel project reported no variables. No hosted migration, real Auth login, private Storage upload or cross-device hosted inspection is claimed here until an actual protected test has completed. PGlite uses mocked Auth/Storage metadata, SQLite exercises the local adapter, and the public demo is IndexedDB-only.

The operator setup can be checked without network using `node --check scripts/provision-site.mjs` and `node scripts/provision-site.mjs --config YOUR_REVIEWED_CONFIG --validate-only`. These checks validate syntax/configuration/local files; they do not create accounts, execute SQL or verify hosted permissions.

## Catalogue and summary simplification — 7 November 2026

The browser records view now has exactly three horizontal summary cards: **Total arrivals**, **Material deliveries** and **Service visits**. Pending-classification and individual-material cards, together with the “More items” hint, were removed. Date filtering and supervisor classification review remain available.

The initial **Aggregates / Sands** menu contains **6F5**, **Type 1**, **Sand**, **10mm shingles** and **20mm shingles**, plus manual entry. Other categories are unchanged. One-time demo/local visibility upgrades retain historical catalogue IDs, delivery rows, evidence and audit history. Explicitly entering a retired option such as Cement makes the same item selectable again after refresh. The unexecuted live migration uses the same defaults; no hosted SQL was applied.

Current simplification checks: **111/111 unit/database checks passed**, TypeScript passed and the complete public browser suite passed **21/21** across phone, tablet and desktop. It includes exactly three summary cards, the five-option dropdown, manual restoration after refresh, date-linked totals, evidence and classification review. Phone screenshots were visually inspected. The final optimised build result is recorded below. The private API/UI counts below belong to the preceding backend-integration run, which was not repeated for this presentation change.

## Current branch results — 7 November 2026

| Check                                                                                  | Executed result                                                                                                                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`npm run typecheck`)                                                       | Passed                                                                                                                                    |
| Unit, SQL/RLS, local persistence, demo, configuration and operator guards (`npm test`) | **111/111 passed** in the latest combined run                                                                                             |
| Current private HTTP API and responsive UI                                             | **34 unique scenarios covered**: 22 API and 12 UI across phone, tablet and desktop                                                        |
| Final delivery-time ordering and filtered CSV checks                                   | **4/4 passed**: one API export and three viewport UI rechecks                                                                             |
| Existing public demo regression                                                        | **21/21 passed** in the complete run                                                                                                      |
| Optimised Next.js build (`npm run build`)                                              | Passed with the default Next.js 16.4.5 Turbopack builder, TypeScript and all 13 static pages                                              |
| Operator script                                                                        | Syntax, validation-only/no-network and mocked read-only/conflict checks passed; three operator guards are included in the 111-check suite |
| Hosted smoke command without protected opt-in credentials                              | **1 skipped**, as intended; not a hosted pass                                                                                             |
| Production merge, hosted SQL application and production deployment                     | Not performed                                                                                                                             |

The private checks initially passed 31 of 34 scenarios. The remaining three tests were corrected to wait for the logout response and select the appropriate sign-in entrance after returning to the unauthenticated chooser; all three then passed on a fresh generated dev cache, with the authentication assertions retained. No application workaround or longer timeout was introduced. After aligning table and CSV ordering with the displayed delivery time, the four focused chronology checks passed on the final source. The default private runner now selects these current suites and excludes the retained superseded vehicle/quantity API success expectations.

Local development restarts that switched environment modes briefly reused a stale Turbopack dev graph. Moving only generated `.next/dev` after stopping the server resolved it; source, records and databases were not reset. The final production build passed without a cache workaround.

The workspace's direct request to the supplied Supabase hostname was denied by its outbound network policy (`403` during proxy CONNECT). At the last read, the user had added `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Vercel's Production environment only; no Preview variables or live-mode setting were present. This work did not change those settings. The actual project's migrations, Auth accounts, Storage behaviour and two-device hosted journey remain unverified. The opt-in command is `npx playwright test --config=playwright.hosted.config.ts`; use the protected test-account variables listed in [deployment setup](DEPLOYMENT.md). That test deliberately creates labelled synthetic records and retains their audit history.

Phone/tablet checks use Chromium viewport emulation and synthetic image files. Physical camera behaviour, HEIC conversion, hosted backup/restore and account recovery require the documented manual checks. No test data or staff credentials were sent to the hosted project by this work.

---

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
