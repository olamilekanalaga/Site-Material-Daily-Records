"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { ArrowLeftRight, ChevronDown, ImageIcon } from "lucide-react";
import { canReadReports } from "@/lib/access";
import type { Bootstrap, Delivery, Marshal } from "@/lib/types";
import { normaliseItemName } from "@/lib/catalogue";
import {
  matchesMovementView,
  periodDeliveries,
  type DateRange,
  type MovementView,
} from "@/lib/delivery-records";
import { siteClock } from "@/lib/site-time";
import { downloadReport } from "@/lib/client/offline";
import { Photo, PhotoDialog } from "./delivery-photo";
import { ItemSelector } from "./item-selector";
import styles from "./live-delivery.module.css";

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
  view = "Aggregate",
}: {
  data: Bootstrap;
  siteId: string;
  view?: MovementView;
}) {
  const timezone =
    data.sites.find((site) => site.id === siteId)?.timezone || "Europe/London";
  const [today, setToday] = useState(
    () => siteClock(new Date(), timezone).date,
  );
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [itemFilters, setItemFilters] = useState<
    Partial<Record<MovementView, string>>
  >({});
  const material = itemFilters[view] ?? "";
  const [direction, setDirection] = useState("");
  const [supplier, setSupplier] = useState("");
  const [viewing, setViewing] = useState<Delivery | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
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
  const range = customRange || { from: today, to: today };
  const invalid = Boolean(range.from && range.to && range.from > range.to);
  const selectedSupplier = data.suppliers.find((item) => item.id === supplier);
  const siteRecords = data.deliveries.filter(
    (record) =>
      record.site_id === siteId &&
      matchesMovementView(record, view, itemName(record)),
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
      data.materials.find((item) => item.id === record.material_id)?.name ||
      "Historical material"
    );
  }

  const totals = new Map<string, { label: string; count: number }>();
  for (const record of records) {
    const existing = totals.get(record.material_id);
    if (existing) existing.count++;
    else totals.set(record.material_id, { label: itemName(record), count: 1 });
  }
  const metrics = [...totals].sort(([, a], [, b]) =>
    a.label.localeCompare(b.label),
  );

  async function exportRows() {
    if (exporting || invalid) return;
    setExporting(true);
    setError("");
    const parameters = new URLSearchParams({
      view: "arrivals",
      direction,
      format: "csv",
      site_id: siteId,
      movement_view: view,
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
          <h2 id="movement-analytics">{view} records</h2>
          {metrics.length > 0 ? (
            <div
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
              No {view.toLowerCase()} match these filters.
            </p>
          )}
        </section>
      )}
      <details className={styles.filterDisclosure}>
        <summary>
          Filters <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className={styles.filters}>
          <label>
            From date
            <input
              type="date"
              value={range.from}
              max={range.to || undefined}
              aria-invalid={invalid}
              onChange={(event) =>
                setCustomRange((previous) => ({
                  ...(previous || { from: today, to: today }),
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
                  ...(previous || { from: today, to: today }),
                  to: event.target.value,
                }))
              }
            />
          </label>
          <ItemSelector
            items={viewItems}
            value={material}
            label={view === "Service" ? "Service" : "Material"}
            searchLabel={
              view === "Service" ? "Search services" : "Search materials"
            }
            placeholder={view === "Service" ? "All services" : "All materials"}
            clearLabel={view === "Service" ? "All services" : "All materials"}
            plainNames
            onSelect={(id) =>
              setItemFilters((filters) => ({ ...filters, [view]: id }))
            }
          />
          <ItemSelector
            items={data.suppliers}
            value={supplier}
            label={view === "Service" ? "Provider" : "Supplier"}
            searchLabel={
              view === "Service" ? "Search providers" : "Search suppliers"
            }
            placeholder={view === "Service" ? "All providers" : "All suppliers"}
            clearLabel={view === "Service" ? "All providers" : "All suppliers"}
            plainNames
            onSelect={setSupplier}
          />
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
          {customRange
            ? `${range.from || "Any date"} to ${range.to || "Any date"}`
            : "Today · updates automatically"}{" "}
          · {timezone} · {records.length}{" "}
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
              setSupplier("");
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
      <p className="simple-table-hint">
        <ArrowLeftRight size={16} aria-hidden="true" />
        Swipe sideways to see all columns.
      </p>
      <div
        className="simple-table-scroll"
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
                view === "Service" ? "Service" : "Material",
                ...(view === "Concrete" ? ["Mix"] : []),
                view === "Service" ? "Provider" : "Supplier",
                "Time",
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
                    <time dateTime={record.arrival_at}>{clock.time}</time>
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
