import { canReadReports } from "@/lib/access";
import { assert, csvCell, dateAt } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
import { route } from "@/lib/server/http";
import { normaliseItemName } from "@/lib/catalogue";
import { siteClock } from "@/lib/site-time";
import {
  matchesMovementView,
  reportMovementViews,
  type ReportMovementView,
} from "@/lib/delivery-records";

function validDate(value: string | null) {
  if (!value) return true;
  const instant = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
}
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async (c) => {
    assert(canReadReports(c.actor.role), "Reporting permission required", 403);
    const boot = await c.bootstrap();
    const p = new URL(request.url).searchParams;
    const date = p.get("date");
    const from = p.get("from"),
      to = p.get("to");
    assert(
      validDate(date) && validDate(from) && validDate(to),
      "Invalid report date",
    );
    assert(
      !from || !to || from <= to,
      "Choose a To date on or after the From date",
    );
    const siteId = p.get("site_id");
    if (siteId)
      assert(
        boot.sites.some((s) => s.id === siteId),
        "Site not authorised",
        403,
      );
    const selectedSupplier = boot.suppliers.find(
      (supplier) => supplier.id === p.get("supplier_id"),
    );
    const direction = p.get("direction");
    const movementView = (p.get("movement_view") ??
      "Overview") as ReportMovementView;
    assert(reportMovementViews.includes(movementView), "Invalid movement view");
    const materialNames = new Map(
      boot.materials.map((item) => [item.id, item.name]),
    );
    assert(
      !direction || direction === "IN" || direction === "OUT",
      "Choose IN or OUT",
    );
    const rows = boot.deliveries.filter(
      (d) =>
        d.submitted_at !== null &&
        matchesMovementView(
          d,
          movementView,
          d.item_name || materialNames.get(d.material_id) || "",
        ) &&
        (!direction || (d.direction ?? "IN") === direction) &&
        (!siteId || d.site_id === siteId) &&
        (!p.get("supplier_id") ||
          d.supplier_id === p.get("supplier_id") ||
          (!d.supplier_id &&
            selectedSupplier &&
            normaliseItemName(d.supplier_name || "") ===
              normaliseItemName(selectedSupplier.name))) &&
        (!p.get("material_id") || d.material_id === p.get("material_id")) &&
        (!date ||
          dateAt(
            d.arrival_at,
            boot.sites.find((s) => s.id === d.site_id)?.timezone || "UTC",
          ) === date) &&
        (!from ||
          dateAt(
            d.arrival_at,
            boot.sites.find((s) => s.id === d.site_id)?.timezone || "UTC",
          ) >= from) &&
        (!to ||
          dateAt(
            d.arrival_at,
            boot.sites.find((s) => s.id === d.site_id)?.timezone || "UTC",
          ) <= to),
    );
    const exportInfo = {
      date: date || null,
      site_id: siteId || null,
      count: rows.length,
      from: from || null,
      to: to || null,
      material_id: p.get("material_id"),
      supplier_id: p.get("supplier_id"),
      view: p.get("view"),
      direction: direction || null,
      movement_view: movementView,
    };
    if (c.client) await remote.reportExport(c.client, exportInfo);
    else local.reportExport(c.actor, exportInfo);
    if (p.get("view") === "arrivals") {
      rows.sort(
        (a, b) =>
          Date.parse(b.arrival_at) - Date.parse(a.arrival_at) ||
          Date.parse(b.recorded_at || b.created_at || b.arrival_at) -
            Date.parse(a.recorded_at || a.created_at || a.arrival_at) ||
          b.id.localeCompare(a.id),
      );
      const header = [
        "Date",
        "Time",
        "Material",
        "Supplier",
        "Marshal",
        "Photo",
        "Delivery ID",
        "Site",
        "Recorded at ISO",
        "Arrival ISO",
        "Category",
        "Entry type",
        "Correction reason",
        "Created by ID",
        "Marshal ID",
        "Direction",
        ...(movementView === "Concrete" ? ["Mix", "Tonnage (t)"] : []),
      ];
      const body = rows.map((delivery) => {
        const site = boot.sites.find((site) => site.id === delivery.site_id);
        const clock = siteClock(
          new Date(delivery.arrival_at),
          site?.timezone || "Europe/London",
        );
        return [
          clock.date,
          clock.time,
          delivery.item_name ||
            boot.materials.find(
              (material) => material.id === delivery.material_id,
            )?.name,
          delivery.supplier_name ||
            boot.suppliers.find(
              (supplier) => supplier.id === delivery.supplier_id,
            )?.name ||
            "",
          delivery.marshal_name || delivery.creator_name,
          delivery.evidence.map((evidence) => evidence.id).join("; "),
          delivery.id,
          site?.name,
          delivery.recorded_at || "",
          delivery.arrival_at,
          delivery.category || "",
          delivery.entry_type || "",
          delivery.correction_reason || "",
          delivery.created_by,
          delivery.marshal_id || "",
          delivery.direction ?? "IN",
          ...(movementView === "Concrete"
            ? [
                delivery.mix ?? "",
                delivery.ticket_unit === "tonnes"
                  ? delivery.ticket_quantity
                  : null,
              ]
            : []),
        ];
      });
      return new Response(
        "\uFEFF" +
          [header, ...body]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="delivery-records.csv"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    const header = [
      "Delivery ID",
      "Site",
      "Arrival (ISO)",
      "Material",
      "Supplier",
      "Vehicle",
      "Ticket",
      "Physical status",
      "Ticket quantity",
      "Ticket unit",
      "Accepted quantity",
      "Accepted unit",
      "Commercial status",
      "Recorder",
      "Notes",
      "Latest reviewer",
      "Latest decision",
      "Latest review reason",
    ];
    const body = rows.map((d) => [
      d.id,
      boot.sites.find((s) => s.id === d.site_id)?.name,
      d.arrival_at,
      boot.materials.find((m) => m.id === d.material_id)?.name,
      boot.suppliers.find((s) => s.id === d.supplier_id)?.name,
      d.vehicle,
      d.ticket_number,
      d.status,
      d.ticket_quantity,
      d.ticket_unit,
      d.accepted_quantity,
      d.accepted_unit,
      d.commercial_status,
      d.creator_name,
      d.notes,
      d.reviews.at(-1)?.reviewer_name,
      d.reviews.at(-1)?.decision,
      d.reviews.at(-1)?.reason,
    ]);
    return new Response(
      "\uFEFF" +
        [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="delivery-report.csv"',
          "Cache-Control": "private, no-store",
        },
      },
    );
  });
}
