# DJ Civils — construction delivery management

DJ Civils is a site-arrival log: traffic marshals choose their name to open their records and record deliveries or service visits; supervisors inspect records, evidence and operational totals, and classify new items. The interface uses the supplied DJ Civils logo. The proposed pilot remains **unofficial and unauthorised**; all included supplier, ticket and delivery records are fictional. The named demo profiles are for demonstration only.

The original reporting app remains outside `saas/` and is not served by DJ Civils.

## Explore the public demo

Use Node.js **22.13 or newer**; Node.js 24 is recommended.

```bash
cd saas
npm ci
npm run dev
```

Open `http://localhost:3000/demo` and click one of the two square profile cards: **Bemigho Estano** or **Olamilekan Alaga**. Both marshal cards use their supplied portraits. The demo includes 30 sample deliveries: 20 for Bemigho Estano and 10 for Olamilekan Alaga. Open `/demo/supervisor` to see the combined records in arrival-time order. Existing browser records and photos are kept when the sample data is updated. The first page says **Sign in as**. Choosing a square photo opens the selected marshal’s saved records. **Record New Delivery** opens their entry form; **View Records** returns to the saved table. Reloading keeps your current demo session; select a marshal again to resume any pending save.

**No email, password, Supabase project, environment variables or backend session are needed for `/demo`.** The landing page and interactive demo also work on a deployment with no team backend configured.

1. Select a marshal to open their delivery records. Choose **Record New Delivery**, then choose **Category** first. The item dropdown shows only that category's items; use **Search items** inside it if needed. Selecting a known item fills its entry type automatically. Changing category clears the previous item selection.
2. Add a sample supplier/company if known and take or upload a delivery image or retained ticket. Choose **Other / Not listed** as the category, or **Other — Enter new item** from an item list, when no catalogue option fits. The exact entered name can be saved with a pending classification.
3. Press **Save Delivery** explicitly. **Recorded at** is generated at save time and displayed in Europe/London time. The selected known item stays ready for repeated arrivals while supplier and evidence are cleared. No manual time, vehicle registration, quantity or ticket number is required in the smart demo form.
4. Choose **View Records** or **Back to Records** to return to saved rows, newest first. Filter by dates, item, category, entry type, marshal or pending classification.
5. Open `/demo/supervisor` to inspect combined site records, photos and breakdowns, and approve pending catalogue items. Open `/demo` to return to marshal selection.

**Sign out** returns to the landing page. Records, catalogue changes and approvals persist across page reloads until browser site storage is cleared. The smart demo adds catalogue review and arrival breakdowns to the existing records view. Earlier physical-verification workflows and administration screens remain outside this simplified interface; their historical data and compatible backend routes remain intact.

The working pages use the DJ Civils logo with **Traffic Marshal Unit** beneath the company name. Workspace/site labels, navigation tabs and the delivery-log footer are omitted from the one-site interface.

### Supervisor entry

Open `/demo/supervisor` directly, or choose **Supervisor demo** on the landing page. It opens combined records, the photo viewer, arrival summaries and pending catalogue review, with no marshal cards or delivery form. `/demo/records?profile=b` is Bemigho’s own saved table; `/demo/delivery/b` and `/demo/delivery/olamilekan` are their entry pages. Supervisor and marshal tabs use their own view roles while sharing this browser’s saved demo data. These browser-local records are not available on another device.

Item names display as plain text. The central catalogue includes initial options across ten construction categories, preserves existing item IDs and ambiguous historical names such as **G1** and **6I**, and uses **6F5** for the seeded aggregate. Unknown names retain their entered text and wait for classification rather than being guessed. See [smart arrivals](docs/SMART-ARRIVALS.md) for catalogue matching and supervisor approval.

### Date ranges and arrival totals

Delivery Records supports inclusive **From date** and **To date** filters, such as 1–30 October. Choose any custom date range using the site timezone. Clear filters restores all dates.

Summary and material cards count recorded arrivals in the selected dates and remain horizontally scrollable. Total arrivals includes deliveries, service visits and unclassified items. Delivery, service-visit and pending totals stay separate. Select an item card to narrow the table; card counts continue to show the full selected period so items remain comparable. Additional filters cover category, entry type, marshal and classification status. Supervisor breakdowns show arrivals by item, category, service, time and marshal.

Every saved arrival counts once, including pending items; retries or catalogue approval do not create additional arrivals. The smart demo counts vehicles arriving, not tonnes, litres or stock. Existing historical aggregate summaries and older quantity fields are preserved separately.

### What the demo stores

Demo records, photos, catalogue options and pending/approved classifications stay in this browser's IndexedDB. The demo does not send them to the company APIs, create a real user session, or share them with other visitors. The existing database identifiers are retained; separate databases keep sample records and drafts away from authenticated team drafts. Catalogue upgrades add metadata and options without resetting delivery IDs, original timestamps, photos or review history.

The demo has separate marshal and supervisor entry points; these are a simulation for exploring the workflow, not real authentication or a production security boundary. Catalogue approval confirms an item's category and entry type only. Saving an arrival, uploading a photo or approving a classification never marks physical receipt as verified. Historical delivery-review decisions remain stored separately.

Use fictional information only. IndexedDB is not encrypted against someone controlling the device/browser profile. Browser storage can be unavailable, full or cleared, and these sample records have no server backup. Clear the browser's site data before handing a demo device to someone else.

