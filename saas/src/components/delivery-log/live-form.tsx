"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Upload } from "lucide-react";
import type { Bootstrap, Marshal, Site } from "@/lib/types";
import {
  CATEGORIES,
  findExactCatalogueItem,
  normaliseItemName,
  PENDING_CATEGORY,
  PENDING_ENTRY_TYPE,
} from "@/lib/catalogue";
import {
  readCapture,
  removeCapture,
  storeCapture,
  submitCapture,
  type CaptureDraft,
} from "@/lib/client/simple-drafts";
import { ItemSelector } from "./item-selector";
import { SupplierSelector } from "./supplier-selector";
import { siteArrival, siteClock } from "@/lib/site-time";
import styles from "./live-delivery.module.css";

const deliveryPhotoLimit = 500_000;

async function prepareDeliveryPhoto(photo: File) {
  const bytes = new Uint8Array(await photo.slice(0, 16).arrayBuffer());
  const valid =
    (photo.type === "image/png" &&
      photo.size > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, i) => bytes[i] === byte,
      )) ||
    (photo.type === "image/jpeg" &&
      photo.size > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (photo.type === "image/webp" &&
      photo.size > 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!valid) throw new Error("Choose a valid JPEG, PNG or WebP image.");
  if (photo.size <= deliveryPhotoLimit) return photo;

  const source = URL.createObjectURL(photo);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image processing is unavailable.");
    for (const maxEdge of [1600, 1200, 900, 640]) {
      const scale = Math.min(
        1,
        maxEdge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68]) {
        const compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (
          compressed?.type === "image/jpeg" &&
          compressed.size <= deliveryPhotoLimit
        ) {
          return new File(
            [compressed],
            photo.name.replace(/\.[^.]+$/, "") + ".jpg",
            {
              type: "image/jpeg",
            },
          );
        }
      }
    }
  } catch {
    throw new Error(
      "This photo could not be processed. Choose another JPEG, PNG or WebP image.",
    );
  } finally {
    URL.revokeObjectURL(source);
  }
  throw new Error(
    "This photo could not be reduced to 500 KB. Choose another image.",
  );
}

