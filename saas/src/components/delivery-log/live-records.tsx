"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowLeftRight, ChevronDown, ImageIcon } from "lucide-react";
import { canReadReports } from "@/lib/access";
import type { Bootstrap, Delivery, Marshal } from "@/lib/types";
import { normaliseItemName } from "@/lib/catalogue";
import {
  matchesMovementView,
  movementCategory,
  movementViews,
  periodDeliveries,
  type DateRange,
  type MovementView,
  type RecordsView,
} from "@/lib/delivery-records";
import { siteClock } from "@/lib/site-time";
import { downloadReport } from "@/lib/client/offline";
import { Photo, PhotoDialog } from "./delivery-photo";
import { ItemSelector } from "./item-selector";
import styles from "./live-delivery.module.css";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function marshalPhotoSource(marshal: Marshal, mode: Bootstrap["mode"]) {
  if (!marshal.photo_path && !(mode === "supabase" && marshal.user_id))
    return "/marshal-placeholder.svg";
  if (
    mode === "local" &&
    /^\/marshals\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(marshal.photo_path || "")
  )
    return marshal.photo_path!;
  return `/api/marshals/${encodeURIComponent(marshal.id)}/photo`;
}

export function onMarshalPhotoError(event: SyntheticEvent<HTMLImageElement>) {
  if (event.currentTarget.getAttribute("src") !== "/marshal-placeholder.svg")
    event.currentTarget.src = "/marshal-placeholder.svg";
}

