# Security boundaries

This implementation separates a fictional local demonstration adapter from the production Supabase adapter. Use the local adapter only for development and tests. DJ Civils has not authorised a live pilot or use of its private records.

## Identity and company access

Production sign-in uses Supabase Authentication. The server validates the employee's access token, refreshes an expired session when a valid refresh token is available, and sends database/storage calls with that user's identity. Tokens are held in HttpOnly cookies; they are not exposed through the browser application state. Production cookies require HTTPS and use `SameSite=Strict`.

The local adapter uses opaque random session tokens, server-side expiry, hashed session identifiers and salted password hashes. These controls support testing, but the local known-password accounts and SQLite application-level permissions are not a replacement for production RLS.

PostgreSQL Row Level Security scopes production reads to company membership and authorised site assignments. Composite foreign keys prevent linking a delivery, material, supplier or evidence row to another company's objects. Normal authenticated clients have no direct write permission to workflow tables. Checked transactional functions determine company identity from the session rather than accepting a tenant ID supplied by the client.

V1 permits one company membership per employee. Company administrators configure only their company; other roles need site assignments. Platform administrators have no automatic right to inspect company records or documents. Director/reporting roles cannot approve receipts or rewrite original evidence.

There is no open registration or email-based role escalation. Initial company ownership and Supabase Auth users are created by an authorised operator. Subsequent administrator actions are checked and audited. Keep the service-role key in an operator-only environment: it is not a runtime application credential.

## Receipt decisions and originals

Gate capture and supervisor receipt verification are different permissions. The supervisor must be assigned to the site and must not be the record creator. Version checks reject stale corrections and reviews. Only eligible statuses permit transitions; accepted/rejected records are not freely editable.

Ticket quantities and accepted quantities have different fields. No automatic unit conversion is performed. Site acceptance rules can require a ticket reference and ticket photograph in addition to supplier, vehicle and quantity. Missing evidence does not become proof of delivery just because the record exists.

Creation, correction, review, administrative changes, evidence events and CSV exports generate audit records. Corrections preserve previous values in audit history. Original image objects and review history cannot be overwritten through ordinary employee permissions. Audit history is protected from normal employee mutation; it is not cryptographically tamper-proof against the database owner or a compromised infrastructure administrator.

## Private photographs

Supabase uses the private `delivery-evidence` bucket. Objects are scoped by company/site/delivery/evidence ID. Storage policies check the authenticated user's company/site access and editable delivery ownership for uploads. There are no public evidence URLs. Application downloads pass through an authorised API endpoint; browser/API responses are not publicly cached.

Uploads have a bounded request size and allow JPEG, PNG and WebP only, with file signature checks. The app stores image bytes and a digest to detect conflicting retries. These checks are not malware scanning or a complete image decoder. Do not treat file extensions or MIME headers as trusted document contents. Retain managed browser/device controls and consider image re-encoding and malware scanning before a wider external rollout.

## Browser and offline storage

Authenticated API responses and evidence are excluded from service-worker caching. IndexedDB stores only explicitly saved local drafts and their photos, namespaced to the employee/company. Namespace separation is application behaviour, not encryption against someone controlling that browser profile. Signing out does not silently delete unsynchronised work. The user can discard local drafts; a managed shared-device retention policy is required before handling real company documents.

An offline or pending record is never supervisor-approved locally. Acceptance requires a confirmed server response. Stable record IDs prevent a retry from counting a second vehicle arrival; photo IDs and content digests prevent silent replacement during upload recovery.

## HTTP and export controls

- Mutation endpoints check request origin/fetch-site information and use same-origin cookies.
- Server validation rejects invalid identifiers, quantities, units, transitions and oversized requests.
- Image downloads return private/no-store responses and `nosniff` headers.
- CSV cells are quoted and potentially executable spreadsheet prefixes are escaped.
- Local sign-in attempts are limited; production Auth rate limiting belongs to the configured Supabase project.
- Same-origin deployment is expected. Set the canonical application origin when deploying behind a proxy; do not disable origin checks to resolve a deployment mismatch.

## Before an authorised live pilot

Apply the migration to a dedicated Supabase project, configure HTTPS/origin and Auth settings, provision individual users with appropriate site assignments, and run a real Auth → upload → review → report smoke test. Verify the private bucket and RLS with a second company. Configure provider backups, a restore procedure, retention/deletion policy and secure operator access. Obtain company permission before collecting its records.

Automated local API/browser tests and PostgreSQL policy tests cover meaningful enforcement paths. They cannot establish the security of unconfigured hosted credentials, provider settings, backup access, personal devices or an unauthorised company deployment.