export function LiveForm({
  data,
  site,
  marshal,
  onSaved,
}: {
  data: Bootstrap;
  site: Site;
  marshal: Marshal;
  onSaved: () => Promise<void>;
}) {
  const [direction, setDirection] = useState<"" | "IN" | "OUT">("");
  const [material, setMaterial] = useState("");
  const [category, setCategory] = useState("");
  const [customMaterial, setCustomMaterial] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [customSupplier, setCustomSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState<CaptureDraft | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const key = `${data.actor.company_id}:${data.actor.id}:${site.id}:${marshal.id}`;

  useEffect(() => {
    let active = true;
    void readCapture(key)
      .then((saved) => {
        if (!active || !saved) return;
        setPending(saved);
        setDirection(saved.input.direction ?? "IN");
        setMaterial(saved.input.material_id);
        setCategory(saved.input.selected_category || "");
        setCustomMaterial(Boolean(saved.input.custom_item_name));
        setMaterialName(saved.input.custom_item_name || "");
        setSupplier(saved.input.supplier_id || "");
        setCustomSupplier(
          Boolean(saved.input.custom_supplier_name) ||
            (!saved.input.supplier_id &&
              Boolean(saved.input.supplier_name?.trim())),
        );
        setSupplierName(
          saved.input.custom_supplier_name || saved.input.supplier_name || "",
        );
        setPhoto(saved.photo);
        if (saved.input.corrected_arrival_at) {
          const actual = siteClock(
            new Date(saved.input.corrected_arrival_at),
            site.timezone,
          );
          setManualDate(actual.date);
          setManualTime(actual.time);
        }
        setNotice(
          "An unfinished delivery is ready to retry. Its original details and image have been kept.",
        );
      })
      .catch(() => {
        if (active)
          setError(
            "Device storage is unavailable. Enable browser storage to prepare a safe delivery upload.",
          );
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
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
    const counts: Record<string, number> = {};
    for (const delivery of data.deliveries)
      if (delivery.submitted_at)
        counts[delivery.material_id] = (counts[delivery.material_id] || 0) + 1;
    return counts;
  }, [data.deliveries]);
  const selectedMaterial = customMaterial
    ? findExactCatalogueItem(data.materials, materialName)
    : data.materials.find((item) => item.id === material);
  const selectedSupplier = data.suppliers.find((item) => item.id === supplier);
  const known = selectedMaterial?.approval_status === "Approved";
  const chosenCategory =
    pending?.input.selected_category ||
    (known ? selectedMaterial.category : category) ||
    "";
  const availableMaterials = data.materials.filter(
    (item) =>
      item.active &&
      !item.capture_hidden &&
      (!chosenCategory ||
        item.category === chosenCategory ||
        item.approval_status === "Pending"),
  );
  const locked = busy || Boolean(pending) || restoring;

  function choosePhoto(file: File | undefined, input: HTMLInputElement) {
    setError("");
    setNotice("");
    if (!file) return;
    if (
      !file.size ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      input.value = "";
      setPhoto(null);
      setError(
        "Choose a JPEG, PNG or WebP image. Convert HEIC images to JPEG first.",
      );
      return;
    }
    setPhoto(file);
  }

  async function save() {
    if (saving.current || restoring) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!pending && !direction) throw new Error("Choose IN or OUT.");
      if ((!material && !(customMaterial && materialName.trim())) || !photo)
        throw new Error("Choose a material and add a delivery image.");
      if (!pending) {
        if (customMaterial && !normaliseItemName(materialName))
          throw new Error(
            "Enter a material name containing letters or numbers.",
          );
        if (customSupplier && !normaliseItemName(supplierName))
          throw new Error(
            "Enter a supplier name containing letters or numbers.",
          );
      }
      const deviceNow = new Date();
      if (!pending && manualDate && !manualTime)
        throw new Error("Enter an actual time or clear the manual date.");
      const manualArrival =
        !pending && manualTime
          ? siteArrival(
              manualDate || siteClock(deviceNow, site.timezone).date,
              manualTime,
              site.timezone,
              deviceNow,
            )
          : null;
      const draft: CaptureDraft = pending || {
        key,
        photo: await prepareDeliveryPhoto(photo),
        photoId: crypto.randomUUID(),
        input: {
          id: crypto.randomUUID(),
          site_id: site.id,
          marshal_id: marshal.id,
          material_id: material,
          supplier_name: customSupplier
            ? supplierName
            : selectedSupplier?.name || "",
          arrival_at: deviceNow.toISOString(),
          ...(manualArrival
            ? {
                corrected_arrival_at: manualArrival,
                correction_reason: "Arrival time entered manually",
              }
            : { device_arrival_at: deviceNow.toISOString() }),
          capture_kind: "arrival",
          direction: direction || undefined,
          ...(customMaterial ? { custom_item_name: materialName } : {}),
          ...(customSupplier
            ? { custom_supplier_name: supplierName }
            : supplier
              ? { supplier_id: supplier }
              : {}),
          ...(chosenCategory ? { selected_category: chosenCategory } : {}),
          intent: "draft",
        },
      };
      await storeCapture(draft);
      setPending(draft);
      setPhoto(draft.photo);
      if (!navigator.onLine)
        throw new Error(
          "You’re offline. This delivery is kept on this device and has not been saved to the database. Reconnect and retry.",
        );
      const saved = await submitCapture(draft);
      if (!saved.submitted_at)
        throw new Error(
          "The delivery is not yet submitted. Retry to finish saving it.",
        );
      await removeCapture(key);
      setPending(null);
      setDirection("");
      // Keep the material ready for the next movement.
      setSupplier("");
      setCustomSupplier(false);
      setSupplierName("");
      setPhoto(null);
      setManualDate("");
      setManualTime("");
      if (upload.current) upload.current.value = "";
      if (camera.current) camera.current.value = "";
      setNotice("Delivery saved to the database. Ready for the next delivery.");
      await onSaved();
    } catch (problem) {
      setError(
        `${problem instanceof Error ? problem.message : "The delivery could not be saved."} Your entries are kept here; retry when ready.`,
      );
    } finally {
      saving.current = false;
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
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked}>
          <label>
            Direction
            <select
              required
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as "" | "IN" | "OUT")
              }
            >
              <option value="">Choose IN or OUT</option>
              <option value="IN">IN — Entering site</option>
              <option value="OUT">OUT — Leaving site</option>
            </select>
          </label>
          <details className={styles.captureTime}>
            <summary>Enter actual time (optional)</summary>
            <p className="simple-help">
              Leave blank to use the current time when saving. Manual times use
              the site time zone ({site.timezone}).
            </p>
            <label>
              Actual date (defaults to today)
              <input
                type="date"
                value={manualDate}
                onChange={(event) => setManualDate(event.target.value)}
              />
            </label>
            <label>
              Actual time
              <input
                type="time"
                value={manualTime}
                onChange={(event) => setManualTime(event.target.value)}
              />
            </label>
          </details>
          <label>
            Category
            <select
              value={chosenCategory}
              onChange={(event) => {
                setCategory(event.target.value);
                setMaterial("");
                setCustomMaterial(false);
                setMaterialName("");
                setError("");
                setNotice("");
              }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <ItemSelector
            key={category}
            items={availableMaterials}
            value={material}
            selectedLabel={selectedMaterial?.name}
            custom={customMaterial}
            customName={materialName}
            usage={usage}
            disabled={locked}
            label="Material"
            searchLabel="Search materials"
            placeholder="Choose a material"
            otherLabel="Other — Enter new material"
            customLabel="New material name"
            customPlaceholder="Enter the material or activity name"
            includePending
            onSelect={setMaterial}
            onCustom={(next) => {
              setCustomMaterial(next);
              if (next) {
                setCategory(chosenCategory);
                setMaterialName("");
              }
            }}
            onCustomName={setMaterialName}
          />
          {(material || (customMaterial && materialName.trim())) && (
            <p
              className={`${styles.classification} ${known ? "" : styles.pending}`}
              aria-label="Automatic classification"
            >
              {known
                ? `${selectedMaterial.category || PENDING_CATEGORY} · ${selectedMaterial.entry_type || PENDING_ENTRY_TYPE}`
                : "Pending classification · Pending review. You can save this delivery now."}
            </p>
          )}
          <SupplierSelector
            suppliers={data.suppliers}
            value={supplier}
            custom={customSupplier}
            name={supplierName}
            disabled={locked}
            onSelect={setSupplier}
            onCustom={(next) => {
              setCustomSupplier(next);
              if (next) setSupplierName("");
            }}
            onName={setSupplierName}
          />
          <div className={styles.clock}>
            <strong>Delivery time</strong>
            The date and time are saved automatically · {site.timezone}
          </div>
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
                onChange={(event) =>
                  choosePhoto(event.target.files?.[0], event.target)
                }
              />
              <input
                className="simple-file-input"
                aria-label="Camera image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                ref={camera}
                onChange={(event) =>
                  choosePhoto(event.target.files?.[0], event.target)
                }
              />
            </div>
            <small>
              Required · JPEG, PNG or WebP · Photos are compressed before upload
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
            Upload pending. This copy is kept on this device for retry; its
            original details stay fixed.
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
        <p className="simple-help">
          A photograph supports the record; it does not independently confirm
          physical receipt.
        </p>
      </form>
    </section>
  );
}
