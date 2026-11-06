"use client";
import { useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import type { Bootstrap, Delivery, Evidence } from "@/lib/types";
import { siteClock } from "@/lib/site-time";

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
  const [date, setDate] = useState("");
  const [material, setMaterial] = useState("");
  const [viewing, setViewing] = useState<Delivery | null>(null);
  const timezone = data.sites.find((s) => s.id === siteId)?.timezone || "UTC";
  const records = data.deliveries
    .filter(
      (d) =>
        d.site_id === siteId &&
        d.submitted_at &&
        (!date || siteClock(new Date(d.arrival_at), timezone).date === date) &&
        (!material || d.material_id === material),
    )
    .sort(
      (a, b) =>
        Date.parse(b.arrival_at) - Date.parse(a.arrival_at) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  return (
    <section className="simple-panel">
      <div className="simple-filters">
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
          className="secondary"
          onClick={() => {
            setDate("");
            setMaterial("");
          }}
        >
          Clear filters
        </button>
      </div>
      <div
        className="simple-table-scroll"
        tabIndex={0}
        aria-label="Scrollable delivery records"
      >
        <table className="simple-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Material</th>
              <th>Supplier/Company</th>
              <th>Traffic Marshal</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {records.map((d) => {
              const clock = siteClock(new Date(d.arrival_at), timezone);
              return (
                <tr key={d.id}>
                  <td>{clock.date}</td>
                  <td>{clock.time}</td>
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
                  <td>{d.marshal_name || d.creator_name}</td>
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
                      <span className="simple-help">No photo</span>
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
        {records.length} saved{" "}
        {records.length === 1 ? "delivery" : "deliveries"} · Site time:{" "}
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
