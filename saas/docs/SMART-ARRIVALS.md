# Smart arrivals — browser demo

This upgrade extends the existing DJ Civils delivery log. It keeps the branding, marshal portraits, sign-in entrances, records table, date filters, evidence viewer and existing backend infrastructure. The new searchable catalogue and classification workflow run in the public browser demo; no cloud database, paid AI service or new authentication integration is needed.

The proposed company pilot remains unofficial. Included deliveries and suppliers are sample data. Catalogue options are starting choices, not evidence that a particular item is used at any site. Use fictional information while demonstrating the application.

## Record an arrival

1. Open `/demo`, then choose **Bemigho Estano** or **Olamilekan Alaga**. Their existing records page opens.
2. Choose **Record New Delivery**. Search for the item or use a Quick Record shortcut: **6F5**, **Type 1**, **Sand**, **10mm shingles**, **20mm shingles** or **Concrete**.
3. Selecting a known item fills its category and entry type automatically. A shortcut only selects the item; it never saves an arrival.
4. Add the company/supplier if known. Take or upload an image of the delivery evidence, such as a retained ticket where permitted. A truck photograph is not specifically required.
5. Press **Save Delivery**. The app associates the selected marshal, records the timestamp and confirms the browser save. The known item remains selected for repeated arrivals; supplier and evidence are cleared for the next arrival.
6. Choose **View Records** or **Back to Records** to inspect the saved row.

The form has no tonnage, volume, litres, prices, stock calculations, purchase orders or vehicle-registration requirement. The smart demo does not require manual time entry. The existing photo requirement remains: JPEG, PNG or WebP, at most **3 MiB**. Failed validation, upload or persistence keeps the prepared attempt available for retry with the same record and photo identifiers.

## Central catalogue

`src/lib/catalogue.ts` holds the initial options, categories, entry types, aliases and deterministic search helpers. Shared catalogue items have a stable ID, display name, normalised name, category, entry type, approval status and optional synonyms. Compatible optional metadata extends the existing material shape rather than replacing historical records.

| Category                    | Initial options                                                                                                                          | Default entry type |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Aggregates                  | 6F5; Type 1; Type 2; MOT Type 1; Sand; Building sand; Sharp sand; 10mm shingles; 20mm shingles; Gravel; Crushed stone; Hardcore; Ballast | Delivery           |
| Concrete and cement         | Ready-mix concrete; Concrete; Concrete blocks; Precast concrete; Cement; Mortar                                                          | Delivery           |
| Timber                      | Timber; Plywood; Wooden boards; Timber beams; Wooden pallets; Formwork timber                                                            | Delivery           |
| Fuel and related supplies   | Diesel; Petrol; HVO fuel; AdBlue; Fuel delivery                                                                                          | Delivery           |
| Plant and equipment         | Excavator; Dumper; Roller; Telehandler; Generator; Compressor; Machinery delivery; Tools; Site equipment                                 | Delivery           |
| Site facilities             | Portable toilet; Welfare cabin; Water tank; Storage container; Site cabin; Temporary fencing                                             | Delivery           |
| Site services               | Road sweeper; Toilet servicing; Toilet cleaning; Plant maintenance; Equipment servicing; Site cleaning                                   | Service visit      |
| Waste containers            | Waste skip; Waste bin; Wheelie bin; Empty skip delivery                                                                                  | Delivery           |
| Drainage and utilities      | Drainage pipes; Manhole; Ducting; Drainage channels; Pipe fittings; Water pipes                                                          | Delivery           |
| Other construction supplies | Bricks; Reinforcement steel; Rebar; Steel mesh; Barriers; Fencing; PPE; General building supplies                                        | Delivery           |

This workflow records **arrivals**. Waste-container delivery options do not introduce outgoing waste collection or muckaway departure tracking.

### Search and matching

Search ignores capitalisation and normalises spacing and punctuation. Item names and explicit aliases provide matches; frequently used items are prioritised, and deterministic spelling suggestions help with minor typos. Examples include `type1` → **Type 1**, `wood` → **Timber**, `sweeper` → **Road sweeper**, and `10 mm` → **10mm shingles**.

Search suggestions require an explicit selection. An unfamiliar manually entered name is not assigned a category by fuzzy matching or an external model. Exact normalised names and registered aliases can reuse an existing item; spelling similarity alone cannot approve an unknown item.

