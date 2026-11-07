"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Upload, Check } from "lucide-react";
import type { Bootstrap, Marshal, Site } from "@/lib/types";
import { siteArrival, siteClock } from "@/lib/site-time";
import {
  CATEGORIES,
  findExactCatalogueItem,
  normaliseItemName,
  PENDING_CATEGORY,
  searchCatalogue,
} from "@/lib/catalogue";
import { ItemSelector } from "./item-selector";
import styles from "./smart-entry.module.css";
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
  const demo = data.mode === "demo";
  const [material, setMaterial] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState("");
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
        setCustom(Boolean(saved.input.custom_item_name));
        setCustomName(saved.input.custom_item_name || "");
        setCategoryFilter(saved.input.selected_category || "");
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
  const usage = useMemo(() => {
    const result: Record<string, number> = {};
    for (const delivery of data.deliveries) {
      if (delivery.submitted_at && delivery.status !== "Draft")
        result[delivery.material_id] = (result[delivery.material_id] || 0) + 1;
    }
    return result;
  }, [data.deliveries]);
  const selectedItem = custom
    ? findExactCatalogueItem(data.materials, customName)
    : data.materials.find((item) => item.id === material);
  const hasItem = Boolean(material || (custom && customName.trim()));
  // Known names keep their established classification. For a new item the
  // marshal explicitly chooses one of the three groups before entering its name.
  // Older prepared drafts can still retry without inventing a missing category.
  const chosenCategory =
    pending?.input.selected_category ||
    (hasItem && selectedItem?.approval_status === "Approved"
      ? selectedItem.category || categoryFilter
      : categoryFilter ||
        selectedItem?.category ||
        (pending ? PENDING_CATEGORY : ""));
  const availableItems = searchCatalogue(data.materials, "", usage).filter(
    (item) => !item.capture_hidden && item.category === chosenCategory,
  );

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
    const recordedAt = pending?.input.recorded_at || new Date().toISOString();
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        (!material && !(demo && custom && customName.trim())) ||
        (!demo && !supplier.trim()) ||
        !photo
      )
        throw new Error(
          demo
            ? "Choose an item or enter a new item name, and add a ticket or delivery image."
            : "Choose a material, enter the supplier/company name and add a delivery image.",
        );
      if (!pending) {
        if (demo && !CATEGORIES.some((name) => name === chosenCategory))
          throw new Error("Choose a category before saving the arrival.");
        if (demo && custom && !normaliseItemName(customName).length)
          throw new Error("Enter an item name containing letters or numbers.");
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
        const arrival = demo
          ? recordedAt
          : siteArrival(clock.date, clock.time, site.timezone);
        if (Date.parse(arrival) > Date.now() + 300000)
          throw new Error(
            "Delivery time cannot be in the future. Check the site time.",
          );
      }
      // A retry retains this save attempt's identity and original timestamp.
      const draft: CaptureDraft = pending || {
        key,
        photo,
        photoId: crypto.randomUUID(),
        input: {
          id: crypto.randomUUID(),
          site_id: site.id,
          material_id: material,
          marshal_id: marshal.id,
          supplier_name: supplier.trim(),
          arrival_at: demo
            ? recordedAt
            : siteArrival(clock.date, clock.time, site.timezone),
          ...(demo
            ? {
                capture_kind: "arrival" as const,
                recorded_at: recordedAt,
                selected_category: chosenCategory,
                ...(custom ? { custom_item_name: customName } : {}),
              }
            : {}),
          intent: "draft" as const,
        },
      };
      await storeCapture(draft);
      setPending(draft);
      if (data.mode !== "demo" && !navigator.onLine)
        throw new Error(
          "You’re offline. This delivery is kept on this device and has not been submitted. Reconnect and click Save Delivery.",
        );
      const saved = await submitCapture(draft);
      // A lost cleanup or response is safe: this same ID is retried, never another arrival.
      await removeCapture(key);
      setPending(null);
      if (!demo) setMaterial("");
      setSupplier("");
      setPhoto(null);
      setClock(siteClock(new Date(), site.timezone));
      if (upload.current) upload.current.value = "";
      if (camera.current) camera.current.value = "";
      setNotice(
        demo
          ? `Delivery saved in this browser. Recorded at ${siteClock(new Date(saved.recorded_at || saved.arrival_at), "Europe/London").time}. Ready for the next arrival.`
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
          {demo ? (
            <>
              <label>
                Category
                <select
                  required
                  value={chosenCategory}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCategoryFilter(next);
                    setMaterial("");
                    setCustom(false);
                    setCustomName("");
                    setError("");
                    setNotice("");
                  }}
                >
                  <option value="">Choose a category</option>
                  {CATEGORIES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  {pending && chosenCategory === PENDING_CATEGORY && (
                    <option value={PENDING_CATEGORY}>
                      Unclassified saved draft
                    </option>
                  )}
                </select>
              </label>
              <ItemSelector
                key={categoryFilter}
                items={availableItems}
                value={material}
                selectedLabel={selectedItem?.name}
                custom={custom}
                customName={customName}
                usage={usage}
                disabled={!chosenCategory || busy || !!pending || restoring}
                placeholder={
                  !chosenCategory ? "Choose a category first" : "Choose an item"
                }
                onSelect={setMaterial}
                onCustom={(next) => {
                  setCustom(next);
                  if (next) {
                    setCategoryFilter(chosenCategory);
                    setCustomName("");
                  }
                }}
                onCustomName={setCustomName}
              />
              {hasItem && selectedItem?.approval_status !== "Approved" && (
                <p className={styles.pending}>
                  This arrival can be saved now. A supervisor can review the new
                  item.
                </p>
              )}
            </>
          ) : (
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
          )}
          <label>
            Supplier / Company name
            <input
              required={!demo}
              maxLength={200}
              autoComplete="off"
              placeholder={demo ? "If known" : "Enter company name"}
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
          {demo ? (
            <div className={styles.automaticTime}>
              <strong>Recorded at</strong>
              The current date and time are captured when you save ·
              Europe/London
            </div>
          ) : (
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
          )}
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
            <small>
              Required · Ticket or delivery image · JPEG, PNG or WebP · up to 3
              MiB
            </small>
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
