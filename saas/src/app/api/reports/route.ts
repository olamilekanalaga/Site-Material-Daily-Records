import { assert, csvCell, dateAt } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async (c) => {
    assert(
      [
        "site_manager",
        "company_admin",
        "project_manager",
        "director",
        "commercial",
        "supervisor",
      ].includes(c.actor.role),
      "Reporting permission required",
      403,
    );
    const boot = await c.bootstrap();
    const p = new URL(request.url).searchParams;
    const date = p.get("date");
    assert(!date || /^\d{4}-\d{2}-\d{2}$/.test(date), "Invalid report date");
    const siteId = p.get("site_id");
    if (siteId)
      assert(
        boot.sites.some((s) => s.id === siteId),
        "Site not authorised",
        403,
      );
    const rows = boot.deliveries.filter(
      (d) =>
        d.submitted_at !== null &&
        (!siteId || d.site_id === siteId) &&
        (!p.get("supplier_id") || d.supplier_id === p.get("supplier_id")) &&
        (!p.get("material_id") || d.material_id === p.get("material_id")) &&
        (!date ||
          dateAt(
            d.arrival_at,
            boot.sites.find((s) => s.id === d.site_id)?.timezone || "UTC",
          ) === date),
    );
    const exportInfo = {
      date: date || null,
      site_id: siteId || null,
      count: rows.length,
    };
    if (c.client) await remote.reportExport(c.client, exportInfo);
    else local.reportExport(c.actor, exportInfo);
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
