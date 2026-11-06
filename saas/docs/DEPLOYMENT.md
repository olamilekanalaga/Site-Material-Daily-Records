# Deployment and Supabase setup

No hosted deployment or live URL is assumed. The checked-in application can run locally without external credentials. Hosted operation requires a configured Supabase project and deployment access. Do not publish the existing real-data static dashboard as part of this unofficial prototype.

## Separate deployment root

Create a separate Vercel project with **Root Directory `saas`** and the Next.js framework preset. Use `npm run build`; let Next.js manage its output directory. Do not reuse the repository root's `vercel.json`, static `public/index.html` or existing dashboard deployment. The legacy application stays independent.

For a GitHub import of the prepared pilot, select the reviewed application branch, set Root Directory to **`saas`**, and use Node.js **24.x**. The `saas/vercel.json` file configures the Next.js build and permits Git deployments for this application. The repository-root configuration disables automatic Git deployments of the legacy static dashboard, including feature-branch previews. It does not remove any existing hosted project or reset Vercel's accumulated usage.

Production requires a persistent remote database/storage adapter. `APP_MODE=local` is intentionally refused on Vercel; ephemeral function filesystems are not suitable for the local SQLite demo.

## Configure Supabase

1. Create a dedicated Supabase project for the fictional demonstration or authorised pilot. Keep its database credentials and service-role key out of Git.
2. On a new database, apply `supabase/migrations/202611050001_delivery_pilot.sql` and then `supabase/migrations/202611060001_simple_delivery_log.sql`, in that order, as the database owner through your usual migration workflow. On an existing pilot database, apply only the second migration. It adds the marshal catalogue and simple-capture fields/RPC without resetting existing deliveries, evidence or historical summaries. It also limits gate accounts to their own records and photographs; assigned supervisors retain site visibility. Do not rerun the initial schema migration on an existing database.
3. Configure Supabase email/password Auth and its rate limits. Disable public sign-ups for the controlled pilot. Set the application site URL and only the redirect URLs you intend to support. This release signs in with email/password and does not need a third-party OAuth provider.
4. Provision a company administrator and site users using the operator setup script described below. Give each employee their own account and minimum site assignments. The public application does not allow a new user to choose their own privileged role.
5. Confirm that the storage bucket is private and ordinary authenticated clients cannot bypass RPC workflow checks with direct table updates. Run the hosted smoke test before using approved live records.

## Environment variables

Set these in the Vercel project's appropriate environment, then deploy a fresh build:

```dotenv
APP_MODE=supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR-PROJECT-ANON-KEY
APP_ORIGIN=https://YOUR-APPLICATION-DOMAIN
```

`APP_ORIGIN` must be the exact application origin, without a path. Preview deployments need their own valid origin or should use the incoming same-origin default with no fixed production origin. Configure `SUPABASE_SERVICE_ROLE_KEY` only in the trusted operator environment running provisioning; the web application does not need or use it. Never use the service key to work around a failing RLS check.

Environment variables must be configured for the actual deployment environment. Copying `.env.example` is only the local development setup. There is no automatic fallback to fictional local data if Supabase is missing or unavailable.

## Initial company and users

Use the repository's operator provisioning script after applying both migrations. Run it from `saas/` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and a unique `DEMO_PASSWORD` of at least 12 characters supplied through a trusted environment. Then run:

```bash
node scripts/setup-supabase-demo.mjs --demo-only
```

The fictional hosted demo uses `gate@demo.invalid`, `supervisor@demo.invalid`, `manager@demo.invalid` and `admin@demo.invalid` with the password you supplied in `DEMO_PASSWORD`, **not** the local default. Review the script first: it creates fictional users and tenant records, not approved DJ Civils records. It refuses to duplicate an existing named demo company. Provisioning is not a cross-service transaction; on an error it retains partial records for inspection instead of deleting them. Inspect and resolve those records before trying again.

Remove the service-role and demo-password variables from the application runtime. Do not commit shell histories, `.env` files or generated passwords. Production company onboarding should be performed by an authorised operator with the real organisation's approval; this script only provisions the explicitly fictional demo.

The simplified interface contains Home and Delivery Records. Site/catalogue and Auth-user provisioning remain operator tasks. The new `traffic_marshals` catalogue is scoped to company and site; the migration seeds existing assigned gate employees by their stored names. The explicit fictional provisioning script instead adds **B Traffic Marshal** and **Olamilekan Alaga**. Operators can add or deactivate authorised marshal catalogue rows through their trusted database administration workflow; ordinary employees cannot change that catalogue. Selecting a marshal records the selected person separately from the authenticated creator identity. Company membership by itself does not send an invitation email.

## Verify before release

First run locally:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Then use a dedicated fictional hosted workspace to verify:

1. Gate sign-in, marshal selection, material/company/time entry and a camera/upload image from a real phone/tablet.
2. Saving completes only after the private image is stored; the form clears and the new row remains after refresh.
3. An assigned supervisor signs in independently, sees the saved record and opens its private image.
4. Signed-out visitors, other companies and unassigned sites cannot read records/images. A gate account cannot read another account's captures or impersonate its authenticated creator.
5. Date and material filters use the site's local date/time and show newest records first.
6. Interrupted upload and repeated draft/final submission recover without another saved delivery.
7. Historical deliveries retain their original fields and evidence. Uploaded images never set physical acceptance or quantity confirmation.

The automated PGlite tests validate SQL policies against mocked Supabase identity/storage metadata; they do not operate a real Supabase Storage service. Local Playwright uses the SQLite adapter. This update has not applied migrations to a hosted Supabase project or verified real hosted Auth/Storage. Run the hosted smoke test in an authorised test workspace before release. Production deployment requires explicit approval.

The image requirement applies to the new simple logging flow. The existing legacy API remains compatible with historical clients and may contain deliveries without images; those records remain visible with a missing-photo indication. Neither capture mode treats an uploaded image as physical verification.

## Operational limits

P0 has no subscription billing, OCR, accounting integration, automatic invoice matching, push/email notification delivery, broad project-management modules or payment authorisation. Commercial tables and statuses prepare for P1 only. Historical summaries are modelled separately; handwritten notebook ingestion and human-review tooling are not an automated import service.

Offline support covers drafts and retryable uploads in an already-open app. It does not provide a full cold-start offline application or background uploads after the browser closes. Use managed devices and a retention policy before collecting approved private evidence.

Before an authorised live pilot, establish provider backup/restore, document retention, incident contacts and individual employee account recovery. Keep the existing real-data dashboard separate. A successful deployment build is not company authorisation to collect its records.
