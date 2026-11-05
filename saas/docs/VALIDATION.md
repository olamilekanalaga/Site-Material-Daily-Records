# P0 validation — 5 November 2026

All checks used fictional records. No hosted deployment or company authorisation is claimed.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Domain/reporting tests | 7 passed |
| PostgreSQL migration/RLS/RPC tests | 10 passed |
| Offline retry/recovery unit tests | 4 passed |
| HTTP API integration tests | 15 passed |
| Browser workflows, mobile/tablet/desktop | 6 passed |
| Optimised Next.js release build | Passed, no warnings |
| Production dependency audit | 0 known vulnerabilities reported |
| Production-mode local browser smoke | Login and mobile capture rendering passed; no browser errors; 390px viewport, 390px document |
| Deployment trace inspection | 16 trace files checked; no local database, environment-file or test-artifact paths |
| Git whitespace check | Passed |

There are **42 passing automated tests**. Run `npm test` for the 21 domain/PostgreSQL/offline tests and `npm run test:e2e` for the 21 API/browser tests. [Detailed browser/API results](../tests/e2e/RESULTS.md) describe coverage and limitations.

The PostgreSQL suite executes the production migration in PGlite with Supabase identity and storage metadata scaffolding. Local HTTP/browser tests use the persistent SQLite adapter. These checks do not substitute for exercising a hosted Supabase Auth/Storage project, real camera hardware, or an authorised operational pilot.

The release is a functional local P0 implementation. Before collecting approved live records, configure a dedicated Supabase environment, provision individual users, apply the migration and perform the hosted workflow smoke test in [DEPLOYMENT.md](DEPLOYMENT.md).

Offline capture requires an already-open authenticated app. There is no background or full cold-start offline synchronisation. Uploaded images are limited to 3 MiB and retained as uploaded. Auth user provisioning is an operator step; company administrators then assign roles and sites. V1 supports one company membership per user. Commercial tables are foundations only: purchase-order, invoice and reconciliation workflows remain P1.
