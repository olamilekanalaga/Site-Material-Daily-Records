import type { Delivery } from "./types";
import { siteClock } from "./site-time";

export type DateRange = { from: string; to: string };
export type PeriodPreset = "all" | "today" | "3days" | "7days" | "month";

/** Calendar-day offsets keep presets stable across the site's clock changes. */
function offsetDate(date: string, days: number) {
  const calendar = new Date(`${date}T12:00:00Z`);
  calendar.setUTCDate(calendar.getUTCDate() + days);
  return calendar.toISOString().slice(0, 10);
}

export function periodRange(
  preset: PeriodPreset,
  timezone: string,
  reference = new Date(),
): DateRange {
  if (preset === "all") return { from: "", to: "" };
  const today = siteClock(reference, timezone).date;
  const from =
    preset === "3days"
      ? offsetDate(today, -2)
      : preset === "7days"
        ? offsetDate(today, -6)
        : preset === "month"
          ? `${today.slice(0, 7)}-01`
          : today;
  return { from, to: today };
}

function uniqueDeliveries(deliveries: Delivery[]) {
  const latest = new Map<string, Delivery>();
  for (const delivery of deliveries) {
    const previous = latest.get(delivery.id);
    if (
      !previous ||
      delivery.version > previous.version ||
      (delivery.version === previous.version &&
        Date.parse(delivery.updated_at) > Date.parse(previous.updated_at))
    )
      latest.set(delivery.id, delivery);
  }
  return [...latest.values()];
}

/** Both endpoints include the whole arrival day in the selected site's timezone. */
export function periodDeliveries(
  deliveries: Delivery[],
  siteId: string,
  timezone: string,
  range: DateRange,
): Delivery[] {
  if (range.from && range.to && range.from > range.to) return [];
  return uniqueDeliveries(deliveries)
    .filter((delivery) => {
      if (
        delivery.site_id !== siteId ||
        !delivery.submitted_at ||
        delivery.status === "Draft"
      )
        return false;
      const arrival = new Date(delivery.arrival_at);
      if (!Number.isFinite(arrival.getTime())) return false;
      const date = siteClock(arrival, timezone).date;
      return (
        (!range.from || date >= range.from) && (!range.to || date <= range.to)
      );
    })
    .sort(
      (a, b) =>
        Date.parse(b.arrival_at) - Date.parse(a.arrival_at) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    );
}

/** A count is an arrival, independent of ticket quantity or quantity unit. */
export function arrivalCounts(records: Delivery[]) {
  const byMaterial = new Map<string, number>();
  const arrivals = uniqueDeliveries(records).filter(
    (delivery) => delivery.submitted_at && delivery.status !== "Draft",
  );
  for (const delivery of arrivals)
    byMaterial.set(
      delivery.material_id,
      (byMaterial.get(delivery.material_id) || 0) + 1,
    );
  return { total: arrivals.length, byMaterial };
}
