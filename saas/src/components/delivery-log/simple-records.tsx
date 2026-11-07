"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, ImageIcon, X } from "lucide-react";
import type { Bootstrap, CatalogueItem, Delivery, Evidence } from "@/lib/types";
import { siteClock } from "@/lib/site-time";
import {
  CATEGORIES,
  ENTRY_TYPES,
  PENDING_CATEGORY,
  PENDING_ENTRY_TYPE,
  QUICK_ITEMS,
  itemDetails,
} from "@/lib/catalogue";
import { downloadReport } from "@/lib/client/offline";
import { ClassificationReview } from "./classification-review";
import styles from "./smart-records.module.css";
import {
  arrivalCounts,
  periodDeliveries,
  type DateRange,
} from "@/lib/delivery-records";

export function Photo({
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
export function PhotoDialog({
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
type BreakdownRow = { id: string; name: string; total: number };

function MarshalPortrait({ name, sample }: { name: string; sample: boolean }) {
  const portrait = sample
    ? {
        "Bemigho Estano": "/marshals/bemigho-estano.jpg",
        "Olamilekan Alaga": "/marshals/olamilekan-alaga.jpg",
      }[name]
    : undefined;

  return (
    <Image
      className={styles.marshalPortrait}
      src={portrait || "/marshal-placeholder.svg"}
      alt={name}
      title={name}
      width={40}
      height={40}
      sizes="40px"
      style={
        portrait
          ? name === "Bemigho Estano"
            ? { objectFit: "contain", backgroundColor: "#0b0b0b" }
            : { objectPosition: "50% 42%" }
          : undefined
      }
    />
  );
}

function sortBreakdown(rows: BreakdownRow[]) {
  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function countNames(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return sortBreakdown(
    [...counts].map(([name, total]) => ({ id: name, name, total })),
  );
}

function countItems(records: Delivery[], materials: CatalogueItem[]) {
  const names = new Map(materials.map((item) => [item.id, item.name]));
  const counts = new Map<string, BreakdownRow>();
  for (const record of records) {
    const previous = counts.get(record.material_id);
    counts.set(record.material_id, {
      id: record.material_id,
      name:
        names.get(record.material_id) ?? itemDetails(record, materials).name,
      total: (previous?.total || 0) + 1,
    });
  }
  return sortBreakdown([...counts.values()]);
}

function Breakdown({
  title,
  rows,
  name,
}: {
  title: string;
  rows: BreakdownRow[];
  name: string;
}) {
  return (
    <section className={styles.breakdownBlock}>
      <h3>{title}</h3>
      {rows.length ? (
        <table className={styles.breakdownTable} aria-label={title}>
          <thead>
            <tr>
              <th scope="col">{name}</th>
              <th scope="col">Arrivals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, name, total }) => (
              <tr key={id}>
                <td>{name}</td>
                <td>{total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="simple-help">No arrivals in this period.</p>
      )}
    </section>
  );
}

export function SimpleRecords({
  data,
  siteId,
  onRefresh,
}: {
  data: Bootstrap;
  siteId: string;
  onRefresh?: () => Promise<unknown>;
}) {
  const timezone =
    data.sites.find((s) => s.id === siteId)?.timezone || "Europe/London";
  const [today, setToday] = useState(
    () => siteClock(new Date(), timezone).date,
  );
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  useEffect(() => {
    const refreshDay = () => setToday(siteClock(new Date(), timezone).date);
    refreshDay();
    const timer = window.setInterval(refreshDay, 15_000);
    const resume = () => {
      if (document.visibilityState === "visible") refreshDay();
    };
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDay);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [timezone]);
  const range = customRange || { from: today, to: today };
  const [material, setMaterial] = useState("");
  const [category, setCategory] = useState("");
  const [entryType, setEntryType] = useState("");
  const [marshal, setMarshal] = useState("");
  const [classification, setClassification] = useState("");
  const [viewing, setViewing] = useState<Delivery | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const invalidRange = Boolean(range.from && range.to && range.from > range.to);
  const periodRecords = periodDeliveries(
    data.deliveries,
    siteId,
    timezone,
    range,
  );
  const counts = arrivalCounts(periodRecords);
  const detailed = periodRecords.map((record) => ({
    record,
    item: itemDetails(record, data.materials),
  }));
  const records = detailed.filter(
    ({ record, item }) =>
      (!material || record.material_id === material) &&
      (!category || item.category === category) &&
      (!entryType || item.entry_type === entryType) &&
      (!marshal || (record.marshal_id || record.created_by) === marshal) &&
      (!classification || item.approval_status === classification),
  );
  const deliveries = detailed.filter(
    ({ item }) => item.entry_type === "Delivery",
  ).length;
  const services = detailed.filter(
    ({ item }) => item.entry_type === "Service visit",
  ).length;
  const pending = detailed.filter(
    ({ item }) => item.approval_status === "Pending",
  ).length;
  const summaryMaterials = data.materials.filter(
    (item) =>
      counts.byMaterial.has(item.id) ||
      QUICK_ITEMS.some((name) => name === item.name),
  );
  const marshals = new Map<string, string>();
  for (const item of data.marshals || [])
    if (item.site_id === siteId) marshals.set(item.id, item.name);
  for (const record of periodRecords)
    marshals.set(
      record.marshal_id || record.created_by,
      record.marshal_name || record.creator_name,
    );
  const reviewer = ["supervisor", "site_manager", "company_admin"].includes(
    data.actor.role,
  );
  const extraFilterCount = [
    category,
    entryType,
    marshal,
    classification,
  ].filter(Boolean).length;
  const categoryRows = countNames(detailed.map(({ item }) => item.category));
  const serviceRows = countItems(
    detailed
      .filter(({ item }) => item.entry_type === "Service visit")
      .map(({ record }) => record),
    data.materials,
  );
  const frequentRows = countItems(periodRecords, data.materials).slice(0, 5);
  const marshalRows = countNames(
    periodRecords.map((record) => record.marshal_name || record.creator_name),
  );

  function selectSummary(
    next: {
      material?: string;
      entryType?: string;
      classification?: string;
    } = {},
  ) {
    setMaterial(next.material || "");
    setCategory("");
    setEntryType(next.entryType || "");
    setMarshal("");
    setClassification(next.classification || "");
  }

  async function exportRows() {
    if (exporting || invalidRange) return;
    setExporting(true);
    setExportError("");
    const params = new URLSearchParams({
      format: "csv",
      view: "arrivals",
      site_id: siteId,
    });
    for (const [key, value] of Object.entries({
      from: range.from,
      to: range.to,
      material_id: material,
      category,
      entry_type: entryType,
      marshal_id: marshal,
      classification,
    })) {
      if (value) params.set(key, value);
    }
    try {
      await downloadReport(`/api/reports?${params}`);
    } catch (problem) {
      setExportError(
        problem instanceof Error
          ? problem.message
          : "The report could not be exported. Try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="simple-panel simple-records-panel">
      <p className={styles.periodNote}>
        {customRange ? "Custom date range" : "Today · updates automatically"}
        {" · "}Site time: {timezone}
      </p>
      <div className="simple-filters">
        <label className="simple-date-filter">
          From date
          <input
            type="date"
            value={range.from}
            max={range.to || undefined}
            aria-invalid={invalidRange}
            onChange={(event) =>
              setCustomRange((previous) => ({
                ...(previous || { from: today, to: today }),
                from: event.target.value,
              }))
            }
          />
        </label>
        <label className="simple-date-filter">
          To date
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            aria-invalid={invalidRange}
            onChange={(event) =>
              setCustomRange((previous) => ({
                ...(previous || { from: today, to: today }),
                to: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Item
          <select
            value={material}
            onChange={(event) => setMaterial(event.target.value)}
          >
            <option value="">All items</option>
            {data.materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary simple-clear-filters"
          onClick={() => {
            setToday(siteClock(new Date(), timezone).date);
            setCustomRange(null);
            selectSummary();
            setExportError("");
          }}
        >
          Clear filters
        </button>
      </div>
      <details className={styles.moreFilters}>
        <summary>
          More filters{extraFilterCount ? ` · ${extraFilterCount} active` : ""}
        </summary>
        <div className={styles.filterGrid}>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {[...CATEGORIES, PENDING_CATEGORY].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entry type
            <select
              value={entryType}
              onChange={(event) => setEntryType(event.target.value)}
            >
              <option value="">All entry types</option>
              {[...ENTRY_TYPES, PENDING_ENTRY_TYPE].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recorded by
            <select
              value={marshal}
              onChange={(event) => setMarshal(event.target.value)}
            >
              <option value="">All traffic marshals</option>
              {[...marshals.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Classification
            <select
              value={classification}
              onChange={(event) => setClassification(event.target.value)}
            >
              <option value="">All classifications</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending classification</option>
            </select>
          </label>
        </div>
      </details>
      {invalidRange && (
        <p className="simple-range-error" role="alert">
          Choose a To date on or after the From date.
        </p>
      )}
      <div className="simple-summary-heading">
        <div>
          <h2>Arrival totals</h2>
          <p>
            Recorded arrivals in selected dates. Select a card to filter the
            table.
          </p>
        </div>
        <span>
          <ArrowLeftRight size={16} aria-hidden="true" /> More items
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
          aria-pressed={
            !material && !category && !entryType && !marshal && !classification
          }
          aria-label={`Total arrivals: ${counts.total}`}
          onClick={() => selectSummary()}
        >
          <span>Total arrivals</span>
          <strong>{counts.total.toLocaleString("en-GB")}</strong>
          <small>recorded arrivals</small>
        </button>
        <button
          type="button"
          className="simple-summary-card"
          aria-pressed={entryType === "Delivery"}
          aria-label={`Material deliveries: ${deliveries}`}
          onClick={() => selectSummary({ entryType: "Delivery" })}
        >
          <span>Material deliveries</span>
          <strong>{deliveries.toLocaleString("en-GB")}</strong>
          <small>delivery arrivals</small>
        </button>
        <button
          type="button"
          className="simple-summary-card"
          aria-pressed={entryType === "Service visit"}
          aria-label={`Service visits: ${services}`}
          onClick={() => selectSummary({ entryType: "Service visit" })}
        >
          <span>Service visits</span>
          <strong>{services.toLocaleString("en-GB")}</strong>
          <small>service arrivals</small>
        </button>
        <button
          type="button"
          className="simple-summary-card"
          aria-pressed={classification === "Pending"}
          aria-label={`Pending classifications: ${pending}`}
          onClick={() => selectSummary({ classification: "Pending" })}
        >
          <span>Pending classifications</span>
          <strong>{pending.toLocaleString("en-GB")}</strong>
          <small>arrivals to classify</small>
        </button>
        {summaryMaterials.map((item) => {
          const count = counts.byMaterial.get(item.id) || 0;
          return (
            <button
              key={item.id}
              type="button"
              className="simple-summary-card"
              aria-pressed={material === item.id}
              aria-label={`${item.name}: ${count} arrivals`}
              onClick={() => selectSummary({ material: item.id })}
            >
              <span>{item.name}</span>
              <strong>{count.toLocaleString("en-GB")}</strong>
              <small>arrivals</small>
            </button>
          );
        })}
      </div>
      {reviewer && (
        <details className={styles.breakdown}>
          <summary>Arrival breakdown</summary>
          <div className={styles.breakdownGrid}>
            <Breakdown
              title="Arrivals by category"
              name="Category"
              rows={categoryRows}
            />
            <Breakdown
              title="Service visits by type"
              name="Service"
              rows={serviceRows}
            />
            <Breakdown
              title="Most frequent items"
              name="Item"
              rows={frequentRows}
            />
            <Breakdown
              title="Records by traffic marshal"
              name="Traffic marshal"
              rows={marshalRows}
            />
          </div>
        </details>
      )}
      {reviewer && data.mode === "demo" && (
        <ClassificationReview
          materials={data.materials}
          records={periodRecords}
          onRefresh={onRefresh}
        />
      )}
      {reviewer && data.mode === "demo" && (
        <div className={styles.exportBar}>
          <span>Export the rows shown below.</span>
          <button
            type="button"
            className="secondary"
            onClick={() => void exportRows()}
            disabled={exporting || invalidRange}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      )}
      {exportError && (
        <p className="simple-error" role="alert">
          {exportError}
        </p>
      )}
      <p className="simple-table-hint">
        <ArrowLeftRight size={16} aria-hidden="true" /> Swipe sideways to see
        all columns, including evidence.
      </p>
      <div
        className="simple-table-scroll"
        role="region"
        tabIndex={0}
        aria-label="Scrollable delivery records"
      >
        <table
          className={`simple-table ${styles.recordTable}`}
          aria-label="Saved delivery records"
        >
          <thead>
            <tr>
              <th scope="col" className={styles.marshalCell}>
                Traffic marshal
              </th>
              <th scope="col">Item</th>
              <th scope="col">Category</th>
              <th scope="col">Logistics company</th>
              <th scope="col">Photo</th>
            </tr>
          </thead>
          <tbody>
            {records.map(({ record, item }) => {
              return (
                <tr key={record.id}>
                  <td className={styles.marshalCell}>
                    <MarshalPortrait
                      name={record.marshal_name || record.creator_name}
                      sample={data.mode === "demo" || data.mode === "local"}
                    />
                  </td>
                  <td className={styles.itemName}>{item.name}</td>
                  <td
                    className={
                      item.approval_status === "Pending"
                        ? styles.pendingText
                        : undefined
                    }
                  >
                    {item.category}
                  </td>
                  <td>
                    {record.supplier_name ||
                      data.suppliers.find(
                        (supplier) => supplier.id === record.supplier_id,
                      )?.name ||
                      "Not recorded"}
                  </td>
                  <td>
                    {record.evidence.length ? (
                      <button
                        className="simple-photo-button"
                        onClick={() => setViewing(record)}
                      >
                        <Photo
                          evidence={record.evidence[0]}
                          demo={data.mode === "demo"}
                          thumbnail
                        />
                        <span>
                          <ImageIcon size={16} /> View photo
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
        Showing {records.length} of {counts.total} recorded arrivals · Site
        time: {timezone}
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
