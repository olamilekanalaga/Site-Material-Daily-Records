# Smart arrivals — browser demo

This upgrade extends the existing DJ Civils delivery log. It keeps the branding, marshal portraits, sign-in entrances, records table, date filters, evidence viewer and existing backend infrastructure. The new searchable catalogue and classification workflow run in the public browser demo; no cloud database, paid AI service or new authentication integration is needed.

The proposed company pilot remains unofficial. Included deliveries and suppliers are sample data. Catalogue options are starting choices, not evidence that a particular item is used at any site. Use fictional information while demonstrating the application.

## Record an arrival

The homepage lists four aligned options: **Traffic Marshal sign-in**, **Supervisor / Site Manager sign-in**, **Traffic Marshal demo** and **Supervisor demo**. The two staff sign-in options are disabled; only the demos are clickable. Promotional text and credential fields are omitted from this chooser. Existing private sign-in infrastructure remains separate for configured local development or an approved future team workspace.

1. Choose **Traffic Marshal demo** to open `/demo`, then choose **Bemigho Estano** or **Olamilekan Alaga**. Their delivery-entry form opens directly.
2. Select **Category** first: **Aggregates / Sands**, **Other Materials** or **Services**. These are the only normal capture categories. The item dropdown is enabled for that category and shows only its available items. Optional **Search items** inside the dropdown helps find a name or alias within that category.
3. The item dropdown shows names only. Selecting a known item derives its classification internally. Changing category clears the previous item selection so an item from another category cannot remain selected.
4. Add the company/supplier if known. Take or upload an image of the delivery evidence, such as a retained ticket where permitted. A truck photograph is not specifically required.
5. Press **Save Delivery**. The app associates the selected marshal, records the timestamp and confirms the browser save. The known item remains selected for repeated arrivals; supplier and evidence are cleared for the next arrival.
6. Choose **View Records** or **Back to Records** to open **Daily Records** and inspect the saved row. **Record New Delivery** returns to the entry form.

The form has no tonnage, volume, litres, prices, stock calculations, purchase orders or vehicle-registration requirement. The smart demo does not require manual time entry. The existing photo requirement remains: JPEG, PNG or WebP, at most **3 MiB**. Failed validation, upload or persistence keeps the prepared attempt available for retry with the same record and photo identifiers.

## Central catalogue

`src/lib/catalogue.ts` holds the options, three categories, entry types, aliases and deterministic search helpers. Shared catalogue items have a stable ID, display name, normalised name, category, entry type, approval status, optional synonyms and capture-visibility metadata. Compatible optional metadata extends the existing material shape rather than replacing historical records.

| Category           | Initial capture options                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregates / Sands | 6F5; Type 1; Type 2; MOT Type 1; Sand; Building sand; Sharp sand; 10mm shingles; 20mm shingles; Gravel; Crushed stone; Hardcore; Ballast; Ready-mix concrete; Concrete; Concrete blocks; Precast concrete; Cement; Mortar |
| Other Materials    | Pipes; Cables                                                                                                                                                                                                             |
| Services           | Fuel; Toilets; Welfare                                                                                                                                                                                                    |

Every item list also includes **Other — Enter new item**. This keeps the initial lists compact while allowing marshals to record an unlisted arrival without waiting for an administrator.

All 69 earlier catalogue definitions remain stored. **Pipes**, **Cables**, **Fuel**, **Toilets** and **Welfare** bring the built-in catalogue to 74 names; saved custom items are additional. Earlier default options outside the initial lists are hidden from capture menus only, not deleted from records or reporting. Explicit manual use of an exact known name reuses its existing ID and makes it selectable again. Previously approved custom options remain available.

Existing approved categories are mapped into the three current groups without rewriting historical delivery snapshots. Earlier aggregate and concrete/cement groups become **Aggregates / Sands**; fuel, toilet, welfare and site-service options use **Services**; remaining construction supplies use **Other Materials**. Legacy pending items with no chosen category remain **Pending classification** rather than being automatically approved.

Category and entry type stay separate. Fuel, toilet and welfare deliveries retain **Delivery**; known road-sweeper and cleaning visits retain **Service visit**. The **Services** category does not itself mark an arrival as a service visit. This workflow records **arrivals** and does not introduce outgoing waste collection or muckaway departure tracking.

### Search and matching

