import type { Delivery, EntryType } from "./types";
import { captureCategory } from "./catalogue";
import { siteClock } from "./site-time";

export type DateRange = { from: string; to: string };
export const movementViews = [
  "Aggregate",
  "Concrete",
  "Material",
  "Service",
] as const;
export type MovementView = (typeof movementViews)[number];
export const recordsViews = ["Overview", ...movementViews] as const;
export type RecordsView = (typeof recordsViews)[number];
export const reportMovementViews = [
  ...recordsViews,
  "Materials",
  "Services",
] as const;
export type ReportMovementView = (typeof reportMovementViews)[number];

type MovementItem = {
  entry_type?: EntryType;
  category?: string;
  selected_category?: string;
};

export function movementCategory(
  item: MovementItem,
  name: string,
): MovementView {
  const category = captureCategory(
    item.selected_category || item.category,
    name,
  );
  if (
    item.entry_type === "Service visit" ||
    (item.entry_type !== "Delivery" && category === "Services")
  )
    return "Service";
  if (category === "Concrete") return "Concrete";
  if (category === "Aggregates / Sands" || category === "Aggregate")
    return "Aggregate";
  return "Material";
}

export function matchesMovementView(
  item: MovementItem,
  view: ReportMovementView,
  name: string,
) {
  if (view === "Overview") return true;
  if (view === "Materials") return item.entry_type === "Delivery";
  if (view === "Services") return item.entry_type === "Service visit";
  return movementCategory(item, name) === view;
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

export function personalSavedDeliveries(
  deliveries: Delivery[],
  actorId: string,
  siteId: string,
  timezone: string,
  range: DateRange,
) {
  return uniqueDeliveries(deliveries)
    .flatMap((delivery) => {
      if (
        delivery.created_by !== actorId ||
        delivery.site_id !== siteId ||
        !delivery.submitted_at ||
        delivery.status === "Draft"
      )
        return [];
      const saved = new Date(delivery.submitted_at);
      if (!Number.isFinite(saved.getTime())) return [];
      const clock = siteClock(saved, timezone);
      return clock.date >= range.from && clock.date <= range.to
        ? [{ delivery, clock, savedAt: saved.getTime() }]
        : [];
    })
    .sort(
      (a, b) =>
        b.savedAt - a.savedAt || a.delivery.id.localeCompare(b.delivery.id),
    );
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
