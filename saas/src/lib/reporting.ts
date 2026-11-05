import type { Delivery } from "./types";
export function summarise(deliveries: Delivery[]) {
  const arrivals = deliveries.filter((d) => d.submitted_at !== null);
  const pending = arrivals.filter((d) =>
    ["Submitted", "Under Review", "Correction Requested", "Flagged"].includes(
      d.status,
    ),
  );
  const quantities: Record<string, number> = {};
  for (const d of arrivals)
    if (
      d.status === "Accepted" &&
      d.accepted_quantity !== null &&
      d.accepted_unit
    )
      quantities[d.accepted_unit] =
        (quantities[d.accepted_unit] || 0) + d.accepted_quantity;
  return {
    arrivals: arrivals.length,
    accepted: arrivals.filter((d) => d.status === "Accepted").length,
    rejected: arrivals.filter((d) => d.status === "Rejected").length,
    flagged: arrivals.filter((d) => d.status === "Flagged").length,
    pending: pending.length,
    quantities,
  };
}
export const quantity = (value: number | null, unit: string | null) =>
  value === null
    ? "Not recorded"
    : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(value)} ${unit ?? ""}`;
export function localDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
