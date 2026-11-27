"use client";

import { useEffect, useState } from "react";
import { captureCategoryLabel } from "@/lib/catalogue";
import {
  movementCategory,
  movementViews,
  personalSavedDeliveries,
  type DateRange,
  type MovementView,
} from "@/lib/delivery-records";
import { siteClock } from "@/lib/site-time";
import {
  defaultReceivingCompany,
  receivingCompanies,
  type Bootstrap,
  type Delivery,
  type Site,
} from "@/lib/types";
import { PhotoDialog } from "./delivery-photo";
import styles from "./live-delivery.module.css";

const periods = ["Today", "Custom dates"] as const;
type Period = (typeof periods)[number];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const displayDate = (date: string) =>
  dateFormat.format(new Date(`${date}T00:00:00Z`));

export function MarshalActivity({
  data,
  site,
}: {
  data: Bootstrap;
  site: Site;
}) {
  const [today, setToday] = useState(
    () => siteClock(new Date(), site.timezone).date,
  );
  const [period, setPeriod] = useState<Period>("Today");
  const [company, setCompany] = useState("");
  const [custom, setCustom] = useState<DateRange>({ from: today, to: today });
  const [detail, setDetail] = useState<MovementView | "All" | null>(null);
  const [viewing, setViewing] = useState<Delivery | null>(null);

  useEffect(() => {
    const update = () => setToday(siteClock(new Date(), site.timezone).date);
    update();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [site.timezone]);

  const range = period === "Custom dates" ? custom : { from: today, to: today };
  const valid = Boolean(range.from && range.to && range.from <= range.to);
  const materials = new Map(data.materials.map((item) => [item.id, item]));
  const supplierNames = new Map(
    data.suppliers.map((item) => [item.id, item.name]),
  );
  const rows = valid
    ? personalSavedDeliveries(
        data.deliveries,
        data.actor.id,
        site.id,
        site.timezone,
        range,
      )
        .filter(
          ({ delivery }) =>
            !company ||
            (delivery.receiving_company ?? defaultReceivingCompany) === company,
        )
        .map((row) => {
          const material = materials.get(row.delivery.material_id);
          const name =
            row.delivery.item_name || material?.name || "Historical material";
          return {
            ...row,
            name,
            category: movementCategory(row.delivery, name, material?.category),
          };
        })
    : [];
  const incoming = rows.filter(
    ({ delivery }) => delivery.direction !== "OUT",
  ).length;
  const shown =
    detail === "All" ? rows : rows.filter((row) => row.category === detail);

  return (
    <section
      className={`simple-panel ${styles.activityPanel}`}
      aria-labelledby="marshal-activity"
    >
      <div className={styles.activityControls}>
        <h2 id="marshal-activity">My Activity</h2>
        <label>
          Reporting period
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            {periods.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
        <label>
          Company
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          >
            <option value="">All companies</option>
            {receivingCompanies.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {period === "Custom dates" && (
          <div className={styles.activityDates}>
            <label>
              From date
              <input
                type="date"
                max={custom.to || undefined}
                value={custom.from}
                onChange={(event) =>
                  setCustom({ ...custom, from: event.target.value })
                }
              />
            </label>
            <label>
              To date
              <input
                type="date"
                min={custom.from || undefined}
                value={custom.to}
                onChange={(event) =>
                  setCustom({ ...custom, to: event.target.value })
                }
              />
            </label>
          </div>
        )}
        {valid && (
          <p className="simple-help">
            {site.name} · {displayDate(range.from)}
            {range.to !== range.from && ` – ${displayDate(range.to)}`} ·{" "}
            {site.timezone}
          </p>
        )}
      </div>
      {valid ? (
        <>
          <div className="simple-table-scroll">
            <table
              className={`simple-table ${styles.recordsTable} ${styles.activitySummary}`}
              aria-label="My saved record counts"
            >
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">IN</th>
                  <th scope="col">OUT</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {movementViews.map((category) => {
                  const group = rows.filter((row) => row.category === category);
                  const countIn = group.filter(
                    ({ delivery }) => delivery.direction !== "OUT",
                  ).length;
                  return (
                    <tr key={category}>
                      <th scope="row">
                        <button
                          className={styles.activityLink}
                          type="button"
                          aria-pressed={detail === category}
                          onClick={() =>
                            setDetail(detail === category ? null : category)
                          }
                        >
                          {captureCategoryLabel(category)}
                        </button>
                      </th>
                      <td>{countIn}</td>
                      <td>{group.length - countIn}</td>
                      <td>{group.length}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total saved</th>
                  <td>{incoming}</td>
                  <td>{rows.length - incoming}</td>
                  <td>{rows.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={styles.activityControls} data-scroll-reveal="">
            <button
              className="secondary"
              type="button"
              aria-pressed={detail === "All"}
              onClick={() => setDetail(detail === "All" ? null : "All")}
            >
              {detail === "All"
                ? "Hide my saved records"
                : "View my saved records"}
            </button>
          </div>
          {detail && (
            <section aria-labelledby="marshal-activity-details">
              <h3
                id="marshal-activity-details"
                className={styles.activityDetailHeading}
              >
                {detail === "All"
                  ? "My saved records"
                  : `${captureCategoryLabel(detail)} records`}
              </h3>
              {shown.length ? (
                <div
                  className="simple-table-scroll"
                  role="region"
                  aria-label="Scrollable saved records"
                  tabIndex={0}
                >
                  <table
                    className={`simple-table ${styles.recordsTable}`}
                    aria-label="My saved record details"
                  >
                    <thead>
                      <tr>
                        {[
                          "Saved at",
                          "Direction",
                          "Company",
                          "Item",
                          "Supplier",
                          "Photo",
                        ].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(({ delivery, clock, name }) => (
                        <tr key={delivery.id}>
                          <td>
                            <time dateTime={delivery.submitted_at!}>
                              {displayDate(clock.date)} · {clock.time}
                            </time>
                          </td>
                          <td>
                            <span
                              className={styles.direction}
                              data-direction={delivery.direction ?? "IN"}
                            >
                              {delivery.direction ?? "IN"}
                            </span>
                          </td>
                          <td>
                            {delivery.receiving_company ??
                              defaultReceivingCompany}
                          </td>
                          <td>{name}</td>
                          <td>
                            {delivery.supplier_name ||
                              (delivery.supplier_id &&
                                supplierNames.get(delivery.supplier_id)) ||
                              "Not recorded"}
                          </td>
                          <td>
                            {delivery.evidence.length ? (
                              <button
                                className={styles.activityLink}
                                type="button"
                                onClick={() => setViewing(delivery)}
                              >
                                View photo
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="simple-empty">No records saved in this period.</p>
              )}
            </section>
          )}
        </>
      ) : (
        <p className="simple-range-error" role="alert">
          Choose both dates, with To date on or after From date.
        </p>
      )}
      {viewing && (
        <PhotoDialog delivery={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
