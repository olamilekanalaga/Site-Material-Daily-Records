"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Upload } from "lucide-react";
import {
  defaultReceivingCompany,
  receivingCompanies,
  type Bootstrap,
  type Marshal,
  type ReceivingCompany,
  type Site,
} from "@/lib/types";
import {
  CAPTURE_CATEGORIES,
  captureCategory,
  captureCategoryLabel,
  findExactCatalogueItem,
  normaliseItemName,
} from "@/lib/catalogue";
import {
  matchesMovementView,
  movementCategory,
  recordedSuppliers,
} from "@/lib/delivery-records";
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
  const [receivingCompany, setReceivingCompany] = useState<
    ReceivingCompany | ""
  >("");
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
  const [mix, setMix] = useState("");
  const [tonnage, setTonnage] = useState("");
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
        setReceivingCompany(
          saved.input.receiving_company ?? defaultReceivingCompany,
        );
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
        setMix(saved.input.mix ?? "");
        setTonnage(saved.input.tonnage?.toString() ?? "");
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
    for (const delivery of data.deliveries) {
      if (delivery.site_id !== site.id || !delivery.submitted_at) continue;
      counts[delivery.material_id] = (counts[delivery.material_id] || 0) + 1;
    }
    return counts;
  }, [data.deliveries, site.id]);
  const selectedMaterial = customMaterial
    ? findExactCatalogueItem(data.materials, materialName)
    : data.materials.find((item) => item.id === material);
  const known = selectedMaterial?.approval_status === "Approved";
  const chosenCategory =
    pending?.input.selected_category ||
    category ||
    (known
      ? captureCategory(selectedMaterial.category, selectedMaterial.name)
      : "") ||
    "";
  const categoryDeliveries = useMemo(() => {
    if (!chosenCategory) return [];
    const view = movementCategory({ selected_category: chosenCategory }, "");
    const materials = new Map(data.materials.map((item) => [item.id, item]));
    return data.deliveries.filter((record) => {
      if (
        record.site_id !== site.id ||
        !record.submitted_at ||
        record.status === "Draft"
      )
        return false;
      const item = materials.get(record.material_id);
      return matchesMovementView(
        record,
        view,
        record.item_name || item?.name || "",
        item?.category,
      );
    });
  }, [chosenCategory, data.deliveries, data.materials, site.id]);
  const availableSuppliers = useMemo(
    () =>
      recordedSuppliers(data.suppliers, categoryDeliveries).filter(
        (item) => item.active,
      ),
    [data.suppliers, categoryDeliveries],
  );
  const rememberedItems = useMemo(
    () => new Set(categoryDeliveries.map((record) => record.material_id)),
    [categoryDeliveries],
  );
  const selectedSupplier = availableSuppliers.find(
    (item) => item.id === supplier,
  );
  const concrete = chosenCategory === "Concrete";
  const service = chosenCategory === "Services";
  const hire = chosenCategory === "Hire";
  const itemLabel = hire ? "Hire item" : service ? "Service" : "Material";
  const itemName = itemLabel.toLowerCase();
  const availableMaterials = data.materials.filter(
    (item) =>
      item.active &&
      (rememberedItems.has(item.id) ||
        ((!item.capture_hidden || concrete) &&
          item.approval_status === "Approved" &&
          (!chosenCategory ||
            captureCategory(item.category, item.name) === chosenCategory))),
  );
  const locked = busy || Boolean(pending) || restoring;
  const weight = Number(tonnage);
  const missing = [
    { valid: direction, field: "direction", message: "Choose IN or OUT." },
    { valid: receivingCompany, field: "company", message: "Choose a company." },
    {
      valid: !manualDate || manualTime,
      field: "actual-time",
      message: "Enter an actual time or clear the manual date.",
    },
    { valid: chosenCategory, field: "category", message: "Choose a category." },
    {
      valid: customMaterial ? normaliseItemName(materialName) : material,
      field: customMaterial ? "material-name" : "material",
      message: `Choose a ${itemName} or enter its name.`,
    },
    {
      valid: !concrete || mix.trim(),
      field: "mix",
      message: "Enter the concrete mix.",
    },
    {
      valid:
        !concrete ||
        (weight >= 0.001 &&
          weight <= 1000000000 &&
          Math.abs(weight * 1000 - Math.round(weight * 1000)) < 0.0001),
      field: "tonnage",
      message: "Enter a positive tonnage with up to three decimal places.",
    },
    {
      valid: customSupplier
        ? normaliseItemName(supplierName)
        : selectedSupplier,
      field: customSupplier ? "supplier-name" : "supplier",
      message: service
        ? "Choose a service provider or enter their name."
        : "Choose a supplier or enter a new supplier name.",
    },
    { valid: photo, field: "photo", message: "Add a delivery image." },
  ].find((field) => !field.valid);
  const readyToSave = Boolean(pending) || !missing;

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

  async function save(form: HTMLFormElement) {
    if (saving.current || restoring) return;
    const focusField = (field: string, message: string) => {
      setError(message);
      const control = form.querySelector<HTMLElement>(
        `[data-capture-field="${field}"]`,
      );
      const details = control?.closest("details");
      if (details) details.open = true;
      control?.focus({ preventScroll: true });
      control?.scrollIntoView({ block: "center" });
    };
    if (!pending && missing) {
      setNotice("");
      focusField(missing.field, missing.message);
      return;
    }
    if (!photo) return;
    const deviceNow = new Date();
    let manualArrival = null;
    if (!pending && manualTime) {
      try {
        manualArrival = siteArrival(
          manualDate || siteClock(deviceNow, site.timezone).date,
          manualTime,
          site.timezone,
          deviceNow,
        );
        if (Date.parse(manualArrival) > deviceNow.getTime() + 300000)
          throw new Error("Actual time cannot be in the future.");
      } catch (problem) {
        focusField(
          "actual-time",
          problem instanceof Error
            ? problem.message
            : "Enter a valid actual time.",
        );
        return;
      }
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
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
          ...(receivingCompany ? { receiving_company: receivingCompany } : {}),
          ...(concrete ? { mix: mix.trim(), tonnage: weight } : {}),
          ...(customMaterial ? { custom_item_name: materialName } : {}),
          ...(customSupplier
            ? { custom_supplier_name: supplierName }
            : selectedSupplier
              ? { supplier_id: selectedSupplier.id }
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
      setReceivingCompany("");
      // Keep the material ready for the next movement.
      setSupplier("");
      setCustomSupplier(false);
      setSupplierName("");
      setPhoto(null);
      setMix("");
      setTonnage("");
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
        data-incomplete={Boolean(error && missing && !pending)}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save(event.currentTarget);
        }}
      >
        <fieldset disabled={locked}>
          <label>
            <span>
              Direction
              <span className="simple-required" aria-hidden="true" />
            </span>
            <select
              data-capture-field="direction"
              required
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as "" | "IN" | "OUT")
              }
            >
              <option value="" disabled hidden>
                Choose IN or OUT
              </option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </label>
          <label>
            <span>
              Company
              <span className="simple-required" aria-hidden="true" />
            </span>
            <select
              data-capture-field="company"
              required
              value={receivingCompany}
              onChange={(event) =>
                setReceivingCompany(event.target.value as ReceivingCompany | "")
              }
            >
              <option value="" disabled hidden>
                Choose a company
              </option>
              {receivingCompanies.map((company) => (
                <option key={company}>{company}</option>
              ))}
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
              <span>
                Actual time
                {manualDate && (
                  <span className="simple-required" aria-hidden="true" />
                )}
              </span>
              <input
                data-capture-field="actual-time"
                required={Boolean(manualDate)}
                type="time"
                value={manualTime}
                onChange={(event) => setManualTime(event.target.value)}
              />
            </label>
          </details>
          <label>
            <span>
              Category
              <span className="simple-required" aria-hidden="true" />
            </span>
            <select
              data-capture-field="category"
              required
              value={chosenCategory}
              onChange={(event) => {
                setCategory(event.target.value);
                setMaterial("");
                setCustomMaterial(false);
                setMaterialName("");
                setSupplier("");
                setMix("");
                setTonnage("");
                setError("");
                setNotice("");
              }}
            >
              <option value="">All categories</option>
              {CAPTURE_CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {captureCategoryLabel(name)}
                </option>
              ))}
            </select>
          </label>
          <ItemSelector
            captureField="material"
            key={`material-${category}`}
            items={availableMaterials}
            value={material}
            selectedLabel={selectedMaterial?.name}
            custom={customMaterial}
            customName={materialName}
            usage={usage}
            disabled={locked}
            label={itemLabel}
            searchLabel={`Search ${itemName}s`}
            placeholder={`Choose a ${itemName}`}
            otherLabel={
              hire || service
                ? `Enter a new ${itemName}`
                : "Other — Enter new material"
            }
            customLabel={`New ${itemName} name`}
            customPlaceholder={`Enter the ${itemName} name`}
            plainNames={hire}
            includePending={!hire}
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
          {chosenCategory &&
            (material || (customMaterial && materialName.trim())) && (
              <p
                className={styles.classification}
                aria-label="Automatic classification"
              >
                {captureCategoryLabel(chosenCategory)}
                {!hire &&
                  known &&
                  selectedMaterial.entry_type &&
                  ` · ${selectedMaterial.entry_type}`}
              </p>
            )}
          {concrete && (
            <>
              <label>
                <span>
                  Mix
                  <span className="simple-required" aria-hidden="true" />
                </span>
                <input
                  data-capture-field="mix"
                  required
                  maxLength={100}
                  value={mix}
                  onChange={(event) => setMix(event.target.value)}
                  placeholder="e.g. C25/30"
                />
              </label>
              <label>
                <span>
                  Tonnage (t)
                  <span className="simple-required" aria-hidden="true" />
                </span>
                <input
                  data-capture-field="tonnage"
                  type="number"
                  required
                  min="0.001"
                  max="1000000000"
                  step="0.001"
                  value={tonnage}
                  onChange={(event) => setTonnage(event.target.value)}
                />
              </label>
            </>
          )}
          <SupplierSelector
            key={`supplier-${chosenCategory}`}
            service={service}
            suppliers={availableSuppliers}
            value={selectedSupplier?.id ?? ""}
            selectedLabel={pending?.input.supplier_name}
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
          <div className="simple-upload" data-scroll-reveal="">
            <label htmlFor="delivery-image">
              <span>
                Delivery image
                <span className="simple-required" aria-hidden="true" />
              </span>
            </label>
            <div className="simple-image-controls">
              <button
                type="button"
                data-capture-field="photo"
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
          data-ready={readyToSave}
          disabled={busy || restoring}
        >
          {busy ? "Saving delivery…" : "Save Delivery"}
        </button>
      </form>
    </section>
  );
}
