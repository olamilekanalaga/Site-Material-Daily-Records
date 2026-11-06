# DJ Civils — construction delivery management

DJ Civils is a delivery log: traffic marshals choose their name, then record deliveries on a separate entry page, and supervisors inspect saved Delivery Records and private photos. The interface uses the supplied DJ Civils logo. The proposed pilot remains **unofficial and unauthorised**; all included supplier, ticket and delivery records are fictional. The named demo profiles are for demonstration only.

The original reporting app remains outside `saas/` and is not served by DJ Civils.

## Explore the public demo

Use Node.js **22.13 or newer**; Node.js 24 is recommended.

```bash
cd saas
npm ci
npm run dev
```

Open `http://localhost:3000/demo` and click one of the two square profile cards: **B** or **Olamilekan Alaga**. Olamilekan's card uses the supplied portrait; B retains a placeholder. The demo includes 10 fictional sample deliveries, five for each marshal. Select **View as supervisor** to see all ten together. Existing browser records and photos are kept when the sample data is updated. The first page says **Sign in as**. Choosing a square photo opens the next page with the selected marshal’s delivery form. **View Records** opens the saved table. Reloading keeps your current demo session; select a marshal again to resume any pending save.

**No email, password, Supabase project, environment variables or backend session are needed for `/demo`.** The landing page and interactive demo also work on a deployment with no team backend configured.

1. Select a marshal, choose a material, enter a fictional supplier/company, check the editable site-local time and take or upload a sample image.
2. Press **Save Delivery**. Successful saving clears the form for the next delivery. The date and submission timestamp are recorded automatically. No vehicle registration, quantity or ticket number is required.
3. Open **Delivery Records** to see saved rows, newest arrival first, and filter by date or material.
4. Choose **View as supervisor** to inspect all sample site deliveries and open their photos. Open `/demo` to return to marshal selection.

**Sign out** returns to the landing page. Changes persist across page reloads until browser site storage is cleared. The simplified interface does not expose the previous dashboards, reports, administration screens or review queue; their historical data and compatible backend routes remain intact.

### Supervisor entry

Open `/demo/supervisor` directly, or choose **Supervisor demo** on the landing page. It opens the records table and photo viewer with no marshal cards or delivery form. `/demo/records?profile=b` is B’s own saved table; `/demo/delivery/b` and `/demo/delivery/olamilekan` are their entry pages. Supervisor and marshal tabs use their own view roles while sharing this browser’s saved demo data. Another device needs the authenticated shared backend to see these deliveries.

Material names display as plain text. The seeded material catalogue uses **6F5**; existing demo entries keep their material IDs when the old GF5 spelling is corrected.

### Date ranges and delivery totals

Delivery Records supports inclusive **From date** and **To date** filters, such as 1–30 October. Shortcuts cover All dates, Today, Last 3 days, Last 7 days and This month using the site timezone; rolling periods include today.

The Total deliveries card and material cards count recorded arrivals in the selected dates. They remain in one horizontally scrollable row. Select a material card to narrow the table, or Total deliveries to show all materials again. Card counts continue to show the full selected period so materials remain comparable. Counts do not add ticket quantities or combine measurement units; historical aggregate summaries are separate.

### What the demo stores

Demo records and photos stay in this browser's IndexedDB. The demo does not send them to the company APIs, create a real user session, or share them with other visitors. Its separate databases keep sample records and drafts away from authenticated team drafts.

The demo has separate marshal and supervisor entry points; these are a simulation for exploring the workflow, not real authentication or a production security boundary. Saving a delivery or uploading a photo never marks physical receipt as verified. Historical review decisions remain stored separately.

Use fictional information only. IndexedDB is not encrypted against someone controlling the device/browser profile. Browser storage can be unavailable, full or cleared, and these sample records have no server backup. Clear the browser's site data before handing a demo device to someone else.

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
npm run test:e2e
```

The unit/SQL suite passes **58 tests**, and authenticated/API plus credential-free demo browser suites pass **32 tests**. The production build passed using `npm run build -- --webpack`; the default Turbopack worker port is blocked in this workspace. The automated checks cover the new simple workflow, migration preservation, permissions, private evidence, duplicate retries, site time/DST and previous backend behaviour. See [validation results](docs/VALIDATION.md) for the latest browser and release-build checks.

`npm run test:demo` uses `playwright.demo.config.ts` and deliberately starts without a configured backend. `npm run test:e2e` exercises the separate authenticated local adapter. Install Chromium with `npx playwright install chromium` if needed; the configuration uses `/usr/bin/chromium` when available. PostgreSQL policy tests use PGlite with mocked Supabase identity/storage metadata. Those tests do not replace a real Supabase Auth/Storage smoke test when credentials are supplied.

## Source map and next phase

See the [repository folder guide](../docs/REPOSITORY-STRUCTURE.md) for the complete tree and file placement conventions.

| Path                              | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `src/app/demo/`, `src/lib/demo/`  | Credential-free browser demo and persistent fictional state     |
| `src/components/delivery-log/`    | Home, inline delivery form and filtered records/photo viewer    |
| `src/components/auth/login.tsx`   | Existing team sign-in and credential-free demo entry            |
| `src/app/api/`, `src/lib/server/` | Authenticated team APIs, validation and storage adapters        |
| `src/lib/client/simple-drafts.ts` | Separate demo/team pending attempts and idempotent image upload |
| `src/lib/site-time.ts`            | Site-local dates/times independent of the phone timezone        |
| `supabase/migrations/`            | Production schema, tenant/site RLS and private-storage policies |
| `tests/`                          | Demo, domain, SQL and browser tests                             |

The next step is an approved hosted Supabase smoke test and a short gate-user trial of this simple flow. Analytical reporting can be added later without changing historical records. No paid construction API is required. Production releases require explicit approval; see the deployment instructions above.
