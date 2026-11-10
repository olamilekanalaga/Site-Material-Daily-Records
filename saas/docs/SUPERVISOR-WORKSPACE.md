# Gate supervisor workspace

The public `/demo/supervisor` route uses the existing browser demo records. It has a dark Records / Workload / Review interface, while the traffic marshal form and own-records pages retain their existing design. Supabase, production authentication and the archived dashboard are unchanged.

The referenced supervisor screenshot was not attached to the implementation request. The interface follows the supplied written requirements; an exact screenshot comparison has not been performed.

## Shared records and filters

The workspace reads the existing IndexedDB database, `djcu-fictional-browser-demo`, through the existing demo bootstrap. There is no new store, record migration, seed reset or duplicate dataset. Open or refresh the supervisor page in the same browser profile **and website origin** after a marshal saves an arrival. Data does not synchronise across devices or different preview domains.

All tabs and cards use the same selected site, inclusive date range and active filters. The default is the current Europe/London site day and advances at midnight; a custom range remains fixed while the page is open. Clear filters returns to today. Existing date selection follows the arrival date, including for older records. The marshal dropdown lists marshals represented in the selected period.

- **Arrivals:** unique submitted delivery-record IDs matching the filters. Drafts, retries and other sites/companies are excluded.
- **Marshals:** distinct recorded marshal IDs among those arrivals, with the original creator ID as the legacy fallback. This is not a count of all configured staff.
- **To Classify:** distinct pending catalogue-item IDs with at least one matching arrival. Repeated arrivals for one unknown item count once here; the Review tab shows their occurrence count. Historical records with missing catalogue references remain visible and are identified separately rather than inventing an approvable item.

These are recorded arrivals and staff activity counts, not material quantities, physical receipt confirmations or measures of employee productivity.

## Records

The compact table shows Item, Marshal and Time. Open an item for the original record details, company/supplier, category, timestamps, identifiers and evidence. Existing photographs remain in the original browser store and use the existing evidence viewer. The displayed time uses `recorded_at` for newer captures; an older record without that value displays its retained arrival time with a legacy label. The app never invents an original recording timestamp.

Date controls, additional item/category/type/classification filters, arrival breakdowns and filtered CSV export remain available without adding extra permanent table columns. CSV export uses the existing reporting transport and includes the original record identifiers and timestamp fields.

## Workload

Each marshal's section shows recorded arrivals, materials, recorded times and activity by arrival day within the selected period. It uses exactly the same records as the Records tab. There are no productivity scores, performance rankings, shifts or job assignments.

## Review

The Review tab reuses the supervisor demo's catalogue approval operation. For each pending item it shows the original entered names and matching-arrival count. Select one of the three catalogue categories and either Delivery or Service visit, then approve explicitly.

Approval updates catalogue metadata and adds the existing audit event. It does not create arrivals or rewrite the original entry text, photographs, arrival/recording timestamps or historical physical-review decisions. The approved item becomes selectable on the marshal form after its next load. If filters exclude the newly approved classification, its records leave the filtered view but remain stored.

The public supervisor demo simulates a role; it is not a private staff login or a production security boundary. Use sample data only. The separate marshal/supervisor demo entrances and existing private infrastructure are preserved.

## Verification

Run from `saas/`:

```bash
npm run typecheck
npm test
npm run test:demo
npm run build
```

Browser checks use synthetic evidence and Chromium phone/tablet/desktop emulation. Physical camera behaviour and exact comparison to the missing screenshot require a separate check. Executed results and deployment status are recorded in [validation](VALIDATION.md).

## Changed files

Paths are relative to the repository root.

- `docs/REPOSITORY-STRUCTURE.md`
- `saas/README.md`
- `saas/docs/SUPERVISOR-WORKSPACE.md`
- `saas/docs/VALIDATION.md`
- `saas/src/app/demo/supervisor/page.tsx`
- `saas/src/components/delivery-log/classification-review.tsx`
- `saas/src/components/delivery-log/simple-app.tsx`
- `saas/src/components/delivery-log/smart-records.module.css`
- `saas/src/components/delivery-log/supervisor-workspace.module.css`
- `saas/src/components/delivery-log/supervisor-workspace.tsx`
- `saas/src/lib/supervisor-workspace.ts`
- `saas/tests/all.ts`
- `saas/tests/e2e/demo.spec.ts`
- `saas/tests/e2e/smart-demo.spec.ts`
- `saas/tests/e2e/supervisor-demo.spec.ts`
- `saas/tests/unit/supervisor-workspace.test.ts`