Search works within the selected category's available capture options, ignores capitalisation and normalises spacing and punctuation. Item names and explicit aliases provide matches; frequently used items are prioritised, and deterministic spelling suggestions help with minor typos. Examples include `type1` → **Type 1** and `10 mm` → **10mm shingles** in **Aggregates / Sands**. Earlier aliases, such as `wood` → **Timber** and `sweeper` → **Road sweeper**, remain recognised when a marshal enters those names manually; exact use reactivates the corresponding item in its current category.

Search suggestions require an explicit selection. An unfamiliar manually entered name is not assigned a category by fuzzy matching or an external model. Exact normalised names and registered aliases can reuse an existing item; spelling similarity alone cannot approve an unknown item.

Existing material IDs and names remain available in saved records. Ambiguous legacy names such as **G1** or **6I** are preserved and await classification rather than being silently reinterpreted as 6F5. Adding catalogue options does not create individual deliveries from historical tally summaries.

## Unknown items and supervisor approval

Choose one of the three categories, then **Other — Enter new item** from its item list and enter the item's name when no option fits. There is no fourth **Other / Not listed** category. A new unknown item preserves the exact entered text and explicitly chosen category, while its catalogue approval remains **Pending** and its entry type is **Pending review**. It can be saved immediately and contributes to the day's arrival total. No entry type is guessed from the selected category. Other normal save requirements, including evidence, still apply.

The new name must contain at least one letter or number and be at most 160 characters. Whitespace-only or punctuation-only names are rejected with an editable validation error; valid unknown names do not need supervisor approval before saving. Legacy pending items without an explicitly selected category retain their earlier **Pending classification** state.

Normalisation is used to reuse an existing catalogue entry and prevent separate pending items caused by case or spacing differences. Exact matches and aliases reuse the existing item's classification; a hidden known item becomes available in capture again after explicit manual use. Individual arrivals still keep their own original text and record IDs. Repeated arrivals for an unknown item therefore count separately while sharing one pending catalogue item.

Each new arrival also retains its explicit `selected_category` for pending classification and immutable retry checks. Reusing a pending name under another category does not rewrite earlier arrivals. Once a supervisor approves the catalogue item, reports use its current approved classification while original arrival snapshots remain intact.

To approve an item:

1. Open `/demo/supervisor` in the same browser profile.
2. Set the date range to include the affected arrivals. Expand **Pending classification** if necessary; each item shows its occurrence count in the selected period.
3. Confirm or choose one of the three categories and either **Delivery** or **Service visit**.
4. Choose **Approve item**. The demo engine checks the supervisor, site-manager or company-administrator role, validates both choices and records an audit event.
5. Return to a marshal's form and select the approved category. The approved item becomes a normal searchable option within it and remains available after a refresh.

Related rows and summaries use the item's current approved classification. Approval does not rewrite the original entered item text, creation timestamp, photos or delivery-review history. It does not create a new arrival and does not confirm physical receipt.

The separate demo entrances simulate roles for demonstration. They are not a production security boundary: anyone able to open the public supervisor demo in that browser can explore approval. Real restricted accounts continue to use the existing private sign-in and stored permissions, separately from this browser-only feature.

## Timestamps and counting

For new smart-demo records, the demo engine generates an ISO 8601 timestamp when the Save workflow first creates the record. The UI labels this **Recorded at** and displays it in **Europe/London**, including daylight-saving changes. Opening the form does not set this timestamp. The timestamp is a recording event; it is not an independent observation of when the vehicle physically arrived.

The original `created_at` is retained, and retries reuse the already-created record and timestamp. Legacy arrivals keep their original `arrival_at` and creation history for filtering and exports; dates and times remain hidden from the records table. The upgrade does not invent missing timestamps or add a new historical-editing workflow.

CSV exports follow the same distinction: a legacy row's **Recorded at ISO** is empty when no recording timestamp exists, while its original creation timestamp remains separate. A historical arrival time is never relabelled as a confirmed recording timestamp.

One saved arrival contributes one count. Two confirmed saves for separate 6F5 arrivals contribute two; retrying the same save contributes one. A pending item contributes to total arrivals immediately. Approving its classification moves it into the appropriate delivery or service breakdown without increasing total arrivals. Delivery counts are not material quantities.

## Records and supervisor reporting

