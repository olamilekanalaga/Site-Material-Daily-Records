"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  Download,
  ImageIcon,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import type { Bootstrap, Delivery } from "@/lib/types";
import {
  CATEGORIES,
  ENTRY_TYPES,
  PENDING_CATEGORY,
  PENDING_ENTRY_TYPE,
  itemDetails,
} from "@/lib/catalogue";
import {
  buildSupervisorView,
  type SupervisorFilters,
} from "@/lib/supervisor-workspace";
import type { DateRange } from "@/lib/delivery-records";
import { siteClock } from "@/lib/site-time";
import { downloadReport } from "@/lib/client/offline";
import { ClassificationReview } from "./classification-review";
import { Photo, PhotoDialog } from "./simple-records";
import styles from "./supervisor-workspace.module.css";

const tabs = ["Records", "Workload", "Review"] as const;
type Tab = (typeof tabs)[number];

function displayClock(timestamp: string, timezone: string) {
  return Number.isFinite(Date.parse(timestamp))
    ? siteClock(new Date(timestamp), timezone)
    : { date: "Not recorded", time: "—" };
}

function RecordedTime({
  record,
  timezone,
}: {
  record: Delivery;
  timezone: string;
}) {
  const knownRecording = Boolean(
    record.recorded_at && Number.isFinite(Date.parse(record.recorded_at)),
  );
  const timestamp = knownRecording ? record.recorded_at! : record.arrival_at;
  const clock = displayClock(timestamp, timezone);
  return (
    <time
      dateTime={timestamp}
      title={`${clock.date} · ${timezone} · ${knownRecording ? "Recorded time" : "Original arrival time; recording time unavailable"}`}
    >
      {clock.time}
      {!knownRecording && (
        <span className={styles.legacyTime} aria-label="Original arrival time">
          *
        </span>
      )}
    </time>
  );
}

