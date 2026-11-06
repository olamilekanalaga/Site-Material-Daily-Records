"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ImageIcon, X } from "lucide-react";
import type { Bootstrap, Delivery, Evidence } from "@/lib/types";
import { siteClock } from "@/lib/site-time";
import {
  arrivalCounts,
  periodDeliveries,
  periodRange,
  type DateRange,
  type PeriodPreset,
} from "@/lib/delivery-records";

const periods: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "3days", label: "Last 3 days" },
  { id: "7days", label: "Last 7 days" },
  { id: "month", label: "This month" },
];

function Photo({
  evidence,
  demo,
  thumbnail = false,
}: {
  evidence: Evidence;
  demo: boolean;
  thumbnail?: boolean;
}) {
  const [url, setUrl] = useState(demo ? "" : `/api/evidence/${evidence.id}`);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!demo) return;
    let active = true,
      objectUrl = "";
    void import("@/lib/demo/browser")
      .then((module) => module.demoEvidenceUrl(evidence.id))
      .then((value) => {
        objectUrl = value;
        if (active) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [demo, evidence.id]);
  if (error)
    return (
      <span>
        {thumbnail
          ? "Photo unavailable"
          : "This photo could not be loaded. Close it and try again."}
      </span>
    );
  if (!url) return <span>Loading photo…</span>;
  return (
    <img
      className={thumbnail ? "simple-thumbnail" : "simple-photo-full"}
      src={url}
      alt={thumbnail ? "" : "Delivery image"}
      onError={() => setError(true)}
    />
  );
}
function PhotoDialog({
  delivery,
  demo,
  onClose,
}: {
  delivery: Delivery;
  demo: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="simple-photo-dialog"
      onCancel={onClose}
      aria-labelledby="photo-heading"
    >
      <div className="simple-panel-title">
        <h2 id="photo-heading">Delivery photo</h2>
        <button
          className="icon-button"
          aria-label="Close photo"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {delivery.evidence.map((e) => (
        <Photo key={e.id} evidence={e} demo={demo} />
      ))}
      <p className="simple-help">
        Supporting image only. Physical receipt has not been established by this
        photo.
      </p>
    </dialog>
  );
}
export function SimpleRecords({
  data,
  siteId,
}: {
  data: Bootstrap;
  siteId: string;
}) {
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [preset, setPreset] = useState<PeriodPreset | "custom">("all");
  const [material, setMaterial] = useState("");
  const [viewing, setViewing] = useState<Delivery | null>(null);
  const timezone = data.sites.find((s) => s.id === siteId)?.timezone || "UTC";
  const invalidRange = Boolean(range.from && range.to && range.from > range.to);
  const periodRecords = periodDeliveries(
    data.deliveries,
    siteId,
    timezone,
    range,
  );
  const counts = arrivalCounts(periodRecords);
  const records = periodRecords.filter(
    (d) => !material || d.material_id === material,
  );
  const summaryMaterials = data.materials.filter(
    (item) => item.active || counts.byMaterial.has(item.id),
  );
  return (
    <section className="simple-panel simple-records-panel">
      <div
        className="simple-period-shortcuts"
        role="group"
        aria-label="Date shortcuts"
      >
        {periods.map((period) => (
          <button
            key={period.id}
            type="button"
            aria-pressed={preset === period.id}
            onClick={() => {
              setRange(periodRange(period.id, timezone));
              setPreset(period.id);
            }}
          >
            {period.label}
          </button>
        ))}
      </div>
      <div className="simple-filters">
        <label className="simple-date-filter">
          From date
          <input
            type="date"
            value={range.from}
            max={range.to || undefined}
            aria-invalid={invalidRange}
            onChange={(e) => {
              setRange((previous) => ({ ...previous, from: e.target.value }));
              setPreset("custom");
            }}
          />
        </label>
        <label className="simple-date-filter">
          To date
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            aria-invalid={invalidRange}
            onChange={(e) => {
              setRange((previous) => ({ ...previous, to: e.target.value }));
              setPreset("custom");
            }}
          />
        </label>
        <label>
          Material
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          >
            <option value="">All materials</option>
            {data.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary simple-clear-filters"
          onClick={() => {
            setRange({ from: "", to: "" });
            setPreset("all");
            setMaterial("");
          }}
        >
          Clear filters
        </button>
      </div>
      {invalidRange && (
        <p className="simple-range-error" role="alert">
          Choose a To date on or after the From date.
        </p>
      )}
      <div className="simple-summary-heading">
        <div>
          <h2>Delivery totals</h2>
          <p>
            Recorded arrivals in selected dates. Select a card to filter the
            table.
          </p>
        </div>
        <span>
          <ArrowLeftRight size={16} aria-hidden="true" /> More materials
        </span>
      </div>
      <div
        className="simple-summary-cards"
        role="region"
        aria-label="Delivery summaries"
        tabIndex={0}
      >
        <button
          type="button"
          className="simple-summary-card is-total"
          aria-pressed={!material}
          aria-label={`Total deliveries: ${counts.total}`}
          onClick={() => setMaterial("")}
        >
          <span>Total deliveries</span>
          <strong>{counts.total.toLocaleString("en-GB")}</strong>
          <small>arrivals</small>
        </button>
        {summaryMaterials.map((item) => {
          const count = counts.byMaterial.get(item.id) || 0;
          return (
            <button
              key={item.id}
              type="button"
              className="simple-summary-card"
              aria-pressed={material === item.id}
              aria-label={`${item.name}: ${count} deliveries`}
              onClick={() => setMaterial(item.id)}
            >
              <span>{item.name}</span>
              <strong>{count.toLocaleString("en-GB")}</strong>
              <small>deliveries</small>
            </button>
          );
        })}
      </div>
      <p className="simple-table-hint">
        <ArrowLeftRight size={16} aria-hidden="true" />
        Swipe sideways to see all columns, including photos.
      </p>
      <div
        className="simple-table-scroll"
        role="region"
        tabIndex={0}
        aria-label="Scrollable delivery records"
      >
        <table className="simple-table" aria-label="Saved delivery records">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
              <th scope="col">Material</th>
              <th scope="col">Supplier/Company</th>
              <th scope="col">Traffic Marshal</th>
              <th scope="col">Photo</th>
            </tr>
          </thead>
          <tbody>
            {records.map((d) => {
              const clock = siteClock(new Date(d.arrival_at), timezone);
              return (
                <tr key={d.id}>
                  <td className="simple-date-cell">{clock.date}</td>
                  <td className="simple-time-cell">{clock.time}</td>
                  <td>
                    {data.materials.find((m) => m.id === d.material_id)?.name ||
                      "Historical material"}
                  </td>
                  <td>
                    {d.supplier_name ||
                      data.suppliers.find((s) => s.id === d.supplier_id)
                        ?.name ||
                      "Not recorded"}
                  </td>
                  <td className="simple-marshal-cell">
                    {d.marshal_name || d.creator_name}
                  </td>
                  <td>
                    {d.evidence.length ? (
                      <button
                        className="simple-photo-button"
                        onClick={() => setViewing(d)}
                      >
                        <Photo
                          evidence={d.evidence[0]}
                          demo={data.mode === "demo"}
                          thumbnail
                        />
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
      <p className="simple-table-note">
        Showing {records.length} of {counts.total} saved deliveries · Site time:{" "}
        {timezone}
      </p>
      {viewing && (
        <PhotoDialog
          delivery={viewing}
          demo={data.mode === "demo"}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