The five-column **Daily Records** table includes **Traffic marshal** (a 40px circular profile picture), **Item**, **Category**, **Logistics company** and **Photo**. The two sample marshals use their supplied portraits without visible name text, with names available to assistive technology and on hover; other staff use a placeholder. Date and time columns are hidden, while their original values remain stored for newest-first ordering, custom date filters and CSV exports. The default view covers the current Europe/London site day, from site midnight to the following midnight, and automatically advances when the next site day begins. Earlier records remain stored and available through custom date ranges. Open evidence using the existing photo viewer; absence of legacy evidence remains visible rather than being fabricated.

Entry type remains stored and derived for delivery/service totals, filtering and supervisor catalogue approval. It has no field on the delivery form and no column in the records table or arrival CSV. Existing legacy report exports retain their compatible format.

Editing **From date** or **To date** switches to a custom range that stays fixed across midnight while the records view remains open. **Clear filters** returns to the automatic current-day view; reopening the page also starts with today. The table, summary cards and arrival CSV use the same effective dates. Additional filters cover item, category, entry type, marshal and pending classification. Dates use the site timezone. Horizontal summary cards follow the selected dates; item selection narrows the table while period totals remain comparable. The supervisor can inspect:

- Total recorded arrivals, material deliveries, service visits and pending classifications separately.
- Counts by item and category, including frequently delivered items.
- Service visits by type and records by marshal.
- Pending items with occurrence counts and approval controls.

All valid arrivals, including pending ones, contribute to the overall total. Material-delivery totals exclude service visits. Existing reporting routes remain intact; the records view's CSV export uses the filtered rows. No cost, stock or payment analysis is introduced.

A photograph supports the record but does not independently prove physical delivery, accepted quantity or freedom from fraud. Catalogue approval is unrelated to physical acceptance. Existing historical physical-review decisions stay separate.

## Persistence and compatibility

The demo keeps the existing IndexedDB database **`djcu-fictional-browser-demo`**, object store **`demo`**, state key **`state`**. Its state contains records, evidence files, catalogue metadata and audit events. Catalogue migration adds options, maps current catalogue categories and records capture visibility without resetting stored deliveries, IDs, photos or review history. Historical event snapshots are not rewritten. The 30 existing sample arrivals remain mixed across the two marshals: 20 Bemigho and 10 Olamilekan, alongside any separately saved browser records.

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

The smart-arrivals tests should verify exactly three capture categories, their initial item lists, preserved historical catalogue IDs, manual reactivation of hidden known items, aliases and typo suggestions, unknown-item deduplication with the chosen category, exact entered text, approval and persistence, actual save-time timestamps, separate repeated arrivals, duplicate retries, profile navigation, reconciled totals, historical records and narrow-screen layouts. Existing authenticated and SQL suites remain necessary compatibility checks. Passing browser-demo tests do not substitute for a real hosted Supabase Auth/Storage smoke test.

Run these checks against the current checkout before deployment. Deployment access, a production release and a verified updated URL are separate outcomes and are not implied by this guide. See the [SaaS guide](../README.md), [deployment instructions](DEPLOYMENT.md) and [recorded validation](VALIDATION.md) for the surrounding setup.

## Upgrade file inventory

Paths below are relative to the repository root. Existing unrelated application roots and applied database migrations are unchanged.

| Area                      | Modified or added files                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                        | `saas/src/components/delivery-log/simple-app.tsx`; `simple-form.tsx`; `simple-records.tsx`; new `item-selector.tsx`, `classification-review.tsx`, `smart-entry.module.css` and `smart-records.module.css` in the same folder |
| Catalogue and demo engine | New `saas/src/lib/catalogue.ts`; `saas/src/lib/types.ts`; `saas/src/lib/demo/engine.ts`; `saas/src/lib/client/simple-drafts.ts`                                                                                              |
| Tests                     | `saas/tests/all.ts`; `saas/tests/unit/demo.test.ts`; new `saas/tests/unit/catalogue.test.ts`, `smart-arrivals.test.ts` and `smart-drafts.test.ts`; `saas/tests/e2e/demo.spec.ts`; new `saas/tests/e2e/smart-demo.spec.ts`    |
| Documentation             | `README.md`; `docs/REPOSITORY-STRUCTURE.md`; `saas/README.md`; new `saas/docs/SMART-ARRIVALS.md`; appended upgrade results in `saas/docs/VALIDATION.md`                                                                      |
