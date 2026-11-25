# Deployment and Supabase setup

This guide connects the existing `saas/` application to an approved Supabase workspace. The public browser demo remains separate at `/demo`. Production integration work is prepared on `feat/production-delivery-backend`; do not merge the pull request, change production environment variables or deploy production before approval.

The existing application hostname is `https://site-material-daily-records-saas.vercel.app`. The supplied Supabase project URL is `https://qbiinhoxjdqegvzxmecr.supabase.co`. A healthy project and a public URL do not establish that the app's tables, staff accounts, Auth settings or Storage policies are installed.

## 1. Preserve the existing Vercel project

Use the existing **site-material-daily-records-saas** project and keep its **Root Directory `saas`**, Next.js preset and `npm run build` command. Node.js **24.x** is recommended. Next.js manages the output directory.

Do not import the repository root as a new app or change the independent earlier dashboard's root `vercel.json`, `public/` or `source/`. See the [repository structure](../../docs/REPOSITORY-STRUCTURE.md). Branch previews may build for review; they do not authorise a production release.

At the start of this branch the connected Vercel project had no configured environment variables. No Supabase credentials or hosted migration results are assumed by this guide. Use provider settings or a protected execution environment for credentials; do not paste passwords, database connection strings or privileged keys into chat, source files or a pull request.

## 2. Inspect and apply the database migrations

First inspect the Supabase project's tables and migration history. Take an appropriate backup before upgrading an existing database. Preserve every existing company, site, delivery, evidence file and historical summary.

For a **new, empty application database**, apply these files in filename order using the project's existing migration workflow or Supabase SQL Editor:

1. `supabase/migrations/202611050001_delivery_pilot.sql`
2. `supabase/migrations/202611060001_simple_delivery_log.sql`
3. `supabase/migrations/202611070001_live_delivery_backend.sql`

The first two files create the existing tenant schema, RLS, private delivery evidence and simple-capture workflow. The third file is the additive live upgrade: material/supplier catalogue metadata, account-bound marshal cards, private portraits, server recording timestamps, explicit time correction and checked catalogue/capture RPCs.

For an **existing application database**, compare the applied migration history with these files and run only missing migrations. Do not rerun the initial create-table migration or replace tables to make an error disappear. If SQL Editor was used previously, reconcile that history before switching to a CLI migration workflow.

The migrations create private `delivery-evidence` and `staff-portraits` buckets. Verify that neither is public. Do not relax RLS or use a service key in the app to bypass a failing policy. The operator-only `app_provisioning_status()` reports readiness before staff setup; ordinary authenticated users cannot run it or the catalogue seeding helper.

The live migration retains existing records and workflow functions. Ambiguous or unbound legacy marshal cards require an operator to map the correct Auth user; a name match must not silently grant another employee's profile.

## 3. Create approved individual accounts

In **Supabase → Authentication**, keep email/password sign-in enabled and public registration disabled. Set the application site URL to the intended preview or live origin and allow only the redirect URLs that are actually needed.

Create an individual, confirmed Auth account for each approved employee. Record its Auth UUID, deliver the initial password through a secure channel and never share a single marshal account. This MVP does not implement an invitation callback, self-service password setup or a password-recovery page; account creation and recovery are operator-managed in Supabase. There is no Google sign-in or identity-document upload requirement.

Auth account creation alone grants no company access. Each account also needs the intended company membership, stored role and site assignment. A gate account must be bound to its own `traffic_marshals.user_id`. Other configured site cards may be shown disabled; clicking a card never changes the signed-in identity or grants supervisor access.

## 4. Provision the company, site and staff roster

Use the new **operator-only** script after all three migrations. The older `setup-supabase-demo.mjs --demo-only` creates fictional fixture accounts and is retained for reference; it is not live company onboarding.

Copy `scripts/provision-site.example.json` to `site-config.local.json` or a protected location outside Git. Replace every placeholder with reviewed company/site/card UUIDs, approved names and the already-created Auth UUIDs. The example intentionally contains invalid placeholder IDs so it cannot be applied accidentally. Generate new company/site/card UUIDs once and retain the reviewed config for safe retries. Reuse actual IDs for an existing workspace.

The config contains no passwords or API keys. `project_url` must match the intended Supabase project exactly. Gate staff have a `marshal` object; supervisors, site managers and optional company administrators do not. To show the two supplied marshal portraits, use approved local image files in each marshal's `photo_file`; paths are relative to the config file. Remove `photo_file` if no approved portrait exists yet. The script uploads these files privately under company/site/marshal paths rather than embedding a real staff photo in public application code.

From `saas/`, first validate configuration and local portrait files **without network access**:

```bash
node scripts/provision-site.mjs --config site-config.local.json --validate-only
```

In a separate protected operator environment, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The latter is a privileged operator credential, never a browser key or web-app runtime setting. The script does not need staff passwords and does not create Auth accounts.

Run the default **read-only plan**:

```bash
node scripts/provision-site.mjs --config site-config.local.json
```

Review the project origin and plan. The script verifies migration readiness, private buckets, existing Auth accounts, company/site identity and any existing memberships/profile bindings before it writes. It refuses conflicting company ownership, role changes, inactive/conflicting marshal cards and duplicate card bindings.

Only after reviewing the intended plan, apply it:

```bash
node scripts/provision-site.mjs --config site-config.local.json --apply
```

This creates missing company/site/membership/assignment/card rows, sets the reviewed staff display names, uploads approved portraits and seeds the known catalogue through the operator-only helper. It creates **no sample suppliers, arrival records, passwords or Auth accounts**. The built-in material catalogue contains known names/classifications, not a claim that those materials are used at this site. Unknown names entered later by authorised staff remain pending classification.

Setup spans Auth lookups, PostgreSQL calls and Storage; it is not one cross-service transaction. On failure, no automatic rollback/deletion is performed. Inspect partial setup, correct the configuration and rerun using the same reviewed IDs. The script never changes an existing employee's stored role and never overwrites a different portrait during a retry. Remove privileged credentials from the operator environment when finished.

## 5. Configure a review deployment

Set the following in the existing Vercel project's **Preview** environment, scoped to the feature branch when appropriate:

```dotenv
APP_MODE=supabase
SUPABASE_URL=https://qbiinhoxjdqegvzxmecr.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLIC_PUBLISHABLE_KEY
```

Use the project's public `sb_publishable_…` API key. The legacy `SUPABASE_ANON_KEY` remains a compatibility fallback only for a public legacy anon JWT; do not use it for a service-role, secret or employee access token. The server rejects privileged runtime keys.

The application uses a server API boundary with HttpOnly employee session cookies. The public API key is used with the authenticated employee's JWT, so RLS still applies. No `NEXT_PUBLIC_` secret or browser service-role client is required. `SUPABASE_SERVICE_ROLE_KEY` must not be added to Vercel application settings.

`APP_ORIGIN` may be set to the exact preview origin after the preview hostname is known, or left unset to use the request's same-origin default. Do not point Preview at the production origin. For an approved production deployment, set it explicitly:

```dotenv
APP_ORIGIN=https://site-material-daily-records-saas.vercel.app
```

An origin has no trailing page path such as `/gate` or `/records`. Environment changes require a fresh build in the selected environment. An unavailable Supabase service fails clearly; the live app does not fall back to browser demo records.

Do not set `APP_MODE=local` on Vercel: this localhost-only SQLite test adapter is deliberately refused on hosted deployments. It cannot provide persistent production data on an ephemeral function filesystem.

## 6. Verify the hosted workflow before release

Run the available local checks using the repository's configured package manager:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:demo
npm run test:e2e
```

Use the focused API/hosted smoke commands recorded in [validation](VALIDATION.md) for this branch. Existing PostgreSQL tests use PGlite and mocked Auth/Storage metadata; local browser/API tests use SQLite. Neither proves that the actual hosted Auth or Storage service has been configured correctly.

Using approved test accounts and clearly marked test records in the intended hosted workspace:

1. Sign in as a marshal at `/gate`; select only their authorised card.
2. Choose or manually add a material and supplier, then take/upload a JPEG, PNG or WebP image up to 3 MiB.
3. Save. Confirm success appears only after the private image and submitted database record are persisted.
4. Refresh. Confirm the same record, selected catalogues and private photo remain available.
5. Sign in as an assigned supervisor on another device at `/records`; verify the same record/photo and date/material/supplier filters.
6. Confirm the Date, Time, Material, Supplier, Marshal and Photo table is ordered by delivery time, newest first, and CSV matches the filtered rows. The server recording timestamp remains separate from a corrected delivery time.
7. Test a labelled time correction; ensure the original server recording time is retained and the correction reason is recorded.
8. Simulate a failed upload or interrupted final response, retry, and confirm only one submitted arrival exists.
9. Confirm signed-out visitors, unassigned sites, another company and a forged marshal ID cannot read/modify protected records or files.

Saving a record or uploading a photo does not physically verify receipt. Historical physical reviews remain separate.

## 7. Release only after approval

Keep the feature branch and pull request open for review. After approval, copy the reviewed configuration into the intended **Production** environment, release the reviewed source and repeat the short two-device smoke test. Preserve the existing hostname and application root. Do not infer approval from a successful preview build.

Before using real company evidence, agree the site's access/retention policy and operator-managed recovery, and configure appropriate database and photo backups. Supabase database backups do not by themselves replace a separate photo-file recovery plan. The current offline scope is an attempted-save buffer and retry support, not an offline cold start or background upload guarantee.

The MVP excludes OCR, external construction APIs, quantity/stock calculations, invoice reconciliation, billing, labour modules and analytics dashboards. Their earlier foundations remain in the repository without being exposed in the live workflow.
