# Site Ledger — delivery pilot

A runnable Next.js application for gate capture, independent supervisor verification and daily site reporting. This is the new SaaS application; the repository's original static dashboard remains unchanged outside `saas/` and is not served by this app.

**DJ Civils Demo — Unofficial Prototype.** The proposed pilot has no company approval. Seeded people, suppliers, vehicles, tickets and deliveries are fictional. Do not put real company records in the local demo. The application does not import the existing dashboard's records or infer individual truck visits from historical tallies.

## Run the fictional local demo

Use Node.js **22.13 or newer**; Node.js 24 is recommended. Local persistence uses Node's built-in SQLite module.

```bash
cd saas
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. `APP_MODE=local` must be explicitly set. Local mode accepts localhost requests only and refuses to run on Vercel. It is a functional development adapter, not the production tenant-isolation boundary.

| Fictional account | Email | Password |
| --- | --- | --- |
| Gate employee | `gate@demo.invalid` | `DemoPass123!` |
| Supervisor | `supervisor@demo.invalid` | `DemoPass123!` |
| Site manager | `manager@demo.invalid` | `DemoPass123!` |
| Company administrator | `admin@demo.invalid` | `DemoPass123!` |

Additional isolated company/site users exist for the automated access-control tests. The initial demonstration site is **Demo Riverside**. Materials include GF5, G1, Type 1, Sand, 10mm shingles, 20mm shingles and Other. Sample accepted, submitted, rejected and flagged records are fictional.

SQLite records, sessions, audit events and private image bytes persist in `.local-data/pilot.sqlite` unless `LOCAL_DATA_DIR` specifies another directory. They are not under `public/`. To reset the fictional demo, stop the server and remove its `.local-data` directory; this permanently deletes that local demo's records. IndexedDB drafts on the browser are separate and can be removed through **Drafts & uploads → Discard**.

## Complete the workflow

1. Sign in as the gate employee. Choose **Record delivery**, select a material, enter arrival details and optionally photograph a ticket, vehicle or load. Manual entry and photography feed the same delivery record. Submit incomplete arrivals when necessary; the supervisor's acceptance rules identify required information.
2. Sign in separately as the supervisor. Open **Verification queue**, inspect the record and private evidence, then start review, accept, reject, flag or request correction. Acceptance requires a separate physical-receipt confirmation and accepted quantity. Rejection, flags and correction requests keep their reasons. The recorder cannot verify their own arrival.
3. Sign in as the manager. Review the delivery register and **Daily reports**. Filter by date, supplier, material and current site; export CSV or print. Recorded arrivals count distinct submitted records. Ticket and accepted quantities remain separate; different units are never added together or converted automatically.
4. As the administrator, add sites, employees, materials and suppliers, assign site access, and configure ticket-number/photo requirements for acceptance. In Supabase mode, an Auth user must first be provisioned or invited by an authorised operator, then assigned to the company in the app.

Each delivery has a stable UUID. Retry and correction preserve its identity rather than adding another arrival. Receipt statuses and commercial statuses are separate. A physically accepted delivery is not a commercial match or an authorisation to pay.

## Offline behaviour

The already-open application can save form fields and image files in IndexedDB. **Saved locally** and **Upload pending** are device states, not server submission or supervisor approval. Stable delivery/photo IDs make retries idempotent. Pending uploads retry when the authenticated app reconnects, or through **Retry pending**. If a session expires, sign in again as the same employee and resume the queue.

This release does not provide background synchronisation or a complete offline cold-start application shell. The service worker never caches authenticated API responses or private photographs. An offline navigation fallback explains how to return when connectivity is available. Keep an active capture page open on unreliable connections. Device storage can be unavailable, full or removed by the browser; until synchronisation, local drafts exist only on that device. Use managed devices and discard unneeded drafts before handing a shared device to someone else.

## Production architecture

- Next.js App Router, TypeScript, React and Tailwind CSS.
- Same-origin server APIs validate input, authenticate sessions and authorise actions.
- Supabase Authentication, PostgreSQL with Row Level Security and private Supabase Storage.
- Checked transactional database functions handle creation, correction, receipt decisions and administration. The web application uses the authenticated employee's token, never a service-role key.
- Company/site-scoped reads, original evidence and audit history. A platform role does not automatically grant company-document access.
- A separate historical-summary table preserves counts and review confidence without fabricating individual deliveries.
- Purchase order, invoice and reconciliation tables are foundations for P1; commercial workflows, OCR, billing and broader site operations are not implemented in P0.

V1 employees belong to one company and can have multiple site assignments. A company administrator manages their company. Ordinary site roles see assigned sites only. There is no public registration flow that can self-assign a privileged role.

Read [deployment and Supabase setup](docs/DEPLOYMENT.md) and [security boundaries](docs/SECURITY.md) before configuring a hosted environment.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit/database tests run with Node's test runner through `tsx`. SQL tests exercise PostgreSQL RLS using PGlite with a minimal mocked Supabase `auth`/`storage` schema. Playwright tests run against an isolated local SQLite directory and cover API access controls and browser workflows at mobile/tablet sizes. Install Chromium with `npx playwright install chromium` if no supported browser is installed. The test configuration uses `/usr/bin/chromium` when available.

PGlite and local browser tests do not replace a smoke test against an actual configured Supabase Auth/Storage project. See the implementation handoff for the test results obtained in this environment; the commands above are the reproducible checks, not a claim that hosted services were available.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/components/` | Gate capture, register, review, reports and administration interfaces |
| `src/app/api/` | Authenticated server endpoints and exports |
| `src/lib/server/` | Validation, permissions, local adapter and Supabase adapter |
| `src/lib/offline.ts` | IndexedDB drafts, resumable photo uploads and submission retries |
| `src/lib/reporting.ts` | Unit-aware summaries and site-date handling |
| `supabase/migrations/` | Production schema, constraints, RLS, workflow functions and private-storage policies |
| `tests/` | Database, domain and end-to-end tests |
| `.env.example` | Explicit local/production configuration template |

No paid construction API is required. Photographs support traceability; a ticket image, signed ticket or GPS position is not independent proof of the correct material quantity arriving. The application improves accountability and does not claim to eliminate fraud.
