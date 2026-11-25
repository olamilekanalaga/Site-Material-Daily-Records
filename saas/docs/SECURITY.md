# Security boundaries

This implementation separates the browser-local demonstration and localhost SQLite test adapter from the authenticated Supabase workspace. Demo records never become live company records automatically. Company authorisation to collect private site evidence remains a separate operating decision; a working preview or database connection does not establish that authorisation.

## Identity and company access

Production sign-in uses Supabase Authentication. The server validates the employee's access token, refreshes an expired session when a valid refresh token is available, and sends database/storage calls with that user's identity. Tokens are held in HttpOnly cookies; they are not exposed through the browser application state. Production cookies require HTTPS and use `SameSite=Strict`.

The local adapter uses opaque random session tokens, server-side expiry, hashed session identifiers and salted password hashes. These controls support testing, but the local known-password accounts and SQLite application-level permissions are not a replacement for production RLS.

PostgreSQL Row Level Security scopes production reads to company membership and authorised site assignments. Composite foreign keys prevent linking a delivery, material, supplier or evidence row to another company's objects. Normal authenticated clients have no direct write permission to workflow tables. Checked transactional functions determine company identity from the session rather than accepting a tenant ID supplied by the client.

The simple logger restricts gate users to deliveries they created and their private images. Assigned supervisors retain site-wide read access. Marshal cards are company/site scoped and bound through `traffic_marshals.user_id` to a specific Auth account. The server/RPC validates that binding; the selected name/card cannot substitute for the authenticated identity. Other site cards may be visible but disabled. Company administrators retain explicitly authorised site administration/capture permissions. Gate users receive no audit snapshots, including after a supervisor account is demoted. Notifications follow delivery read permissions.

V1 permits one company membership per employee. Company administrators configure only their company; other roles need site assignments. Platform administrators have no automatic right to inspect company records or documents. Director/reporting roles cannot approve receipts or rewrite original evidence.

There is no open registration or email-based role escalation. Initial company ownership and Supabase Auth users are created by an authorised operator. Subsequent administrator actions are checked and audited. Use `SUPABASE_PUBLISHABLE_KEY` (or a public legacy anon key for compatibility) in the application, with each employee's JWT. The runtime rejects secret/service-role keys and user JWTs supplied as the project API key. Keep `SUPABASE_SERVICE_ROLE_KEY` in an isolated operator environment only; it is not a runtime application credential. The reviewed provisioning script defaults to a read-only plan and requires `--apply` for writes; it does not create Auth accounts, passwords or sample delivery records.

## Receipt decisions and originals

The two-page interface records arrivals and displays saved records. Its save action never accepts or physically verifies a delivery. Existing review functions remain available for compatibility and historical audit, but are not exposed in this interface. Simple captures require a registered private image before submission; legacy APIs cannot alter or finalize a simple capture. Older legacy records may lack images and are labelled accordingly.

Gate capture and supervisor receipt verification are different permissions. The supervisor must be assigned to the site and must not be the record creator. Version checks reject stale corrections and reviews. Only eligible statuses permit transitions; accepted/rejected records are not freely editable.

Ticket quantities and accepted quantities have different fields. No automatic unit conversion is performed. Site acceptance rules can require a ticket reference and ticket photograph in addition to supplier, vehicle and quantity. Missing evidence does not become proof of delivery just because the record exists.

Creation, correction, review, administrative changes, evidence events and CSV exports generate audit records. Corrections preserve previous values in audit history. Original image objects and review history cannot be overwritten through ordinary employee permissions. Audit history is protected from normal employee mutation; it is not cryptographically tamper-proof against the database owner or a compromised infrastructure administrator.

## Catalogue and recording time

Material and supplier creation is mediated by checked transactional RPCs, scoped to the authenticated company and authorised site. Normalised names prevent new case/spacing duplicates without deleting historical catalogue rows. Known mappings derive classification; unfamiliar materials stay pending, with any chosen category retained only as a proposal. Supabase is the source of truth for future dropdown selection.

The database generates `recorded_at` on first save. The browser cannot replace that original recording event with a form-open time or an arbitrary submitted timestamp. An explicit late-time correction has its own time and required reason; it does not overwrite the original server recording timestamp. Retry payloads are immutable and keyed by the same delivery/evidence IDs.

## Private photographs

Supabase uses the private `delivery-evidence` bucket. Objects are scoped by company/site/delivery/evidence ID. Storage policies check the authenticated user's company/site access and editable delivery ownership for uploads. There are no public evidence URLs. Application downloads pass through an authorised API endpoint; browser/API responses are not publicly cached. Staff portraits use the separate private `staff-portraits` bucket and company/site/marshal paths. Only the trusted operator uploads or replaces these portraits; authenticated users read only authorised roster images. Arbitrary external portrait URLs are not accepted as staff identity.

Uploads have a bounded request size and allow JPEG, PNG and WebP only, with file signature checks. The app stores image bytes and a digest to detect conflicting retries. These checks are not malware scanning or a complete image decoder. Do not treat file extensions or MIME headers as trusted document contents. Retain managed browser/device controls and consider image re-encoding and malware scanning before a wider external rollout.

## Browser and offline storage

Authenticated API responses and evidence are excluded from service-worker caching. IndexedDB stores explicitly attempted saves and their photos, namespaced to the employee/company/site/marshal. Namespace separation is application behaviour, not encryption against someone controlling that browser profile. Signing out does not silently delete unsynchronised work. The simplified form restores a pending attempt after the same marshal is selected; it has no discard/reset control. A managed shared-device retention policy is required before handling real company documents.

An offline or pending record is never supervisor-approved locally. Acceptance requires a confirmed server response. Stable record IDs prevent a retry from counting a second vehicle arrival; photo IDs and content digests prevent silent replacement during upload recovery.

## HTTP and export controls

- Mutation endpoints check request origin/fetch-site information and use same-origin cookies.
- Server validation rejects invalid identifiers, quantities, units, transitions and oversized requests.
- Image downloads return private/no-store responses and `nosniff` headers.
- CSV cells are quoted and potentially executable spreadsheet prefixes are escaped.
- Local sign-in attempts are limited; production Auth rate limiting belongs to the configured Supabase project.
- Same-origin deployment is expected. Set the canonical application origin when deploying behind a proxy; do not disable origin checks to resolve a deployment mismatch.

## Before an authorised live pilot

Apply all missing ordered migrations through `202611070001_live_delivery_backend.sql` (all three files in order on a new, empty application database; only missing files on an existing pilot), configure HTTPS/origin and Auth settings, provision individual confirmed users with the correct company/site roles and Auth-bound marshal cards, and run a real login → marshal selection → image upload → save → supervisor record/photo inspection smoke test. Verify the private bucket and RLS with a second company. Configure provider backups, a restore procedure, retention/deletion policy and secure operator access. Obtain company permission before collecting its records.

Automated local API/browser tests and PostgreSQL policy tests cover meaningful enforcement paths. They cannot establish the security of unconfigured hosted credentials, provider settings, backup access, personal devices or an unauthorised company deployment.
