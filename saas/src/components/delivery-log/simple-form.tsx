"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Check } from "lucide-react";
import type { Bootstrap, Marshal, Site } from "@/lib/types";
import { siteArrival, siteClock } from "@/lib/site-time";
import {
  readCapture,
  removeCapture,
  storeCapture,
  submitCapture,
  type CaptureDraft,
} from "@/lib/client/simple-drafts";

const order = [
  "Type 1",
  "6F5",
  "G1",
  "Sand",
  "10mm Shingle",
  "10mm shingles",
  "20mm Shingle",
  "20mm shingles",
];
export function SimpleForm({
  data,
  site,
  marshal,
  onSaved,
  onViewRecords,
}: {
  data: Bootstrap;
  site: Site;
  marshal: Marshal;
  onSaved: () => Promise<void>;
  onViewRecords: () => void;
}) {
  const [material, setMaterial] = useState("");
  const [supplier, setSupplier] = useState("");
  const [clock, setClock] = useState(() =>
    siteClock(new Date(), site.timezone),
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState<CaptureDraft | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const key = `${data.actor.company_id}:${data.actor.id}:${site.id}:${marshal.id}`;
  useEffect(() => {
    let live = true;
    void readCapture(key)
      .then((saved) => {
        if (!live || !saved) return;
        setPending(saved);
        setMaterial(saved.input.material_id);
        setSupplier(saved.input.supplier_name);
        setPhoto(saved.photo);
        setClock(siteClock(new Date(saved.input.arrival_at), site.timezone));
        setNotice(
          "An unfinished delivery is ready to retry. Click Save Delivery to complete it.",
        );
      })
      .catch(() => {
        if (live)
          setError(
            "Device storage is unavailable. Enable browser storage before saving.",
          );
      })
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, [key, site.timezone]);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const choosePhoto = (file: File | undefined, element: HTMLInputElement) => {
    setError("");
    setNotice("");
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size === 0 ||
      file.size > 3 * 1024 * 1024
    ) {
      element.value = "";
      setPhoto(null);
      setError(
        "Choose a JPEG, PNG or WebP image up to 3 MiB. If your phone uses HEIC, choose a JPEG image.",
      );
      return;
    }
    setPhoto(file);
  };
  async function save() {
    if (active.current || restoring) return;
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!material || !supplier.trim() || !photo)
        throw new Error(
          "Choose a material, enter the supplier/company name and add a delivery image.",
        );
      if (!pending) {
        const bytes = new Uint8Array(await photo.slice(0, 16).arrayBuffer());
        const png =
          [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) &&
          photo.size > 8;
        const jpeg =
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255 &&
          photo.size > 3;
        const webp =
          String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" &&
          photo.size > 12;
        if (!(
          (photo.type === "image/png" && png) ||
          (photo.type === "image/jpeg" && jpeg) ||
          (photo.type === "image/webp" && webp)
        ))
          throw new Error(
            "The selected file is not a valid JPEG, PNG or WebP image. Choose another image.",
          );
        // Reject correctable input before freezing an idempotent upload attempt.
        const arrival = siteArrival(clock.date, clock.time, site.timezone);
        if (Date.parse(arrival) > Date.now() + 300000)
          throw new Error(
            "Delivery time cannot be in the future. Check the site time.",
          );
      }
      const draft = pending || {
        key,
        photo,
        photoId: crypto.randomUUID(),
        input: {
          id: crypto.randomUUID(),
          site_id: site.id,
          material_id: material,
          marshal_id: marshal.id,
          supplier_name: supplier.trim(),
          arrival_at: siteArrival(clock.date, clock.time, site.timezone),
          intent: "draft" as const,
        },
      };
      await storeCapture(draft);
      setPending(draft);
      if (data.mode !== "demo" && !navigator.onLine)
        throw new Error(
          "You’re offline. This delivery is kept on this device and has not been submitted. Reconnect and click Save Delivery.",
        );
      await submitCapture(draft);
      // A lost cleanup or response is safe: this same ID is retried, never another arrival.
      await removeCapture(key);
      setPending(null);
      setMaterial("");
      setSupplier("");
      setPhoto(null);
      setClock(siteClock(new Date(), site.timezone));
      if (upload.current) upload.current.value = "";
      if (camera.current) camera.current.value = "";
      setNotice(
        data.mode === "demo"
          ? "Delivery saved in this browser. Ready for the next delivery."
          : "Delivery saved. Ready for the next delivery.",
      );
      await onSaved();
    } catch (e) {
      setError(
        `${(e as Error).message} Your entries are kept here; retry Save Delivery when ready.`,
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="simple-panel simple-entry"
      aria-labelledby="entry-heading"
    >
      <div className="simple-panel-title">
        <div>
          <h2 id="entry-heading">New Delivery</h2>
          <p>
            Recording for <strong>{marshal.name}</strong>
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || !!pending || restoring}>
          <label>
            Material name
            <select
              required
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              <option value="">Select material</option>
              {data.materials
                .filter((m) => m.active)
                .sort(
                  (a, b) =>
                    (order.indexOf(a.name) < 0 ? 99 : order.indexOf(a.name)) -
                    (order.indexOf(b.name) < 0 ? 99 : order.indexOf(b.name)),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Supplier / Company name
            <input
              required
              maxLength={200}
              autoComplete="off"
              placeholder="Enter company name"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              list="known-suppliers"
            />
            <datalist id="known-suppliers">
              {data.suppliers
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
            </datalist>
          </label>
          <label>
            Delivery time
            <input
              required
              type="time"
              value={clock.time}
              onChange={(e) =>
                setClock((c) => ({ ...c, time: e.target.value }))
              }
            />
            <small>
              Site time · {site.timezone} · {clock.date}
            </small>
          </label>
          <div className="simple-upload">
            <label htmlFor="delivery-image">Delivery image</label>
            <div className="simple-image-controls">
              <button
                type="button"
                className="secondary"
                onClick={() => camera.current?.click()}
              >
                <Camera size={21} />
                Take photo
              </button>
              <label
                className="secondary simple-upload-button"
                htmlFor="delivery-image"
              >
                <Upload size={20} />
                Upload image
              </label>
              <input
                id="delivery-image"
                className="simple-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={upload}
                onChange={(e) => choosePhoto(e.target.files?.[0], e.target)}
              />
              <input
                className="simple-file-input"
                aria-label="Camera image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                ref={camera}
                onChange={(e) => choosePhoto(e.target.files?.[0], e.target)}
              />
            </div>
            <small>Required · JPEG, PNG or WebP · up to 3 MiB</small>
            {preview && (
              <div className="simple-image-preview">
                <img src={preview} alt="Selected delivery image" />
                <span>{photo?.name}</span>
              </div>
            )}
          </div>
        </fieldset>
        {pending && !busy && (
          <p className="simple-help">
            This delivery is kept for retry. Its details stay fixed so it cannot
            be saved twice.
          </p>
        )}
        {error && (
          <p className="simple-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="simple-success" role="status">
            <Check size={19} />
            {notice}
          </p>
        )}
        <button
          type="submit"
          className="primary simple-save"
          disabled={busy || restoring}
        >
          {busy ? "Saving delivery…" : "Save Delivery"}
        </button>
        <button
          type="button"
          className="secondary simple-view-records"
          disabled={busy}
          onClick={onViewRecords}
        >
          View Records
        </button>
        <p className="simple-help">
          The date, selected marshal and submission time are recorded
          automatically. A photo does not confirm physical receipt.
        </p>
      </form>
    </section>
  );
}