## Private sign-in entrances

Use `/sign-in/marshal` for Traffic Marshals and `/sign-in/supervisor` for Supervisors / Site Managers. Both use the existing email/password authentication; no Google sign-in or identity-document upload is required. The selected entrance never changes an account's stored role.

Private access is invite-only: an operator provisions the Auth user, and an authorised company administrator assigns the company membership, role and site access. There is no public role-selection or account-registration form. Login rejects an unapproved role or missing site before issuing session cookies; company administrators may sign in before a first site exists for setup. The bootstrap endpoint also enforces the selected entrance for existing sessions.

The public browser demo remains a simulation. Private accounts cannot be activated on an unconfigured deployment. Apply the migrations, connect the Supabase environment settings in `docs/DEPLOYMENT.md`, establish the initial company administrator and provision only approved staff accounts. A dedicated self-service account-creation/approval queue is not included in this prototype; administrator membership tools and operator provisioning remain the onboarding mechanism.

## Authenticated team workspace

Team sign-in stays separate from `/demo`. It uses the configured backend and real session/permission checks; entering the demo never grants access to a company workspace. An unconfigured deployment offers the public demo without exposing backend configuration errors to visitors.

For the **local authenticated development adapter**:

```bash
cp .env.example .env.local
npm run dev
```

Set `APP_MODE=local` explicitly. Local mode accepts localhost requests only, uses Node's built-in SQLite, and refuses to run on Vercel. Fictional accounts are `gate@demo.invalid`, `supervisor@demo.invalid`, `manager@demo.invalid` and `admin@demo.invalid`, each with password `DemoPass123!`. Local server records and private photos persist in `.local-data/pilot.sqlite`; this is separate from the public browser demo.

Production team operation uses Supabase Authentication, PostgreSQL RLS, private Storage and checked transactional functions. The app uses each employee's identity rather than a runtime service-role key. Selecting a marshal records attribution separately from the authenticated creator. Gate employees can capture deliveries and view only their own records/photos; assigned supervisors can inspect their site's records. Historical deliveries and quantities are preserved. Operator-managed company/site/marshal setup remains outside the two-page interface.

Apply the additive `202611060001_simple_delivery_log.sql` migration after the original schema before using this version with an existing Supabase database. It adds marshal metadata and the simple logging function without resetting delivery or historical-summary records. The original API remains compatible with older clients, so historical or legacy deliveries without images show **No photo**. The new simple form requires an image.

The smart catalogue, pending classification and automatic save-time capture in this upgrade are enabled for the browser demo. The existing authenticated form and APIs retain their compatible behaviour; no new production schema, cloud database, authentication or billing integration is added by this demo upgrade.

See [Supabase setup and deployment](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before configuring an authenticated hosted pilot. Obtain company permission before collecting private records. No hosted Supabase verification or live URL is claimed by this README.

## Offline support

Pressing **Save Delivery** keeps the attempt and photo on the device before uploading. A failed upload/save shows an error and retains the same record/photo IDs for a safe retry. Refresh, select the same marshal and press **Save Delivery** to resume. An offline device copy is never presented as a confirmed server save. Fields are locked once an attempt is prepared so retries cannot silently alter its contents. Unsaved typing is not automatically preserved before the first save attempt.

The browser demo completes its simulated workflow locally. Neither mode promises a full offline cold start or background uploads after the browser closes. Authenticated APIs and private photos are not cached by a service worker. An expired session requires signing in again. JPEG, PNG and WebP images are accepted up to **3 MiB**; HEIC conversion and automatic compression are not implemented.

## Tests

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npx playwright test tests/e2e/ui.spec.ts
npx playwright test tests/e2e/simple-api.spec.ts tests/e2e/portal-api.spec.ts --project=api
```

The suites cover deterministic catalogue matching, pending-item approval, save-time timestamps, repeated arrivals, legacy-record preservation, reporting, permissions, evidence and duplicate retries. Run the commands above for results from your checkout; this guide does not claim that every environment or hosted backend has been verified. See [validation results](docs/VALIDATION.md) for recorded release checks and [smart arrivals](docs/SMART-ARRIVALS.md#verification) for the upgrade's expected scenarios. If the environment blocks Turbopack's worker port, use `npm run build -- --webpack` for the release-build check.

`npm run test:demo` uses `playwright.demo.config.ts` and deliberately starts without a configured backend. The explicit authenticated UI and API commands above exercise the separate local adapter. The older `api.spec.ts` includes image-free legacy submission expectations superseded by the simple logger and is not the current upgrade's regression target; no full `npm run test:e2e` pass is claimed. Install Chromium with `npx playwright install chromium` if needed; the configuration uses `/usr/bin/chromium` when available. PostgreSQL policy tests use PGlite with mocked Supabase identity/storage metadata. Those tests do not replace a real Supabase Auth/Storage smoke test when credentials are supplied.

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

The next step is a short gate-user trial of this demo and agreement on the site's catalogue and supervisor access policy. Shared cross-device records require an approved hosted backend rollout and real Supabase Auth/Storage checks; the existing infrastructure is retained for that work. No paid AI, construction API or subscription is needed for this upgrade. Production releases require explicit approval; see the deployment instructions above.
