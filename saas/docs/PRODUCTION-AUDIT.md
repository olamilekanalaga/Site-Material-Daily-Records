# Production integration audit

This is an upgrade of the existing application in `saas/`, not a new application. The review branch is `feat/production-delivery-backend`. The existing production deployment is unchanged until the pull request is approved and merged/deployed.

## What existed before this upgrade

| Area                    | Existing implementation                                                                                                           | Decision                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Application             | Next.js App Router, React, TypeScript, shared construction-site styling                                                           | Reuse the app root, branding, controls and deployment configuration.                 |
| Public demo             | `/demo`, marshal entry/records routes and `/demo/supervisor`; sample records and photos in IndexedDB                              | Preserve as an explicit demonstration. Never use these records as live company data. |
| Authentication          | Server-side Supabase email/password sign-in, HttpOnly session/refresh cookies, portal role checks and same-origin mutation checks | Reuse and enable the approved staff entrances when hosted configuration is valid.    |
| Live capture foundation | `log_delivery` draft → private evidence → submitted RPC, remote adapter and authenticated API routes                              | Extend this path for current catalogue/supplier input and server recording time.     |
| Database                | Company/site memberships, staff profiles, materials, suppliers, deliveries, evidence, audit and historical tables                 | Preserve IDs, records and applied migration history. Add one ordered migration.      |
| Private evidence        | `delivery-evidence` bucket, scoped object paths, RLS policies and authorised photo API                                            | Reuse, with retry/digest validation and the current employee identity.               |
| Browser draft recovery  | Separate demo and authenticated IndexedDB draft buffers                                                                           | Keep only as a retry buffer. The live database remains the source of truth.          |
| Local test adapter      | SQLite sessions, records and file bytes on localhost                                                                              | Retain for automated tests; it is refused on Vercel and is not a live backend.       |
| Legacy interfaces       | Earlier pilot components, physical-review endpoints and independent Vite dashboard                                                | Retain for compatibility/history; do not expose them in the initial live interface.  |

## Demo-only gaps being closed

Before this branch, the category-first catalogue, unknown-item handling, supervisor catalogue approvals and save-time recording timestamp worked in the browser demo but not in the Supabase simple logger. Suppliers in private capture were free text rather than a shared catalogue. Marshal cards were site-scoped but did not have a reliable binding to the individual signed-in Auth account. Supabase mode displayed placeholder marshal pictures. The root chooser kept staff links disabled even when credentials were configured.

The live integration adds database-backed material/supplier selection and manual additions, catalogue classification metadata, Auth-bound marshal cards, private staff portraits, server-generated recording timestamps, an explicitly labelled late-time correction, immutable retry inputs and a six-column records view. Unknown classifications remain pending; an uploaded photo never establishes physical verification.

## Initial live interface

- `/gate`: approved staff sign-in, configured marshal cards and the delivery form. Other employees' cards do not grant capture permissions.
- `/records`: authorised Date, Time, Material, Supplier, Marshal and Photo table, newest first, with date/material/supplier filters and CSV export.
- Existing `/sign-in/marshal` and `/sign-in/supervisor` entrances remain compatible.
- The hosted interface has no sample arrivals, demo workspace banner, analytics dashboard, invoice workflow, OCR, vehicle-registration requirement or subscription billing.

The three catalogue groups remain **Aggregates / Sands**, **Other Materials** and **Services**. Known mappings are reused; manually entered names are saved for future selection with their pending status where classification is unknown.

## Existing schema and access controls

The original migrations create `companies`, `sites`, `user_profiles`, `company_memberships`, `site_assignments`, `roles`, `permissions`, `materials`, `suppliers`, `vehicles`, `delivery_records`, `delivery_evidence`, `delivery_reviews`, `historical_delivery_summaries`, `audit_events` and `notifications`. They also retain future commercial tables: purchase orders/lines, supplier invoices/lines and reconciliation cases. The second migration adds `traffic_marshals` and simple capture metadata.

All relevant tenant tables have RLS. Company/site identity is derived from the authenticated session; ordinary employees cannot directly update workflow tables or grant themselves a privileged membership. Gate readers see their own deliveries/photos, while authorised site supervisors see the site's records. Private storage policies check company/site/delivery access. The additional migration strengthens marshal ownership and extends these checked RPCs without dropping old tables or replacing delivery evidence.