export function LiveRecords({
  data,
  siteId,
  view = "Overview",
}: {
  data: Bootstrap;
  siteId: string;
  view?: RecordsView;
}) {
  const timezone =
    data.sites.find((site) => site.id === siteId)?.timezone || "Europe/London";
  const [today, setToday] = useState(
    () => siteClock(new Date(), timezone).date,
  );
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [itemFilters, setItemFilters] = useState<
    Partial<Record<RecordsView, string>>
  >({});
  const [category, setCategory] = useState<MovementView | "">("");
  const [direction, setDirection] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [viewing, setViewing] = useState<Delivery | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const tableHint = useRef<HTMLParagraphElement>(null);
  const canExport = canReadReports(data.actor.role);
  useEffect(() => {
    const refresh = () => setToday(siteClock(new Date(), timezone).date);
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [timezone]);

  useEffect(() => {
    const hint = tableHint.current;
    if (
      !hint ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        hint.dataset.revealed = "true";
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(hint);
    return () => observer.disconnect();
  }, []);

  const overview = view === "Overview";
  const activeCategory = overview ? category : "";
  const filteredView = activeCategory || view;
  const material = overview ? "" : (itemFilters[view] ?? "");
  const supplier = overview ? "" : supplierFilter;
  const service = view === "Service";
  const itemLabel = service ? "Service" : "Material";
  const itemPlural = service ? "services" : "materials";
  const supplierLabel = service ? "Provider" : "Supplier";
  const defaultDate = overview ? "" : today;
  const range = customRange ?? { from: defaultDate, to: defaultDate };
  const hasDates = Boolean(range.from || range.to);
  const invalid = Boolean(range.from && range.to && range.from > range.to);
  const selectedSupplier = data.suppliers.find((item) => item.id === supplier);
  const materialNames = new Map(
    data.materials.map(({ id, name }) => [id, name]),
  );
  const siteRecords = data.deliveries.filter(
    (record) =>
      record.site_id === siteId &&
      matchesMovementView(record, filteredView, itemName(record)),
  );
  const recordedItems = new Set(
    siteRecords.map((record) => record.material_id),
  );
  const viewItems = data.materials.filter(
    (item) =>
      matchesMovementView(item, view, item.name) || recordedItems.has(item.id),
  );
  const records = periodDeliveries(siteRecords, siteId, timezone, range)
    .filter((record) => !material || record.material_id === material)
    .filter((record) => !direction || (record.direction ?? "IN") === direction)
    .filter(
      (record) =>
        !supplier ||
        record.supplier_id === supplier ||
        (!record.supplier_id &&
          selectedSupplier &&
          normaliseItemName(record.supplier_name || "") ===
            normaliseItemName(selectedSupplier.name)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.arrival_at) - Date.parse(a.arrival_at) ||
        Date.parse(b.recorded_at || b.created_at || b.arrival_at) -
          Date.parse(a.recorded_at || a.created_at || a.arrival_at) ||
        b.id.localeCompare(a.id),
    );

  function itemName(record: Delivery) {
    return (
      record.item_name ||
      materialNames.get(record.material_id) ||
      "Historical material"
    );
  }

  const totals = new Map<string, { label: string; count: number }>(
    overview ? movementViews.map((label) => [label, { label, count: 0 }]) : [],
  );
  for (const record of records) {
    const name = itemName(record);
    const key = overview ? movementCategory(record, name) : record.material_id;
    const existing = totals.get(key);
    if (existing) existing.count++;
    else totals.set(key, { label: name, count: 1 });
  }
  const metrics = [...totals];
  if (overview)
    metrics.unshift([
      "total",
      { label: "Total records", count: records.length },
    ]);
  else metrics.sort(([, a], [, b]) => a.label.localeCompare(b.label));
  const periodLabel = !hasDates
    ? "All time"
    : customRange
      ? `${range.from || "Any date"} to ${range.to || "Any date"}`
      : "Today · updates automatically";

  async function exportRows() {
    if (exporting || invalid) return;
    setExporting(true);
    setError("");
    const parameters = new URLSearchParams({
      view: "arrivals",
      direction,
      format: "csv",
      site_id: siteId,
      movement_view: filteredView,
    });
    for (const [key, value] of Object.entries({
      from: range.from,
      to: range.to,
      material_id: material,
      supplier_id: supplier,
    }))
      if (value) parameters.set(key, value);
    try {
      await downloadReport(`/api/reports?${parameters}`);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The report could not be exported. Try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      className={`simple-panel simple-records-panel ${styles.filterPanel}`}
    >
      {!invalid && (
        <section
          className={styles.analytics}
          aria-labelledby="movement-analytics"
        >
          <h2 id="movement-analytics">
            {overview ? "Overview" : `${view} records`}
          </h2>
          {metrics.length > 0 ? (
            <div
              key={view}
              className={styles.cardScroll}
              role="region"
              aria-label={`${view} counts`}
              tabIndex={0}
            >
              <dl>
                {metrics.map(([id, { label, count }]) => (
                  <div key={id}>
                    <dt>{label}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className={styles.classificationNote}>
              No {view.toLowerCase()} records match these filters.
            </p>
          )}
        </section>
      )}
      <details className={styles.filterDisclosure}>
        <summary>
          Filters <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div
          className={
            overview
              ? `${styles.filters} ${styles.overviewFilters}`
              : styles.filters
          }
        >
          <label>
            From date
            <input
              type="date"
              value={range.from}
              max={range.to || undefined}
              aria-invalid={invalid}
              onChange={(event) =>
                setCustomRange((previous) => ({
                  ...(previous ?? { from: defaultDate, to: defaultDate }),
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
              aria-invalid={invalid}
              onChange={(event) =>
                setCustomRange((previous) => ({
                  ...(previous ?? { from: defaultDate, to: defaultDate }),
                  to: event.target.value,
                }))
              }
            />
          </label>
          {overview ? (
            <label>
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as MovementView | "")
                }
              >
                <option value="">All categories</option>
                {movementViews.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <ItemSelector
                items={viewItems}
                value={material}
                label={itemLabel}
                searchLabel={`Search ${itemPlural}`}
                placeholder={`All ${itemPlural}`}
                clearLabel={`All ${itemPlural}`}
                plainNames
                onSelect={(id) =>
                  setItemFilters((filters) => ({ ...filters, [view]: id }))
                }
              />
              <ItemSelector
                items={data.suppliers}
                value={supplier}
                label={supplierLabel}
                searchLabel={service ? "Search providers" : "Search suppliers"}
                placeholder={service ? "All providers" : "All suppliers"}
                clearLabel={service ? "All providers" : "All suppliers"}
                plainNames
                onSelect={setSupplierFilter}
              />
            </>
          )}
          <label>
            Direction
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              <option value="">All directions</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </label>
        </div>
      </details>
      <div className={styles.actions}>
        <span>
          {periodLabel} · {activeCategory && `${activeCategory} · `}
          {timezone} · {records.length}{" "}
          {records.length === 1 ? "record" : "records"}
        </span>
        <div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setToday(siteClock(new Date(), timezone).date);
              setCustomRange(null);
              setItemFilters({});
              setCategory("");
              setSupplierFilter("");
              setDirection("");
              setError("");
            }}
          >
            Clear filters
          </button>
          {canExport && (
            <button
              type="button"
              className="secondary"
              disabled={exporting || invalid}
              onClick={() => void exportRows()}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          )}
        </div>
      </div>
      {invalid && (
        <p role="alert" className="simple-range-error">
          Choose a To date on or after the From date.
        </p>
      )}
      {error && (
        <p role="alert" className="simple-error">
          {error}
        </p>
      )}
      <p className={`simple-table-hint ${styles.tableHint}`} ref={tableHint}>
        <ArrowLeftRight size={16} aria-hidden="true" />
        Swipe sideways to see all columns.
      </p>
      <div
        className={`simple-table-scroll ${styles.tableReveal}`}
        role="region"
        aria-label="Scrollable delivery records"
        tabIndex={0}
      >
        <table
          className={`simple-table ${styles.recordsTable}`}
          aria-label="Saved delivery records"
        >
          <thead>
            <tr>
              {[
                "Marshal",
                "Direction",
                overview ? "Item" : itemLabel,
                ...(view === "Concrete" ? ["Mix"] : []),
                overview ? "Supplier / provider" : supplierLabel,
                overview ? "Date & time" : "Time",
                ...(view === "Concrete" ? ["Tonnage"] : []),
                "Photo",
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const clock = siteClock(new Date(record.arrival_at), timezone);
              const movementDirection = record.direction ?? "IN";
              const marshal = data.marshals?.find(
                (item) => item.id === record.marshal_id,
              );
              return (
                <tr key={record.id}>
                  <td>
                    <span className={styles.marshal}>
                      {marshal && (
                        <img
                          src={marshalPhotoSource(marshal, data.mode)}
                          onError={onMarshalPhotoError}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                        />
                      )}
                      <span>{record.marshal_name || record.creator_name}</span>
                    </span>
                  </td>
                  <td>
                    <span
                      className={styles.direction}
                      data-direction={movementDirection}
                    >
                      {movementDirection}
                    </span>
                  </td>
                  <td>{itemName(record)}</td>
                  {view === "Concrete" && <td>{record.mix || "—"}</td>}
                  <td>
                    {record.supplier_name ||
                      data.suppliers.find(
                        (item) => item.id === record.supplier_id,
                      )?.name ||
                      "Not recorded"}
                  </td>
                  <td className={styles.clockCell}>
                    <time dateTime={record.arrival_at}>
                      {overview &&
                        `${dateFormat.format(new Date(`${clock.date}T00:00:00Z`))} · `}
                      {clock.time}
                    </time>
                    {record.correction_reason && (
                      <small title={record.correction_reason}>
                        Corrected time
                      </small>
                    )}
                  </td>
                  {view === "Concrete" && (
                    <td>
                      {record.ticket_unit === "tonnes" &&
                      record.ticket_quantity != null
                        ? `${record.ticket_quantity} t`
                        : "—"}
                    </td>
                  )}
                  <td>
                    {record.evidence.length ? (
                      <button
                        className={`simple-photo-button ${styles.photoButton}`}
                        onClick={() => setViewing(record)}
                      >
                        <Photo evidence={record.evidence[0]} thumbnail />
                        <span>
                          <ImageIcon size={16} />
                          View photo
                        </span>
                      </button>
                    ) : (
                      <span className="simple-photo-missing">No photo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!records.length && (
        <p className="simple-empty">No saved deliveries match these filters.</p>
      )}
      {viewing && (
        <PhotoDialog delivery={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