Existing material IDs and names remain available. Ambiguous legacy names such as **G1** or **6I** are preserved and await classification rather than being silently reinterpreted as 6F5. Adding catalogue options does not create individual deliveries from historical tally summaries.

## Unknown items and supervisor approval

Choose **Other — Enter new item** and enter the item's name when no existing option fits. The app preserves that exact entered text on the arrival, sets the category to **Pending classification** and the entry type to **Pending review**, and saves without requiring classification first. Other normal save requirements, including evidence, still apply.

The new name must contain at least one letter or number and be at most 160 characters. Whitespace-only or punctuation-only names are rejected with an editable validation error; valid unknown names do not need a guessed classification before saving.

Normalisation is used to reuse an existing catalogue entry and prevent separate pending items caused by case or spacing differences. Individual arrivals still keep their own original text and record IDs. Repeated arrivals for an unknown item therefore count separately while sharing one pending catalogue item.

To approve an item:

1. Open `/demo/supervisor` in the same browser profile.
2. Set the date range to include the affected arrivals. Expand **Pending classification** if necessary; each item shows its occurrence count in the selected period.
3. Select an allowed category and either **Delivery** or **Service visit**.
4. Choose **Approve item**. The demo engine checks the supervisor, site-manager or company-administrator role, validates both choices and records an audit event.
5. Return to a marshal's form. The approved item becomes a normal searchable option and remains available after a refresh.

Related rows and summaries use the item's current approved classification. Approval does not rewrite the original entered item text, creation timestamp, photos or delivery-review history. It does not create a new arrival and does not confirm physical receipt.

The separate demo entrances simulate roles for demonstration. They are not a production security boundary: anyone able to open the public supervisor demo in that browser can explore approval. Real restricted accounts continue to use the existing private sign-in and stored permissions, separately from this browser-only feature.

## Timestamps and counting

For new smart-demo records, the demo engine generates an ISO 8601 timestamp when the Save workflow first creates the record. The UI labels this **Recorded at** and displays it in **Europe/London**, including daylight-saving changes. Opening the form does not set this timestamp. The timestamp is a recording event; it is not an independent observation of when the vehicle physically arrived.

The original `created_at` is retained, and retries reuse the already-created record and timestamp. Legacy arrivals keep their original `arrival_at` and creation history, and continue to display their existing arrival time. The upgrade does not invent missing timestamps or add a new historical-editing workflow.

CSV exports follow the same distinction: a legacy row's **Recorded at ISO** is empty when no recording timestamp exists, while its original creation timestamp remains separate. A historical arrival time is never relabelled as a confirmed recording timestamp.

One saved arrival contributes one count. Two confirmed saves for separate 6F5 arrivals contribute two; retrying the same save contributes one. A pending item contributes to total arrivals immediately. Approving its classification moves it into the appropriate delivery or service breakdown without increasing total arrivals. Delivery counts are not material quantities.

## Records and supervisor reporting

The existing table now includes **Date**, **Time**, **Item**, **Category**, **Entry type**, **Company/supplier**, **Recorded by** and **Photo/ticket evidence**. Newest records appear first, with existing historical records still visible. Open evidence using the existing photo viewer; absence of legacy evidence remains visible rather than being fabricated.

Filters support inclusive custom date ranges, item, category, entry type, marshal and pending classification. Dates use the site timezone. Horizontal summary cards follow the selected dates; item selection narrows the table while period totals remain comparable. The supervisor can inspect:

- Total recorded arrivals, material deliveries, service visits and pending classifications separately.
- Counts by item and category, including frequently delivered items.
- Service visits by type, arrival/recording time and records by marshal.
- Pending items with occurrence counts and approval controls.

All valid arrivals, including pending ones, contribute to the overall total. Material-delivery totals exclude service visits. Existing reporting routes remain intact; the records view's CSV export uses the filtered rows. No cost, stock or payment analysis is introduced.

A photograph supports the record but does not independently prove physical delivery, accepted quantity or freedom from fraud. Catalogue approval is unrelated to physical acceptance. Existing historical physical-review decisions stay separate.

## Persistence and compatibility

The demo keeps the existing IndexedDB database **`djcu-fictional-browser-demo`**, object store **`demo`**, state key **`state`**. Its state contains records, evidence files, catalogue metadata and audit events. Catalogue migration adds options and compatible metadata without resetting stored deliveries, IDs, photos or review history. The 30 existing sample arrivals remain mixed across the two marshals: 20 Bemigho and 10 Olamilekan, alongside any separately saved browser records.

