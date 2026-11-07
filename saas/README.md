# DJ Civils — site material daily records

DJ Civils is an existing site-arrival application with two separate modes: an authenticated, database-backed staff workspace and an explicit browser-local demonstration. The interface reuses the supplied DJ Civils branding. Included demo deliveries/suppliers are fictional; they are never inserted into the live workspace. Use real company evidence only for an authorised site rollout.

The original reporting app remains outside `saas/` and is not served by DJ Civils.

## Live staff workspace

The production integration is prepared on `feat/production-delivery-backend` for pull-request review. **Do not merge or deploy production without approval.** The existing Vercel project/root and hosted demo are preserved.

- **Gate Delivery** (`/gate`): individual approved staff login, database-configured marshal profile cards, searchable material and supplier dropdowns, manual additions, camera/upload evidence and an explicit save. Only the account's permitted marshal card is enabled. The server generates recording time; a clearly labelled correction retains the original timestamp and requires a reason.
- **Delivery Records** (`/records`): Date, Time, Material, Supplier, Marshal and Photo, newest delivery time first, with date/material/supplier filters and CSV export. Assigned supervisors see shared site records/photos; gate staff retain their permitted own-record view. Original server recording time remains available separately for audit and export.

Known catalogue mappings provide category and entry type. Unrecognised material classifications remain pending rather than being guessed; a selected group is only a proposal until classification is approved. Material and supplier names persist in PostgreSQL for future selection. The live interface omits sample records, demo banners, analytics dashboards and unused navigation.

Supabase Auth, employee-scoped PostgreSQL/RLS and private Storage are the live sources of truth. IndexedDB is only a pending-save/photo retry buffer for authenticated operation. Existing browser demo records do not automatically migrate to Supabase.

Start with the [production audit](docs/PRODUCTION-AUDIT.md), then follow [Supabase setup and deployment](docs/DEPLOYMENT.md). The public project URL alone is not a completed connection. Hosted migrations, credentials, staff setup and a real two-device Auth/Storage smoke test must be completed and reported separately from local test results.

## Explore the public demo

Use Node.js **22.13 or newer**; Node.js 24 is recommended.

```bash
cd saas
npm ci
npm run dev
```

On an unconfigured deployment, `http://localhost:3000` offers four aligned options: two disabled staff entrances and the two accessible demos. A configured staff workspace instead offers the approved staff entrances, with no demo panel. `/demo` remains available explicitly and never grants a staff session.

Choose **Traffic Marshal demo** to open `/demo`, then click one of the two square profile cards: **Bemigho Estano** or **Olamilekan Alaga**. Both marshal cards use their supplied portraits. The demo includes 30 sample deliveries: 20 for Bemigho Estano and 10 for Olamilekan Alaga. Choose **Supervisor demo** (`/demo/supervisor`) to see the combined records in arrival-time order. Existing browser records and photos are kept when the sample data is updated. The marshal demo page says **Sign in as**. Choosing a square photo opens the selected marshal’s delivery-entry form directly. **View Records** opens the saved table; **Record New Delivery** returns to entry. For a selected marshal, the company-logo Home link also opens the delivery form. Reloading the delivery page keeps the selected profile; select the same marshal again to resume any pending save.

**No email, password, Supabase project, environment variables or backend session are needed for `/demo`.** The landing page and interactive demo also work on a deployment with no team backend configured.

1. Select a marshal to open their delivery-entry form directly, then choose one of three categories: **Aggregates / Sands**, **Other Materials** or **Services**. The item dropdown shows only that category's available items; use **Search items** inside it if needed. Changing category clears the previous item selection.
2. Add a sample supplier/company if known and take or upload a delivery image or retained ticket. Choose **Other — Enter new item** from the selected category's item list when no option fits. A new unknown name keeps its exact entered text and chosen category, and can be saved immediately while awaiting supervisor catalogue review.
3. Press **Save Delivery** explicitly. **Recorded at** is generated at save time and displayed in Europe/London time. The selected known item stays ready for repeated arrivals while supplier and evidence are cleared. No manual time, vehicle registration, quantity or ticket number is required in the smart demo form.
4. Choose **View Records** or **Back to Records** to return to **Daily Records**, initially showing the current site day's saved rows, newest first. Filter by dates, item, category, entry type, marshal or pending classification.
5. Open `/demo/supervisor` to inspect combined site records, photos and breakdowns, and approve pending catalogue items. Open `/demo` to return to marshal selection.

**Sign out** returns to the landing page. Records, catalogue changes and approvals persist across page reloads until browser site storage is cleared. The smart demo adds catalogue review and arrival breakdowns to the existing records view. Earlier physical-verification workflows and administration screens remain outside this simplified interface; their historical data and compatible backend routes remain intact.

The working pages use the DJ Civils logo with **Traffic Marshal Unit** beneath the company name. Workspace/site labels, navigation tabs and the delivery-log footer are omitted from the one-site interface.

### Supervisor entry

