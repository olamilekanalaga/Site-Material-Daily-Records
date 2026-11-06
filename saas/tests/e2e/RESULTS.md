# Browser and API verification — two-page logger

This update was tested locally with fictional data. **32/32 passed**: `npm run test:e2e` passed 26 tests (20 API and six authenticated browser scenarios); `npm run test:demo` passed six credential-free browser scenarios. See [VALIDATION.md](../../docs/VALIDATION.md) for release checks and limitations.

## Authenticated API coverage

The suite retains the 15 legacy API regressions and adds five simple-logging checks:

- Authenticated capture with material, company, marshal and site-local arrival time; automatic server submission timestamps.
- Required private image before final save, stable IDs and repeated submissions without duplicates.
- Marshal attribution remains separate from authenticated creator; client-supplied privileged fields cannot override server-owned values.
- Company/site/creator access checks, including gate denial of another user's records and private images.
- Immutable retries, legacy-endpoint bypass denial and invalid input handling.

Legacy regressions continue covering authentication/logout, tenant isolation, file validation, duplicate-ticket warnings, original versus accepted quantities, supervisor review/corrections, audit history, reports and origin checks. Those older workflow screens are not part of the simplified interface.

## Authenticated browser coverage

Two scenarios run on iPhone 13 (390 px), iPad Mini (768 px) and desktop (1440 px), using Chromium:

1. Gate sign-in → square marshal cards → inline minimal form → camera/upload file → Save Delivery → form reset → persistence after refresh → independent supervisor sign-in → filtered six-column records → private photo inspection. The browser timezone differs from the site's timezone to check site-local time.
2. Failed image upload → preserved attempt → refresh and reselect the marshal → retry → exactly one saved delivery. Missing/invalid images are checked before saving.

## Credential-free demo coverage

Two scenarios run at the same three viewports. They cover named marshal selection, simple capture with a local photo, persistence after refresh, simulated supervisor record/photo viewing and filters. Network assertions confirm that this demo does not use company APIs or a real authenticated session.

Screenshots and traces are local ignored artifacts under `test-results/`. These are emulated-browser checks; real phone cameras, hosted Supabase Auth/Storage and a production deployment need separate verification. No live deployment is claimed.