Prepared demo attempts use **`djcu-simple-demo-drafts`**; authenticated team attempts use the separate **`djcu-simple-team-drafts`** database. The browser transport serialises state changes and uses a browser lock where supported. Stable submission and evidence IDs prevent repeated save clicks or retrying an interrupted upload from creating duplicate arrivals.

The `/demo` transport is a browser-only API simulation. It does not call production company APIs or create a real authenticated session. Catalogue review is implemented in that same demo engine, not a newly activated production endpoint. Existing authenticated capture, Supabase migrations, RLS, private storage, local development adapter and legacy reporting remain compatible and separate. No new production migration is needed for this browser-demo upgrade.

### Limitations

- Records and catalogue approvals are stored only in the same browser profile and origin. Another device or browser cannot see them, and the demo is not a shared backend.
- Clearing site data, browser storage eviction or changing the deployment origin can make local records unavailable. There is no server backup; export needed records before clearing storage.
- A browser quota or storage-permission error can prevent saving photos or records. The app reports failure rather than claiming a completed save.
- Unsaved typing before the first save attempt is not guaranteed to survive refresh. Prepared attempts can be retried; a full offline cold start and background uploads after closing the browser are not promised.
- JPEG, PNG and WebP are supported up to 3 MiB. HEIC conversion and automatic image compression are not implemented.
- Browser-local role simulation and storage are suitable for sample data, not confidential company documents or real access control.
- Automatic catalogue classification, save-time recording and review in this upgrade are demo features. A shared production rollout requires an approved backend design and end-to-end Auth/Storage testing; the existing private portal is not activated by this work.

## Verification

From `saas/`:

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npx playwright test tests/e2e/ui.spec.ts
npx playwright test tests/e2e/simple-api.spec.ts tests/e2e/portal-api.spec.ts --project=api
```

Use `npm run build -- --webpack` if the environment blocks Turbopack's worker port. `test:demo` starts the credential-free browser demo; the explicit UI and API subsets use the separate authenticated local adapter. The older `api.spec.ts` expects image-free legacy submissions that the existing simple logger no longer accepts and is not the current regression target. A full `npm run test:e2e` pass is not claimed. Chromium must be available for browser tests. No paid API or Supabase credentials are needed for the public demo suite.

The smart-arrivals tests should verify known-item classification, aliases and typo suggestions, unknown-item deduplication, exact entered text, approval and persistence, actual save-time timestamps, separate repeated arrivals, duplicate retries, profile navigation, reconciled totals, historical records and narrow-screen layouts. Existing authenticated and SQL suites remain necessary compatibility checks. Passing browser-demo tests do not substitute for a real hosted Supabase Auth/Storage smoke test.

Run these checks against the current checkout before deployment. Deployment access, a production release and a verified updated URL are separate outcomes and are not implied by this guide. See the [SaaS guide](../README.md), [deployment instructions](DEPLOYMENT.md) and [recorded validation](VALIDATION.md) for the surrounding setup.

## Upgrade file inventory

Paths below are relative to the repository root. Existing unrelated application roots and applied database migrations are unchanged.

| Area                      | Modified or added files                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                        | `saas/src/components/delivery-log/simple-app.tsx`; `simple-form.tsx`; `simple-records.tsx`; new `item-selector.tsx`, `classification-review.tsx`, `smart-entry.module.css` and `smart-records.module.css` in the same folder |
| Catalogue and demo engine | New `saas/src/lib/catalogue.ts`; `saas/src/lib/types.ts`; `saas/src/lib/demo/engine.ts`; `saas/src/lib/client/simple-drafts.ts`                                                                                              |
| Tests                     | `saas/tests/all.ts`; `saas/tests/unit/demo.test.ts`; new `saas/tests/unit/catalogue.test.ts`, `smart-arrivals.test.ts` and `smart-drafts.test.ts`; `saas/tests/e2e/demo.spec.ts`; new `saas/tests/e2e/smart-demo.spec.ts`    |
| Documentation             | `README.md`; `docs/REPOSITORY-STRUCTURE.md`; `saas/README.md`; new `saas/docs/SMART-ARRIVALS.md`; appended upgrade results in `saas/docs/VALIDATION.md`                                                                      |