Open `/demo/supervisor` directly, or choose **Supervisor demo** on the landing page. It opens combined records, the photo viewer, arrival summaries and pending catalogue review, with no marshal cards or delivery form. `/demo/records?profile=b` is Bemigho’s own saved table; `/demo/delivery/b` and `/demo/delivery/olamilekan` are their entry pages. Supervisor and marshal tabs use their own view roles while sharing this browser’s saved demo data. These browser-local records are not available on another device.

The five-column records table shows Traffic marshal (small circular profile picture), Item, Category, Logistics company and Photo. The supplied portraits identify the two sample marshals without visible name text; other staff use a placeholder with their accessible name. Dates and times remain stored for ordering, custom date filters and exports, but are hidden from the table. Entry type is retained internally for delivery/service totals, filtering and supervisor catalogue approval; it has no delivery-form field, records-table column or arrival-CSV column.

Item names display as plain text. **Aggregates / Sands** initially contains the existing aggregate, sand, concrete and cement options. **Other Materials** starts with **Pipes** and **Cables**; **Services** starts with **Fuel**, **Toilets** and **Welfare**. Every category has a manual-entry option. The central catalogue retains all 69 earlier definitions plus these five new names, preserving existing IDs and ambiguous historical names such as **G1** and **6I**. Other earlier options remain stored for history but are omitted from the initial capture menus; explicitly entering an exact known name makes it available again. Unknown names wait for supervisor approval before becoming normal dropdown options. See [smart arrivals](docs/SMART-ARRIVALS.md) for matching, compatibility and approval.

### Date ranges and arrival totals

**Daily Records** defaults to the current Europe/London site day, from site midnight to the following midnight. The automatic view moves to the new day at midnight. Editing **From date** or **To date** selects a custom range, such as 1–30 October; that range stays fixed across midnight while the records view remains open. **Clear filters** restores the automatic current-day view. Reopening the page starts with today.

The table, summary cards and arrival CSV use the same effective dates. Earlier arrivals remain stored and can be viewed through custom ranges; changing the day does not delete records.

Summary and material cards count recorded arrivals in the selected dates and remain horizontally scrollable. Total arrivals includes deliveries, service visits and unclassified items. Delivery, service-visit and pending totals stay separate. Select an item card to narrow the table; card counts continue to show the full selected period so items remain comparable. Additional filters cover category, entry type, marshal and classification status. Supervisor breakdowns show arrivals by item, category, service and marshal. The **Services** category is independent of entry type: fuel or facility deliveries do not become service visits merely because they share that category.

Every saved arrival counts once, including pending items; retries or catalogue approval do not create additional arrivals. The smart demo counts vehicles arriving, not tonnes, litres or stock. Existing historical aggregate summaries and older quantity fields are preserved separately.

### What the demo stores

Demo records, photos, catalogue options and pending/approved classifications stay in this browser's IndexedDB. The demo does not send them to the company APIs, create a real user session, or share them with other visitors. The existing database identifiers are retained; separate databases keep sample records and drafts away from authenticated team drafts. Catalogue upgrades add metadata and options without resetting delivery IDs, original timestamps, photos or review history.

The demo has separate marshal and supervisor entry points; these are a simulation for exploring the workflow, not real authentication or a production security boundary. Catalogue approval confirms an item's category and entry type only. Saving an arrival, uploading a photo or approving a classification never marks physical receipt as verified. Historical delivery-review decisions remain stored separately.

Use fictional information only. IndexedDB is not encrypted against someone controlling the device/browser profile. Browser storage can be unavailable, full or cleared, and these sample records have no server backup. Clear the browser's site data before handing a demo device to someone else.

## Private sign-in entrances

When a valid staff backend is configured, the homepage enables the two approved staff entrances. `/gate` opens Gate Delivery and `/records` opens Delivery Records. Existing `/sign-in/marshal` and `/sign-in/supervisor` routes remain compatible for Traffic Marshals and Supervisors / Site Managers. Both use the existing email/password authentication; no Google sign-in or identity-document upload is required. The selected entrance never changes an account's stored role. An unconfigured public deployment does not expose a usable private sign-in form.

Private access is invite-only: an operator provisions the Auth user, and an authorised company administrator assigns the company membership, role and site access. There is no public role-selection or account-registration form. Login rejects an unapproved role or missing site before issuing session cookies; company administrators may sign in before a first site exists for setup. The bootstrap endpoint also enforces the selected entrance for existing sessions.

The public browser demo remains a simulation. Private accounts cannot be activated on an unconfigured deployment. Apply the ordered migrations, connect the Supabase environment settings in `docs/DEPLOYMENT.md` and provision only approved staff accounts. There is no public registration, self-service role selection or password-recovery UI; initial credentials and account recovery are operator-managed in Supabase.

## Authenticated team workspace

Team sign-in stays separate from `/demo`. It uses the configured backend and real session/permission checks; entering the demo never grants access to a company workspace. An unconfigured deployment offers the public demo without exposing backend configuration errors to visitors.

For the **local authenticated development adapter**:

```bash
cp .env.example .env.local
npm run dev
```

