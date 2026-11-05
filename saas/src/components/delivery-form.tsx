"use client";
import { useEffect, useState } from "react";
import { Camera, Check, CloudUpload, Save, Trash2 } from "lucide-react";
import type { Bootstrap, DeliveryInput, Unit } from "@/lib/types";
import {
  request,
  removeDraft,
  saveDraft,
  synchroniseDraft,
  type LocalDraft,
  type LocalPhoto,
} from "@/lib/offline";

function dateInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function DeliveryForm({
  data,
  site,
  draft,
  online,
  onSaved,
  onSubmitted,
}: {
  data: Bootstrap;
  site: string;
  draft: LocalDraft | null;
  online: boolean;
  onSaved: (text: string) => Promise<void>;
  onSubmitted: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState<DeliveryInput>(
      () =>
        draft?.input || {
          id: crypto.randomUUID(),
          site_id: site,
          material_id: "",
          supplier_id: null,
          vehicle: "",
          ticket_number: "",
          ticket_quantity: null,
          ticket_unit: "tonnes",
          arrival_at: new Date().toISOString(),
          notes: "",
          intent: "submit",
        },
    ),
    [photos, setPhotos] = useState<LocalPhoto[]>(draft?.photos || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [previews, setPreviews] = useState<Record<string, string>>({});
  const owner = `${data.actor.company_id}:${data.actor.id}`,
    policy = data.sites.find((s) => s.id === input.site_id);
  useEffect(() => {
    const urls = Object.fromEntries(
      photos.map((p) => [p.id, URL.createObjectURL(p.file)]),
    );
    setPreviews(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [photos]);
  const change = <K extends keyof DeliveryInput>(
    key: K,
    value: DeliveryInput[K],
  ) => {
    setInput((old) => ({ ...old, [key]: value }));
    setSaved(false);
  };
  const makeDraft = (state: "saved" | "pending"): LocalDraft => ({
    id: input.id,
    owner,
    input,
    photos,
    state,
    updated_at: new Date().toISOString(),
  });
  const persist = async () => {
    setBusy(true);
    setError("");
    try {
      await saveDraft(makeDraft("saved"));
      setSaved(true);
      await onSaved(
        "Saved locally on this device. Not submitted to the server.",
      );
    } catch {
      setError(
        "Device storage is unavailable or full. Keep this page open and try submitting online.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    const local = makeDraft("pending");
    try {
      if (!input.material_id)
        throw new Error("Select a material before submitting.");
      await saveDraft(local);
      if (!online) {
        await onSaved(
          "Upload pending. Saved on this device; not submitted to server.",
        );
        setSaved(true);
        return;
      }
      const warnings = await synchroniseDraft(local);
      await removeDraft(input.id, owner);
      await onSubmitted(
        `Delivery submitted to server. Awaiting supervisor verification. ${warnings.join(" ")}`,
      );
    } catch (e) {
      const text = (e as Error).message;
      setError(text);
      try {
        await saveDraft({ ...local, error: text });
        await onSaved(
          "Saved in pending uploads. Resolve the error, then retry.",
        );
      } catch {
        setError(`${text} Device storage failed; keep this page open.`);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="capture-layout"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <section className="panel form-panel">
          <div className="step-heading">
            <span>1</span>
            <div>
              <h2>What’s arriving?</h2>
              <p>Select the material. One record per vehicle arrival.</p>
            </div>
          </div>
          <div className="material-grid" role="group" aria-label="Material">
            {data.materials
              .filter((m) => m.active)
              .map((m) => (
                <button
                  type="button"
                  key={m.id}
                  aria-pressed={input.material_id === m.id}
                  className={input.material_id === m.id ? "selected" : ""}
                  onClick={() => change("material_id", m.id)}
                >
                  <span aria-hidden="true">▰</span>
                  {m.name}
                  {input.material_id === m.id && <Check size={17} />}
                </button>
              ))}
          </div>
        </section>
        <section className="panel form-panel">
          <div className="step-heading">
            <span>2</span>
            <div>
              <h2>Arrival details</h2>
              <p>
                Known details now. Missing information can be corrected before
                acceptance.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Supplier
              <select
                value={input.supplier_id || ""}
                onChange={(e) => change("supplier_id", e.target.value || null)}
              >
                <option value="">Not yet known</option>
                {data.suppliers
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Vehicle registration
              <input
                placeholder="e.g. DEMO 01"
                maxLength={30}
                value={input.vehicle}
                onChange={(e) =>
                  change("vehicle", e.target.value.toUpperCase())
                }
              />
            </label>
            <label>
              Ticket number
              <input
                placeholder="If available"
                maxLength={80}
                value={input.ticket_number}
                onChange={(e) => change("ticket_number", e.target.value)}
              />
            </label>
            <label>
              Arrival date and time
              <input
                type="datetime-local"
                required
                value={dateInput(input.arrival_at)}
                onChange={(e) => {
                  if (e.target.value)
                    change(
                      "arrival_at",
                      new Date(e.target.value).toISOString(),
                    );
                }}
              />
              <small>
                Device time zone:{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}. Server
                receipt time is recorded separately.
              </small>
            </label>
            <label>
              Ticket quantity
              <input
                type="number"
                min="0.001"
                max="999999999"
                step="0.001"
                inputMode="decimal"
                placeholder="Quantity on the ticket"
                value={input.ticket_quantity ?? ""}
                onChange={(e) =>
                  change(
                    "ticket_quantity",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </label>
            <label>
              Quantity unit
              <select
                value={input.ticket_unit}
                onChange={(e) => change("ticket_unit", e.target.value as Unit)}
              >
                {["tonnes", "m³", "loads", "kg"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Notes
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Missing information, load observations or anything the supervisor should know…"
                value={input.notes}
                onChange={(e) => change("notes", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="panel form-panel">
          <div className="step-heading">
            <span>3</span>
            <div>
              <h2>Attach supporting evidence</h2>
              <p>
                Photograph the ticket or add an existing image. No automatic
                text extraction.
              </p>
            </div>
          </div>
          <div className="upload-grid">
            {(["ticket", "vehicle", "load"] as const).map((kind) => (
              <label className="upload-zone" key={kind}>
                <Camera size={24} />
                <strong>
                  {kind === "ticket"
                    ? "Ticket photograph"
                    : kind === "vehicle"
                      ? "Vehicle photograph"
                      : "Load photograph"}
                </strong>
                <small>Camera or image · JPG, PNG, WebP · up to 3 MiB</small>
                <input
                  aria-label={`${kind === "ticket" ? "Ticket" : kind === "vehicle" ? "Vehicle" : "Load"} photograph`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 3 * 1024 * 1024) {
                        setError("Each photograph must be 3 MiB or smaller.");
                        return;
                      }
                      if (
                        !["image/jpeg", "image/png", "image/webp"].includes(
                          file.type,
                        )
                      ) {
                        setError("Use JPEG, PNG or WebP photographs.");
                        return;
                      }
                      setPhotos((p) => [
                        ...p,
                        { id: crypto.randomUUID(), kind, file },
                      ]);
                      setSaved(false);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </div>
          {photos.length > 0 && (
            <div className="photo-preview-grid">
              {photos.map((p) => (
                <div key={p.id}>
                  {previews[p.id] && (
                    <img src={previews[p.id]} alt={`${p.kind} preview`} />
                  )}
                  <span>
                    {p.kind} · {(p.file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${p.kind} photo`}
                    onClick={() =>
                      setPhotos((old) => old.filter((x) => x.id !== p.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        {error && (
          <div className="notice danger" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <span>{saved ? "Saved on this device" : "Not yet submitted"}</span>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={persist}
          >
            <Save size={18} />
            Save locally
          </button>
          <button className="primary" disabled={busy}>
            <CloudUpload size={18} />
            {busy ? "Saving…" : online ? "Submit delivery" : "Queue for upload"}
          </button>
        </div>
      </div>
      <aside className="capture-help panel">
        <span className="soft-tag">GATE CAPTURE</span>
        <h2>
          Record the arrival.
          <br />
          Keep the original.
        </h2>
        <p>
          A supervisor will check physical receipt and record an accepted
          quantity separately.
        </p>
        <dl>
          <dt>Recorded by</dt>
          <dd>{data.actor.name}</dd>
          <dt>Site</dt>
          <dd>{policy?.name}</dd>
          <dt>Company</dt>
          <dd>{data.company.name}</dd>
          <dt>Delivery ID</dt>
          <dd className="mono">DL-{input.id.slice(0, 8).toUpperCase()}</dd>
        </dl>
        <div className="notice">
          Site acceptance rules: supplier, vehicle and quantity required.{" "}
          {policy?.require_ticket ? "Ticket number required. " : ""}
          {policy?.require_photo ? "Ticket photograph required. " : ""}These
          rules apply at acceptance; incomplete arrivals may still be submitted.
        </div>
        <p className="muted">
          Use fictional photographs only in this unofficial demo. A document
          image is supporting evidence, not independent proof of physical
          arrival.
        </p>
      </aside>
    </form>
  );
}
