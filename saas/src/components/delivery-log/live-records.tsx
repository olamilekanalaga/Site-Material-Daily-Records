"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { ArrowLeftRight, ImageIcon } from "lucide-react";
import { canReadReports } from "@/lib/access";
import type { Bootstrap, Delivery, Marshal } from "@/lib/types";
import { normaliseItemName } from "@/lib/catalogue";
import { periodDeliveries, type DateRange } from "@/lib/delivery-records";
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
}: {
  data: Bootstrap;
  siteId: string;
}) {
  const timezone =
    data.sites.find((site) => site.id === siteId)?.timezone || "Europe/London";
  const [today, setToday] = useState(
    () => siteClock(new Date(), timezone).date,
  );
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [material, setMaterial] = useState("");
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
  const matchingRecords = periodDeliveries(
    data.deliveries,
    siteId,
    timezone,
    range,
  )
    .filter((record) => !material || record.material_id === material)
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

  const records = matchingRecords.filter(
    (record) => !direction || (record.direction ?? "IN") === direction,
  );
  const outCount = matchingRecords.filter(
    (record) => record.direction === "OUT",
  ).length;

  async function exportRows() {
    if (exporting || invalid) return;
    setExporting(true);
    setError("");
    const parameters = new URLSearchParams({
      view: "arrivals",
      direction,
      format: "csv",
      site_id: siteId,
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
      {canExport && !invalid && (
        <section
          className={styles.analytics}
          aria-labelledby="movement-analytics"
        >
          <h2 id="movement-analytics">Movement analytics</h2>
          <dl>
            <div>
              <dt>IN</dt>
              <dd>{matchingRecords.length - outCount}</dd>
            </div>
            <div>
              <dt>OUT</dt>
              <dd>{outCount}</dd>
            </div>
            <div>
              <dt>Total movements</dt>
              <dd>{matchingRecords.length}</dd>
            </div>
          </dl>
        </section>
      )}
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
          items={data.materials}
          value={material}
          label="Material"
          searchLabel="Search materials"
          placeholder="All materials"
          clearLabel="All materials"
          plainNames
          onSelect={setMaterial}
        />
        <ItemSelector
          items={data.suppliers}
          value={supplier}
          label="Supplier"
          searchLabel="Search suppliers"
          placeholder="All suppliers"
          clearLabel="All suppliers"
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
      <div className={styles.actions}>
        <span>
          {customRange ? "Custom date range" : "Today · updates automatically"}{" "}
          · {timezone} · {records.length}{" "}
          {records.length === 1 ? "delivery" : "deliveries"}
        </span>
        <div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setToday(siteClock(new Date(), timezone).date);
              setCustomRange(null);
              setMaterial("");
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
                "Material",
                "Supplier",
                "Time",
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
                          width={36}
                          height={36}
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
                  <td>
                    {record.item_name ||
                      data.materials.find(
                        (item) => item.id === record.material_id,
                      )?.name ||
                      "Historical material"}
                  </td>
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
                  <td>
                    {record.evidence.length ? (
                      <button
                        className="simple-photo-button"
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
