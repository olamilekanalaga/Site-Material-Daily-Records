"use client";

import { useRef, useState } from "react";
import type { CatalogueItem, Delivery } from "@/lib/types";
import { CATEGORIES, ENTRY_TYPES, itemDetails } from "@/lib/catalogue";
import { request } from "@/lib/client/offline";
import styles from "./smart-records.module.css";

export function ClassificationReview({
  materials,
  records,
  onRefresh,
}: {
  materials: CatalogueItem[];
  records: Delivery[];
  onRefresh?: () => Promise<unknown>;
}) {
  const [choices, setChoices] = useState<
    Record<string, { category: string; entryType: string }>
  >({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const counts = new Map<string, number>();
  for (const record of records) {
    if (itemDetails(record, materials).approval_status === "Pending") {
      counts.set(record.material_id, (counts.get(record.material_id) || 0) + 1);
    }
  }
  const pending = materials.filter((item) => counts.has(item.id));

  async function approve(item: CatalogueItem) {
    if (inFlight.current) return;
    const choice = choices[item.id];
    setError("");
    setNotice("");
    if (!choice?.category || !choice.entryType) {
      setError("Choose a category and entry type before approving an item.");
      return;
    }
    inFlight.current = true;
    setBusy(item.id);
    try {
      await request("/api/demo/catalogue/review", {
        method: "POST",
        body: JSON.stringify({
          item_id: item.id,
          category: choice.category,
          entry_type: choice.entryType,
        }),
      });
      await onRefresh?.();
      setNotice(
        `${item.name} approved. ${onRefresh ? "It is now available for recording." : "Refresh records to load the updated classification."}`,
      );
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The classification could not be approved. Try again.",
      );
    } finally {
      setBusy("");
      inFlight.current = false;
    }
  }

  return (
    <details
      className={styles.review}
      open={pending.length > 0 || Boolean(error) || Boolean(notice)}
    >
      <summary>
        Pending classification{" "}
        <span>
          {pending.length} {pending.length === 1 ? "item" : "items"}
        </span>
      </summary>
      <div className={styles.reviewBody}>
        <p>
          Items used by arrivals in the selected dates. Choose their category
          and entry type; this does not verify physical receipt.
        </p>
        {!pending.length && (
          <p className={styles.emptyReview}>
            No items awaiting classification in this period.
          </p>
        )}
        {pending.map((item) => {
          const choice = choices[item.id] || { category: "", entryType: "" };
          return (
            <form
              key={item.id}
              className={styles.reviewItem}
              aria-label={`Classify ${item.name}`}
              onSubmit={(event) => {
                event.preventDefault();
                void approve(item);
              }}
            >
              <div className={styles.reviewItemName}>
                <strong>{item.name}</strong>
                <span>
                  {counts.get(item.id)}{" "}
                  {counts.get(item.id) === 1 ? "arrival" : "arrivals"}
                </span>
              </div>
              <label>
                Category
                <select
                  required
                  aria-label={`Category for ${item.name}`}
                  value={choice.category}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    setChoices((previous) => ({
                      ...previous,
                      [item.id]: { ...choice, category: event.target.value },
                    }))
                  }
                >
                  <option value="">Choose category</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entry type
                <select
                  required
                  aria-label={`Entry type for ${item.name}`}
                  value={choice.entryType}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    setChoices((previous) => ({
                      ...previous,
                      [item.id]: { ...choice, entryType: event.target.value },
                    }))
                  }
                >
                  <option value="">Choose entry type</option>
                  {ENTRY_TYPES.map((entryType) => (
                    <option key={entryType} value={entryType}>
                      {entryType}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="primary"
                aria-label={`Approve ${item.name}`}
                disabled={Boolean(busy)}
              >
                {busy === item.id ? "Approving…" : "Approve item"}
              </button>
            </form>
          );
        })}
        {error && (
          <p className="simple-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="simple-success" role="status">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