function ArrivalDetails({
  record,
  data,
  timezone,
  onClose,
}: {
  record: Delivery;
  data: Bootstrap;
  timezone: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const item = itemDetails(record, data.materials);
  const recorded =
    record.recorded_at && Number.isFinite(Date.parse(record.recorded_at))
      ? displayClock(record.recorded_at, timezone)
      : null;
  const arrival = displayClock(record.arrival_at, timezone);
  const events = data.audit.filter(
    (event) =>
      event.entity_id === record.id || event.entity_id === record.material_id,
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.detailDialog}
      aria-labelledby={heading}
      onCancel={onClose}
    >
      <div className={styles.dialogHeading}>
        <div>
          <p className={styles.eyebrow}>Arrival record</p>
          <h2 id={heading}>Arrival details</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={styles.iconButton}
          aria-label="Close details"
        >
          <X size={20} />
        </button>
      </div>
      <h3 className={styles.recordName}>{item.name}</h3>
      <dl className={styles.recordFacts}>
        <div>
          <dt>Original item</dt>
          <dd>{record.item_name ?? item.name}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{item.category}</dd>
        </div>
        <div>
          <dt>Entry type</dt>
          <dd>{item.entry_type}</dd>
        </div>
        <div>
          <dt>Logistics company</dt>
          <dd>
            {record.supplier_name ||
              data.suppliers.find(
                (supplier) => supplier.id === record.supplier_id,
              )?.name ||
              "Not recorded"}
          </dd>
        </div>
        <div>
          <dt>Traffic marshal</dt>
          <dd>{record.marshal_name || record.creator_name}</dd>
        </div>
        <div>
          <dt>Recorded at</dt>
          <dd>
            {recorded
              ? `${recorded.date} · ${recorded.time}`
              : "Not available for this historical record"}
          </dd>
        </div>
        <div>
          <dt>Arrival date and time</dt>
          <dd>
            {arrival.date} · {arrival.time}
          </dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{timezone}</dd>
        </div>
        <div>
          <dt>Record ID</dt>
          <dd className={styles.identifier}>{record.id}</dd>
        </div>
        <div>
          <dt>Original creation timestamp</dt>
          <dd className={styles.identifier}>{record.created_at}</dd>
        </div>
      </dl>
      <section className={styles.evidence} aria-label="Delivery evidence">
        <h3>Photo / ticket evidence</h3>
        {record.evidence.length ? (
          record.evidence.map((evidence) => (
            <figure key={evidence.id}>
              <Photo evidence={evidence} demo />
              <figcaption>{evidence.name}</figcaption>
            </figure>
          ))
        ) : (
          <p className={styles.muted}>No photograph was recorded.</p>
        )}
        <p className={styles.muted}>
          Supporting evidence only. A photograph does not establish physical
          receipt.
        </p>
      </section>
      {events.length > 0 && (
        <details className={styles.audit}>
          <summary>Audit history</summary>
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.action}</strong>
                <span>
                  {event.actor_name} ·{" "}
                  {displayClock(event.created_at, timezone).date}{" "}
                  {displayClock(event.created_at, timezone).time}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </dialog>
  );
}

export function SupervisorWorkspace({
  data,
  siteId,
  onSiteChange,
  onRefresh,
  onSignOut,
  busy = false,
  error = "",
}: {
  data: Bootstrap;
  siteId: string;
  onSiteChange: (id: string) => void;
  onRefresh: () => Promise<unknown>;
  onSignOut: () => Promise<void>;
  busy?: boolean;
  error?: string;
}) {
  const timezone =
    data.sites.find((site) => site.id === siteId)?.timezone || "Europe/London";
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [filters, setFilters] = useState<SupervisorFilters>({});
  const [tab, setTab] = useState<Tab>("Records");
  const [viewing, setViewing] = useState<{
    record: Delivery;
    kind: "details" | "photo";
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const refreshLock = useRef(false);
  const exportLock = useRef(false);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const prefix = useId();
  const range = customRange || { from: "", to: "" };
  const invalidRange = Boolean(range.from && range.to && range.from > range.to);
  const view = buildSupervisorView(data, siteId, range, filters);
  const extraFilterCount = [
    filters.materialId,
    filters.category,
    filters.entryType,
    filters.classification,
  ].filter(Boolean).length;
  const periodLabel = customRange
    ? `${range.from || "First record"} — ${range.to || "Latest record"}`
    : "All recorded dates";

  async function refresh() {
    if (refreshLock.current || busy) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }

  function clearFilters() {
    setCustomRange(null);
    setFilters({});
    setExportError("");
  }

  async function exportRows() {
    if (exportLock.current || invalidRange) return;
    exportLock.current = true;
    setExporting(true);
    setExportError("");
    const parameters = new URLSearchParams({
      view: "arrivals",
      format: "csv",
      site_id: siteId,
    });
    for (const [key, value] of Object.entries({
      from: range.from,
      to: range.to,
      marshal_id: filters.marshalId,
      material_id: filters.materialId,
      category: filters.category,
      entry_type: filters.entryType,
      classification: filters.classification,
    }))
      if (value) parameters.set(key, value);
    try {
      await downloadReport(`/api/reports?${parameters}`);
    } catch (problem) {
      setExportError(
        problem instanceof Error
          ? problem.message
          : "The report could not be exported. Try again.",
      );
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const destination =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (destination < 0) return;
    event.preventDefault();
    setTab(tabs[destination]);
    tabButtons.current[destination]?.focus();
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.shell}>
        <div className={styles.utilityBar}>
          <a
            href="/demo/supervisor"
            className={styles.brand}
            aria-label="DJ Civils home"
          >
            <img
              src="/djcu-logo.jpg"
              width={85}
              height={48}
              alt="DJ Civils Ltd"
            />
            <span>
              DJ CIVILS<small>Traffic Marshal Unit</small>
            </span>
          </a>
          <div className={styles.utilityActions}>
            <span className={styles.demoLabel}>Browser demo</span>
            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={busy}
              className={styles.iconButton}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <main>
          <header className={styles.heading}>
            <h1>
              Gate <span>— Supervisor Workspace</span>
            </h1>
            <p>Site arrivals and traffic marshal activity</p>
          </header>
          <section
            className={styles.stats}
            role="region"
            aria-label="Workspace summary"
          >
            <div
              className={styles.stat}
              role="group"
              aria-label={`Arrivals: ${view.stats.arrivals}`}
            >
              <span>Arrivals</span>
              <strong>{view.stats.arrivals.toLocaleString("en-GB")}</strong>
            </div>
            <div
              className={styles.stat}
              role="group"
              aria-label={`Marshals: ${view.stats.marshals}`}
            >
              <span>Marshals</span>
              <strong>{view.stats.marshals.toLocaleString("en-GB")}</strong>
            </div>
            <div
              className={styles.stat}
              role="group"
              aria-label={`To Classify: ${view.stats.toClassify}`}
              title="Distinct pending catalogue items represented in the selected records, not the number of pending arrivals."
            >
              <span>To Classify</span>
              <strong>{view.stats.toClassify.toLocaleString("en-GB")}</strong>
            </div>
          </section>
          <div
            className={styles.tabList}
            role="tablist"
            aria-label="Supervisor workspace"
          >
            {tabs.map((name, index) => (
              <button
                key={name}
                ref={(element) => {
                  tabButtons.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${prefix}-tab-${name}`}
                aria-selected={tab === name}
                aria-controls={`${prefix}-panel-${name}`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}
                onKeyDown={(event) => switchTab(event, index)}
              >
                {name}
                {name === "Review" && view.stats.toClassify > 0 && (
                  <span aria-hidden="true">{view.stats.toClassify}</span>
                )}
              </button>
            ))}
          </div>
          <section className={styles.content}>
            <div className={styles.filters}>
              <label className={styles.marshalFilter}>
                Traffic marshal
                <select
                  value={filters.marshalId || ""}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      marshalId: event.target.value,
                    }))
                  }
                >
                  <option value="">All traffic marshals</option>
                  {view.marshalOptions.map((marshal) => (
                    <option key={marshal.id} value={marshal.id}>
                      {marshal.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.filterActions}>
                <span>
                  {view.stats.arrivals}{" "}
                  {view.stats.arrivals === 1 ? "arrival" : "arrivals"} in this
                  view
                </span>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
              <div className={styles.periodBar}>
                <span>
                  {periodLabel}
                  <span className={styles.periodTimezone}> · {timezone}</span>
                </span>
                <div className={styles.toolbarActions}>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={busy || refreshing}
                    className={styles.iconButton}
                    aria-label="Refresh deliveries"
                  >
                    <RefreshCw
                      size={17}
                      className={refreshing ? styles.spinning : undefined}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportRows()}
                    disabled={exporting || invalidRange}
                    className={styles.quietButton}
                  >
                    <Download size={16} aria-hidden="true" />
                    {exporting ? "Exporting…" : "Export CSV"}
                  </button>
                </div>
              </div>
              {data.sites.length > 1 && (
                <label className={styles.sitePicker}>
                  Site
                  <select
                    aria-label="Current site"
                    value={siteId}
                    onChange={(event) => {
                      onSiteChange(event.target.value);
                      setFilters({});
                    }}
                  >
                    {data.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className={styles.dateRange}>
                <summary>
                  Date range
                  <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className={styles.dateGrid}>
                  <label>
                    From date
                    <input
                      type="date"
                      value={range.from}
                      max={range.to || undefined}
                      aria-invalid={invalidRange}
                      onChange={(event) =>
                        setCustomRange((previous) => ({
                          ...(previous || { from: "", to: "" }),
                          from: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    To date
                    <input
                      type="date"
                      value={range.to}
                      min={range.from || undefined}
                      aria-invalid={invalidRange}
                      onChange={(event) =>
                        setCustomRange((previous) => ({
                          ...(previous || { from: "", to: "" }),
                          to: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </details>
              {(error || exportError || invalidRange) && (
                <div className={styles.alert} role="alert">
                  {invalidRange
                    ? "Choose a To date on or after the From date."
                    : error || exportError}
                </div>
              )}

              <details className={styles.moreFilters}>
                <summary>
                  More filters{extraFilterCount ? ` · ${extraFilterCount}` : ""}
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div className={styles.extraFilters}>
                  <label>
                    Item
                    <select
                      value={filters.materialId || ""}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          materialId: event.target.value,
                        }))
                      }
                    >
                      <option value="">All items</option>
                      {data.materials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Category
                    <select
                      value={filters.category || ""}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          category: event.target.value,
                        }))
                      }
                    >
                      <option value="">All categories</option>
                      {[...CATEGORIES, PENDING_CATEGORY].map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Entry type
                    <select
                      value={filters.entryType || ""}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          entryType: event.target.value,
                        }))
                      }
                    >
                      <option value="">All entry types</option>
                      {[...ENTRY_TYPES, PENDING_ENTRY_TYPE].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Classification
                    <select
                      value={filters.classification || ""}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          classification: event.target.value,
                        }))
                      }
                    >
                      <option value="">All classifications</option>
                      <option value="Approved">Approved</option>
                      <option value="Pending">Pending classification</option>
                    </select>
                  </label>
                </div>
              </details>
            </div>
            <div
              role="tabpanel"
              id={`${prefix}-panel-Records`}
              aria-labelledby={`${prefix}-tab-Records`}
              hidden={tab !== "Records"}
              tabIndex={0}
            >
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Scrollable delivery records"
                tabIndex={0}
              >
                <table
                  className={styles.recordsTable}
                  aria-label="Saved delivery records"
                >
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Marshal</th>
                      <th scope="col">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <tr key={row.record.id} data-record-id={row.record.id}>
                        <td>
                          <div className={styles.itemCell}>
                            <button
                              type="button"
                              className={styles.recordButton}
                              aria-label={`View ${row.item.name} record ${row.record.id}`}
                              onClick={() =>
                                setViewing({
                                  record: row.record,
                                  kind: "details",
                                })
                              }
                            >
                              {row.item.name}
                            </button>
                            {row.record.evidence.length > 0 && (
                              <button
                                type="button"
                                className={styles.photoButton}
                                onClick={() =>
                                  setViewing({
                                    record: row.record,
                                    kind: "photo",
                                  })
                                }
                                aria-label="View photo"
                              >
                                <ImageIcon size={16} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{row.marshalName}</td>
                        <td>
                          <RecordedTime
                            record={row.record}
                            timezone={timezone}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!view.rows.length && (
                <p className={styles.empty}>
                  No saved deliveries match these filters.
                </p>
              )}
              <p className={styles.tableNote}>
                Select an item for details and evidence.{" "}
                <span>
                  * Original arrival time where a recording timestamp is
                  unavailable.
                </span>
              </p>
            </div>
            <div
              role="tabpanel"
              id={`${prefix}-panel-Workload`}
              aria-labelledby={`${prefix}-tab-Workload`}
              hidden={tab !== "Workload"}
              tabIndex={0}
            >
              <div className={styles.panelHeading}>
                <h2>Traffic marshal activity</h2>
                <p>
                  Recorded gate arrivals for the selected period. Counts
                  describe logged arrivals only.
                </p>
              </div>
              {!view.workload.length && (
                <p className={styles.empty}>
                  No marshal activity matches these filters.
                </p>
              )}
              <div className={styles.workloadList}>
                {view.workload.map((marshal) => (
                  <article
                    className={styles.workloadCard}
                    key={marshal.id}
                    aria-label={`Activity for ${marshal.name}`}
                  >
                    <div className={styles.workloadHeading}>
                      <h3>{marshal.name}</h3>
                      <p>
                        <strong>{marshal.total}</strong>{" "}
                        {marshal.total === 1 ? "arrival" : "arrivals"}
                      </p>
                    </div>
                    <p className={styles.workloadLabel}>Items recorded</p>
                    <ul className={styles.materialList}>
                      {marshal.materials.map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          <strong>{item.total}</strong>
                        </li>
                      ))}
                    </ul>
                    <details className={styles.activityDetails}>
                      <summary>
                        Activity by day · {marshal.days.length}{" "}
                        {marshal.days.length === 1 ? "date" : "dates"}
                      </summary>
                      <table
                        className={styles.breakdownTable}
                        aria-label={`Daily activity for ${marshal.name}`}
                      >
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Arrivals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marshal.days.map((day) => (
                            <tr key={day.date}>
                              <td>{day.date}</td>
                              <td>{day.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    <details className={styles.activityDetails}>
                      <summary>Recorded times</summary>
                      <ul className={styles.timeList}>
                        {marshal.rows.map((row) => (
                          <li key={row.record.id}>
                            <span>
                              {displayClock(row.timestamp, timezone).date} ·{" "}
                              <RecordedTime
                                record={row.record}
                                timezone={timezone}
                              />
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setViewing({
                                  record: row.record,
                                  kind: "details",
                                })
                              }
                            >
                              {row.item.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </article>
                ))}
              </div>
            </div>
            <div
              role="tabpanel"
              id={`${prefix}-panel-Review`}
              aria-labelledby={`${prefix}-tab-Review`}
              hidden={tab !== "Review"}
              tabIndex={0}
            >
              <div className={styles.panelHeading}>
                <h2>Catalogue review</h2>
              </div>
              <ClassificationReview
                materials={data.materials}
                records={view.records}
                onRefresh={onRefresh}
                embedded
                className={styles.reviewPanel}
              />
              {view.unavailablePendingItems.length > 0 && (
                <section
                  className={styles.orphanNotice}
                  aria-label="Unlinked historical items"
                >
                  <h3>Unlinked historical items</h3>
                  <p>
                    These arrivals remain in the records. Their original
                    catalogue reference is unavailable, so they are excluded
                    from To Classify and cannot be approved here.
                  </p>
                  <ul>
                    {view.unavailablePendingItems.map((item) => (
                      <li key={item.id}>
                        <span>{item.name}</span>
                        <span>
                          {item.count}{" "}
                          {item.count === 1 ? "arrival" : "arrivals"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </section>
          <footer className={styles.footer}>
            <span>Demo records · This browser only</span>
            <span>Changes and photos are not shared across devices.</span>
          </footer>
        </main>
      </div>
      {viewing?.kind === "details" && (
        <ArrivalDetails
          record={viewing.record}
          data={data}
          timezone={timezone}
          onClose={() => setViewing(null)}
        />
      )}
      {viewing?.kind === "photo" && (
        <PhotoDialog
          delivery={viewing.record}
          demo
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
