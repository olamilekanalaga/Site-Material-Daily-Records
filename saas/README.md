# DJ Civils — site material daily records

DJ Civils is an authenticated site-movement log backed by Supabase. Former `/demo` URLs redirect to staff sign-in.

The original reporting app remains outside `saas/` and is not served by DJ Civils.

## Live staff workspace

Use the existing Vercel project and application root for any approved release.

- **Gate Delivery** (`/gate`): individual approved staff login, database-configured marshal profile cards, searchable material and supplier dropdowns, manual additions, camera/upload evidence and an explicit save. Only the account's permitted marshal card is enabled. The server saves the date and time automatically.
- **Delivery Records** (`/records`): Date, Time, Direction, Material, Supplier, Marshal and Photo, newest delivery time first, with date, direction, material and supplier filters and CSV export. Assigned supervisors see shared site records/photos; gate staff retain their permitted own-record view. Original server recording time remains available separately for audit and export.

Known catalogue mappings provide category and entry type. Material and supplier names persist in Supabase. The form requires IN or OUT for each new movement. Delivery Records includes read-only movement totals for reporting roles.

Supabase Auth, employee-scoped PostgreSQL/RLS and private Storage are the live sources of truth. IndexedDB is only a pending-save/photo retry buffer for authenticated operation. Former demo records are excluded from the staff workspace.

Start with the [production audit](docs/PRODUCTION-AUDIT.md), then follow [Supabase setup and deployment](docs/DEPLOYMENT.md). The public project URL alone is not a completed connection. Hosted migrations, credentials, staff setup and a real two-device Auth/Storage smoke test must be completed and reported separately from local test results.

## Private sign-in entrances

When a valid staff backend is configured, the homepage enables the two approved staff entrances. `/gate` opens Gate Delivery and `/records` opens Delivery Records. Existing `/sign-in/marshal` and `/sign-in/supervisor` routes remain compatible for Traffic Marshals and Supervisors / Site Managers. Both use the existing email/password authentication; no Google sign-in or identity-document upload is required. The selected entrance never changes an account's stored role. An unconfigured public deployment does not expose a usable private sign-in form.

Anyone can create an account with a unique, valid-format email and choose traffic marshal, supervisor or site manager. Supabase signs the user in immediately and the database assigns the configured site. Supervisors and site managers can read records and analytics.

Follow the [deployment guide](docs/DEPLOYMENT.md) to enable public registration. Remember me keeps a valid Supabase session across browser visits for up to 30 days between renewals. Keep your chosen password for future sign-ins.

## Authenticated team workspace

For the **local authenticated development adapter**:

```bash
cp .env.example .env.local
npm run dev
```

Set `APP_MODE=local` explicitly. Local mode accepts localhost requests only, uses Node's built-in SQLite, and refuses to run on Vercel. Fictional accounts are `gate@demo.invalid`, `supervisor@demo.invalid`, `manager@demo.invalid` and `admin@demo.invalid`, with a shared test password defined in [the local adapter](src/lib/server/local.ts). Local server records and private photos persist in `.local-data/pilot.sqlite`.

Production team operation uses Supabase Authentication, PostgreSQL RLS, private Storage and checked transactional functions. The app uses each employee's identity rather than a runtime service-role key. Marshal ownership is bound to the Auth user and checked by the API/RPC; selecting another visible card cannot impersonate that employee. Gate employees can capture deliveries and view only their own records/photos; assigned supervisors can inspect their site's records. Historical deliveries and quantities are preserved. Operator-managed company/site/marshal setup remains outside the two-page interface.

Apply the missing ordered migrations through `202611250002_streamlined_staff_auth.sql` before using the live workspace. The additive updates retain delivery IDs, evidence and historical summaries; do not rerun the initial schema against an existing database. The superseded vehicle/ticket API supports controlled corrections to existing owned legacy records but cannot create new arrivals. Historical rows without images still show **No photo**. New captures use the account-bound delivery logger and require an image.

See [Supabase setup and deployment](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before configuring an authenticated hosted pilot. Obtain company permission before collecting private records.

## Offline support

Pressing **Save Delivery** keeps the attempt and photo on the device before uploading. A failed upload/save shows an error and retains the same record/photo IDs for a safe retry. Refresh, select the same marshal and press **Save Delivery** to resume. An offline device copy is never presented as a confirmed server save. Fields are locked once an attempt is prepared so retries cannot silently alter its contents. Unsaved typing is not automatically preserved before the first save attempt.

The app does not support a full offline cold start or background uploads after the browser closes. Authenticated APIs and private photos are not cached by a service worker. An expired session requires signing in again. JPEG, PNG and WebP images are accepted up to **3 MiB**; HEIC conversion and automatic compression are not implemented.

## Tests

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npm run test:e2e
```

The suites cover deterministic catalogue matching, pending-item approval, save-time timestamps, repeated arrivals, legacy-record preservation, reporting, permissions, evidence and duplicate retries. Run the commands above for results from your checkout; this guide does not claim that every environment or hosted backend has been verified. See [validation results](docs/VALIDATION.md) for recorded release checks and [smart arrivals](docs/SMART-ARRIVALS.md#verification) for the upgrade's expected scenarios. If the environment blocks Turbopack's worker port, use `npm run build -- --webpack` for the release-build check.

`npm run test:demo` uses `playwright.demo.config.ts` to verify that retired demo URLs redirect with no backend configured. The default authenticated runner selects the current `live-api`, `simple-api`, `portal-api` and private UI suites against the local adapter. The older `api.spec.ts` keeps historical vehicle/quantity expectations and is intentionally excluded from that runner. See the validation report for the exact executed runs. Install Chromium with `npx playwright install chromium` if needed; the configuration uses `/usr/bin/chromium` when available. PostgreSQL policy tests use PGlite with mocked Supabase identity/storage metadata. Those tests do not replace a real hosted Supabase Auth/Storage smoke test.

## Source map and next phase

See the [repository folder guide](../docs/REPOSITORY-STRUCTURE.md) for the complete tree and file placement conventions.

| Path                              | Purpose                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `next.config.ts`                  | Redirects retired demo URLs to staff sign-in                                         |
| `src/components/delivery-log/`    | Marshal entry, searchable form, filtered records, private photos and movement totals |
| `src/lib/catalogue.ts`            | Central items, aliases, normalisation and classification helpers                     |
| `src/lib/delivery-records.ts`     | Date filtering and arrival-count helpers                                             |
| `src/components/auth/login.tsx`   | Staff sign-in and registration links                                                 |
| `src/app/api/`, `src/lib/server/` | Authenticated team APIs, validation and storage adapters                             |
| `src/lib/client/simple-drafts.ts` | Pending staff attempts and idempotent image upload                                   |
| `src/lib/site-time.ts`            | Site-local dates/times independent of the phone timezone                             |
| `supabase/migrations/`            | Production schema, tenant/site RLS and private-storage policies                      |
| `tests/`                          | Demo, domain, SQL and browser tests                                                  |

The next step is to complete the reviewed Supabase setup and a hosted two-device trial using approved accounts. No paid AI or construction API is required. Supabase/Vercel plans and quotas remain provider choices. Keep the feature pull request unmerged and production unchanged until approval; see the deployment instructions above.
