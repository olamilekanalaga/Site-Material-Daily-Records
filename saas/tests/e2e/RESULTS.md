# Browser and API verification

Executed 5 November 2026 against the local Next.js application and persistent SQLite adapter using fictional records only.

Command: `npm run test:e2e`

Result: **21 passed, 0 failed, 0 skipped** in 1.3 minutes.

## API integration: 15 passed

- Authentication, wrong-password denial, logout/session revocation and unauthenticated denial.
- Manual capture persistence and idempotent submission with stable delivery IDs.
- Private photo uploads, file signature validation, upload retries and interrupted-draft recovery.
- Duplicate supplier/ticket warnings without discarding distinct arrivals.
- Supervisor acceptance with independent accepted quantity; immutable ticket quantity; site manager visibility and audit history.
- Rejection and flag reasons, optimistic version conflicts and invalid transition denial.
- Correction history and resubmission without creating a duplicate arrival.
- Tenant, site and material isolation, including known IDs from a second fictional company and an unassigned site.
- Private document denial across companies and unassigned sites.
- Directors cannot bypass capture or verification controls.
- A recorder promoted to supervisor still cannot accept their own earlier record.
- Quantities retain units, negative values are rejected and authorised CSV reports include separate ticket/accepted values.
- Incomplete arrivals can be submitted while configured acceptance requirements remain enforced.
- Cross-origin mutation denial.
- Client-supplied tenant, creator, accepted status and server timestamp fields cannot override server-owned values.

## Browser workflows: 6 passed

Two complete workflows passed at each viewport: iPhone 13 (390 CSS pixels), iPad Mini (768 CSS pixels), and desktop (1440 CSS pixels), using Chromium.

1. Gate login → material/manual entry → ticket photograph upload → submit → independent supervisor login → physical receipt checkbox and accepted quantity → server decision → independent manager login → daily report and export control.
2. Gate entry → browser offline → save locally → resume local draft → queue while offline → reconnect → automatic retry → exactly one submitted record in register.

Page width assertions passed for overview, capture form, filtered register and manager report. Overview and report screenshots were generated under the ignored `test-results/` directory; they are local verification artifacts, not public evidence or production records. The mobile overview screenshot was visually inspected and contained no horizontal page overflow.

## Boundaries

These are browser-emulation tests, not tests on physical phones/tablets or a hosted Supabase project. Camera capture is exercised through the actual file input with a synthetic PNG. Offline coverage starts from an authenticated loaded application and verifies draft storage/queue recovery; it does not claim a full offline authenticated reload. Hosted authentication, Storage and deployment still require the configured Supabase environment and operator smoke test documented in the setup instructions.
