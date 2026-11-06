# DJCU — construction delivery management

DJCU captures arrivals, keeps ticket evidence, separates supervisor receipt checks from gate entries, and produces daily site reports. The interface uses the supplied DJ Civils logo. The proposed pilot remains **unofficial and unauthorised**; all included supplier, ticket and delivery records are fictional. The named demo profiles are for demonstration only.

The original reporting app remains outside `saas/` and is not served by DJCU.

## Explore the public demo

Use Node.js **22.13 or newer**; Node.js 24 is recommended.

```bash
cd saas
npm ci
npm run dev
```

Open `http://localhost:3000` or `http://localhost:3000/demo` and click one of the two square profile tiles: **B Traffic Marshal** or **Olamilekan Alaga**. Either opens the software directly as a traffic marshal. New deliveries record the chosen name; **Switch marshal** lets you choose the other profile. Reloading keeps your current demo session.

**No email, password, Supabase project, environment variables or backend session are needed for `/demo`.** The landing page and interactive demo also work on a deployment with no team backend configured.

1. As **Gate staff**, choose **Record delivery**, select a material and enter fictional arrival details. Add a sample image if desired, then submit.
2. Use **Demo role** to switch to **Supervisor**. Open the verification queue, inspect the record and make a simulated receipt decision. Ticket quantity and accepted quantity remain separate.
3. Switch to **Site manager** to review tallies, filter reports, download CSV or print.
4. Switch to **Administrator** to explore sample catalogue/site settings.

Use **Reset demo** to remove this browser's demo records, attached photos and demo drafts and restore the fictional samples. **Exit demo** returns to the landing page. Changes persist across page reloads until reset or browser storage is cleared.

### What the demo stores

Demo records and photos stay in this browser's IndexedDB. The demo does not send them to the company APIs, create a real user session, or share them with other visitors. Its separate databases keep sample records and drafts away from authenticated team drafts.

Role switching is a simulation for exploring the workflow, not real authentication or a production security boundary. An “Accepted” demo record represents a simulated decision; it does not establish that any material physically arrived. A ticket photograph documents a ticket and is not independent proof of delivery.

Use fictional information only. IndexedDB is not encrypted against someone controlling the device/browser profile. Browser storage can be unavailable, full or cleared, and these sample records have no server backup. Reset the demo before handing a shared device to someone else.

## Authenticated team workspace

Team sign-in stays separate from `/demo`. It uses the configured backend and real session/permission checks; entering the demo never grants access to a company workspace. An unconfigured deployment offers the public demo without exposing backend configuration errors to visitors.

For the **local authenticated development adapter**:

```bash
cp .env.example .env.local
npm run dev
```

Set `APP_MODE=local` explicitly. Local mode accepts localhost requests only, uses Node's built-in SQLite, and refuses to run on Vercel. Fictional accounts are `gate@demo.invalid`, `supervisor@demo.invalid`, `manager@demo.invalid` and `admin@demo.invalid`, each with password `DemoPass123!`. Local server records and private photos persist in `.local-data/pilot.sqlite`; this is separate from the public browser demo.

Production team operation uses Supabase Authentication, PostgreSQL RLS, private Storage and checked transactional workflow functions. The app uses each employee's identity rather than a runtime service-role key. Employees belong to one company and can have multiple site assignments; supervisors cannot verify their own arrivals. Corrections, reviews and evidence remain auditable. Historical tallies stay separate from individual deliveries; incompatible quantity units are never combined.

See [Supabase setup and deployment](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before configuring an authenticated hosted pilot. Obtain company permission before collecting private records. No hosted Supabase verification or live URL is claimed by this README.

## Offline support

The already-open app can save drafts and photo files locally. In the team workspace, **Saved locally** and **Upload pending** are distinct from a confirmed server submission. Stable record/photo IDs allow retries without another counted arrival. Reconnect or choose **Retry pending**; an expired session requires signing in again.

The browser demo completes its simulated workflow locally. Neither mode promises a full offline cold start or background uploads after the browser closes. The service worker does not cache authenticated APIs or private photos. Keep a capture page open on unreliable site connections and use managed devices for an authorised pilot.

## Tests

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npm run test:e2e
```

Verified demo coverage: **18 demo engine tests** and **12 browser tests** across phone, tablet and desktop. Browser checks cover one-click profile entry without credentials/backend requests, distinct marshal attribution, photo and manual capture, simulated supervisor review, reports/CSV, persistence and reset. The complete unit/SQL suite currently passes **39 tests**.

`npm run test:demo` uses `playwright.demo.config.ts` and deliberately starts without a configured backend. `npm run test:e2e` exercises the separate authenticated local adapter. Install Chromium with `npx playwright install chromium` if needed; the configuration uses `/usr/bin/chromium` when available. PostgreSQL policy tests use PGlite with mocked Supabase identity/storage metadata. Those tests do not replace a real Supabase Auth/Storage smoke test when credentials are supplied.

## Source map and next phase

| Path                              | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `src/app/demo/`, `src/lib/demo/`  | Credential-free browser demo and persistent fictional state     |
| `src/components/`                 | Capture, register, review, reports and administration           |
| `src/app/api/`, `src/lib/server/` | Authenticated team APIs, validation and storage adapters        |
| `src/lib/offline.ts`              | Separate demo/team drafts and retry handling                    |
| `supabase/migrations/`            | Production schema, tenant/site RLS and private-storage policies |
| `tests/`                          | Demo, domain, SQL and browser tests                             |

P0 focuses on delivery accountability. Purchase order, invoice and reconciliation tables prepare for P1; commercial screens, OCR, billing and broader site operations are later work. No paid construction API is required.