## Deployment and access findings

The existing Vercel project is `site-material-daily-records-saas` (`prj_Vlgdw8EleaMNR9O5baMkpkcW3dfA`) in the existing team; preserve its `saas` root and Next.js build. The repository's root `source/`, `public/`, package scripts and Vercel configuration belong to the independent earlier dashboard.

At the start of this branch, the connected Vercel project reported no environment variables and the execution environment had no Supabase secrets. The supplied project URL is `https://qbiinhoxjdqegvzxmecr.supabase.co`; the user reports the project is healthy. A public project URL is not authenticated database access. No hosted migrations, live employee creation or real company records have been claimed as completed by this audit.

During implementation the user added `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Production only. Preview setup is still required for this feature branch, along with the reviewed migrations and approved staff provisioning. No production environment setting was changed by the implementation work.

## Setup and verification boundary

Follow [deployment and Supabase setup](DEPLOYMENT.md) to apply the ordered migrations, configure Auth, provision approved staff and verify the hosted workflow. Use the new operator setup for reviewed real account IDs; `setup-supabase-demo.mjs --demo-only` remains a fictional rehearsal tool and is not live onboarding.

Current release results belong in [validation](VALIDATION.md). Local SQLite, PGlite and browser tests are useful evidence but do not establish that the particular hosted project's Auth settings, Storage policies or credentials have been configured correctly. The pull request must remain unmerged and production unchanged until explicit approval.

## Changed files on this branch

The following source, setup, documentation and test files form this upgrade. Generated Next.js declarations and local test artifacts are excluded.

- `.gitignore`
- `README.md`
- `docs/REPOSITORY-STRUCTURE.md`
- `saas/.env.example`
- `saas/README.md`
- `saas/docs/DEPLOYMENT.md`
- `saas/docs/PRODUCTION-AUDIT.md`
- `saas/docs/SECURITY.md`
- `saas/docs/VALIDATION.md`
- `saas/playwright.config.ts`
- `saas/playwright.hosted.config.ts`
- `saas/scripts/provision-site.example.json`
- `saas/scripts/provision-site.mjs`
- `saas/src/app/api/auth/login/route.ts`
- `saas/src/app/api/auth/logout/route.ts`
- `saas/src/app/api/marshals/[id]/photo/route.ts`
- `saas/src/app/api/reports/route.ts`
- `saas/src/app/gate/page.tsx`
- `saas/src/app/page.tsx`
- `saas/src/app/records/page.tsx`
- `saas/src/app/sign-in/[portal]/page.tsx`
- `saas/src/components/auth/login.tsx`
- `saas/src/components/auth/sign-in-options.module.css`
- `saas/src/components/delivery-log/item-selector.tsx`
- `saas/src/components/delivery-log/live-delivery.module.css`
- `saas/src/components/delivery-log/live-form.tsx`
- `saas/src/components/delivery-log/live-records.tsx`
- `saas/src/components/delivery-log/simple-app.tsx`
- `saas/src/components/delivery-log/simple-records.tsx`
- `saas/src/components/delivery-log/supplier-selector.tsx`
- `saas/src/lib/catalogue.ts`
- `saas/src/lib/server/config.ts`
- `saas/src/lib/server/core.ts`
- `saas/src/lib/server/http.ts`
- `saas/src/lib/server/local.ts`
- `saas/src/lib/server/supabase.ts`
- `saas/src/lib/types.ts`
- `saas/supabase/migrations/202611070001_live_delivery_backend.sql`
- `saas/tests/all.ts`
- `saas/tests/e2e/live-api.spec.ts`
- `saas/tests/e2e/simple-api.spec.ts`
- `saas/tests/e2e/ui.spec.ts`
- `saas/tests/hosted/live-supabase.spec.ts`
- `saas/tests/integration/live-database.test.ts`
- `saas/tests/integration/simple-local.test.ts`
- `saas/tests/unit/config.test.ts`
- `saas/tests/unit/provision-site.test.ts`