Set `APP_MODE=local` explicitly. Local mode accepts localhost requests only, uses Node's built-in SQLite, and refuses to run on Vercel. Fictional accounts are `gate@demo.invalid`, `supervisor@demo.invalid`, `manager@demo.invalid` and `admin@demo.invalid`, each with password `DemoPass123!`. Local server records and private photos persist in `.local-data/pilot.sqlite`; this is separate from the public browser demo.

Production team operation uses Supabase Authentication, PostgreSQL RLS, private Storage and checked transactional functions. The app uses each employee's identity rather than a runtime service-role key. Marshal ownership is bound to the Auth user and checked by the API/RPC; selecting another visible card cannot impersonate that employee. Gate employees can capture deliveries and view only their own records/photos; assigned supervisors can inspect their site's records. Historical deliveries and quantities are preserved. Operator-managed company/site/marshal setup remains outside the two-page interface.

Apply the missing ordered migrations through `202611070001_live_delivery_backend.sql` before using the live workspace. The additive updates retain delivery IDs, evidence and historical summaries; do not rerun the initial schema against an existing database. The superseded vehicle/ticket API supports controlled corrections to existing owned legacy records but cannot create new arrivals. Historical rows without images still show **No photo**. New captures use the account-bound delivery logger and require an image.

The smart catalogue, pending classification and automatic save-time capture in this upgrade are enabled for the browser demo. The existing authenticated form and APIs retain their compatible behaviour; no new production schema, cloud database, authentication or billing integration is added by this demo upgrade.

See [Supabase setup and deployment](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before configuring an authenticated hosted pilot. Obtain company permission before collecting private records. The existing public demo URL is separate from hosted Supabase verification; this README does not claim that the user's project has been migrated or tested.

## Offline support

Pressing **Save Delivery** keeps the attempt and photo on the device before uploading. A failed upload/save shows an error and retains the same record/photo IDs for a safe retry. Refresh, select the same marshal and press **Save Delivery** to resume. An offline device copy is never presented as a confirmed server save. Fields are locked once an attempt is prepared so retries cannot silently alter its contents. Unsaved typing is not automatically preserved before the first save attempt.

The browser demo completes its simulated workflow locally. Neither mode promises a full offline cold start or background uploads after the browser closes. Authenticated APIs and private photos are not cached by a service worker. An expired session requires signing in again. JPEG, PNG and WebP images are accepted up to **3 MiB**; HEIC conversion and automatic compression are not implemented.

## Tests

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npm run test:e2e
```

The suites cover deterministic catalogue matching, pending-item approval, save-time timestamps, repeated arrivals, legacy-record preservation, reporting, permissions, evidence and duplicate retries. Run the commands above for results from your checkout; this guide does not claim that every environment or hosted backend has been verified. See [validation results](docs/VALIDATION.md) for recorded release checks and [smart arrivals](docs/SMART-ARRIVALS.md#verification) for the upgrade's expected scenarios. If the environment blocks Turbopack's worker port, use `npm run build -- --webpack` for the release-build check.

`npm run test:demo` uses `playwright.demo.config.ts` and deliberately starts without a configured backend. The default authenticated runner selects the current `live-api`, `simple-api`, `portal-api` and private UI suites against the local adapter. The older `api.spec.ts` keeps historical vehicle/quantity expectations and is intentionally excluded from that runner. See the validation report for the exact executed runs. Install Chromium with `npx playwright install chromium` if needed; the configuration uses `/usr/bin/chromium` when available. PostgreSQL policy tests use PGlite with mocked Supabase identity/storage metadata. Those tests do not replace a real hosted Supabase Auth/Storage smoke test.

## Source map and next phase

See the [repository folder guide](../docs/REPOSITORY-STRUCTURE.md) for the complete tree and file placement conventions.

| Path                              | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `src/app/demo/`, `src/lib/demo/`  | Credential-free browser demo and persistent fictional state                   |
| `src/components/delivery-log/`    | Marshal entry, searchable form, filtered records, photos and catalogue review |
| `src/lib/catalogue.ts`            | Central items, aliases, normalisation and classification helpers              |
| `src/lib/delivery-records.ts`     | Date filtering and arrival-count helpers                                      |
| `src/components/auth/login.tsx`   | Existing team sign-in and credential-free demo entry                          |
| `src/app/api/`, `src/lib/server/` | Authenticated team APIs, validation and storage adapters                      |
| `src/lib/client/simple-drafts.ts` | Separate demo/team pending attempts and idempotent image upload               |
| `src/lib/site-time.ts`            | Site-local dates/times independent of the phone timezone                      |
| `supabase/migrations/`            | Production schema, tenant/site RLS and private-storage policies               |
| `tests/`                          | Demo, domain, SQL and browser tests                                           |

The next step is to complete the reviewed Supabase setup and a hosted two-device trial using approved accounts. No paid AI or construction API is required. Supabase/Vercel plans and quotas remain provider choices. Keep the feature pull request unmerged and production unchanged until approval; see the deployment instructions above.
