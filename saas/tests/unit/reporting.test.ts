import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, localDate, quantity } from "../../src/lib/reporting";
import {
  parseDelivery,
  parseReview,
  csvCell,
  sniffImage,
  validateTransition,
} from "../../src/lib/server/core";
import type { Actor, Delivery, DeliveryInput, Site } from "../../src/lib/types";
const base = {
  id: "30000000-0000-4000-8000-000000000001",
  company_id: "c",
  site_id: "s",
  material_id: "m",
  supplier_id: "supplier",
  vehicle: "DEMO",
  ticket_number: "F001",
  ticket_quantity: 20,
  ticket_unit: "tonnes",
  arrival_at: "2026-11-05T07:00:00Z",
  created_by: "gate",
  creator_name: "Demo Gate",
  created_at: "2026-11-05T07:00:00Z",
  updated_at: "2026-11-05T07:00:00Z",
  submitted_at: "2026-11-05T07:00:00Z",
  status: "Submitted",
  commercial_status: "Not Linked",
  notes: "",
  accepted_quantity: null,
  accepted_unit: null,
  version: 1,
  evidence: [],
  reviews: [],
} satisfies Delivery;
test("tallies exclude local/server drafts and retain a submitted correction exactly once", () => {
  const rows = [
    base,
    { ...base, id: "2", status: "Draft", submitted_at: null },
    { ...base, id: "3", status: "Arrived", submitted_at: null },
    { ...base, id: "4", status: "Correction Requested" },
    { ...base, id: "5", status: "Rejected" },
    { ...base, id: "6", status: "Flagged" },
  ] as Delivery[];
  assert.deepEqual(summarise(rows), {
    arrivals: 4,
    accepted: 0,
    rejected: 1,
    flagged: 1,
    pending: 3,
    quantities: {},
  });
});
test("accepted quantities never add ticket values or combine incompatible units", () => {
  const rows = [
    {
      ...base,
      status: "Accepted",
      accepted_quantity: 18,
      accepted_unit: "tonnes",
    },
    {
      ...base,
      id: "2",
      status: "Accepted",
      accepted_quantity: 12,
      accepted_unit: "m³",
    },
    { ...base, id: "3", status: "Rejected", accepted_quantity: null },
    {
      ...base,
      id: "4",
      status: "Accepted",
      accepted_quantity: 2.125,
      accepted_unit: "tonnes",
    },
  ] as Delivery[];
  assert.deepEqual(summarise(rows).quantities, { tonnes: 20.125, "m³": 12 });
  assert.equal(quantity(null, "tonnes"), "Not recorded");
});
test("report date follows site timezone across midnight", () => {
  assert.equal(
    localDate("2026-06-01T23:30:00Z", "Europe/London"),
    "2026-06-02",
  );
  assert.equal(
    localDate("2026-06-01T23:30:00Z", "America/New_York"),
    "2026-06-01",
  );
});
test("review rejects self approval, unit conversion and stale record", () => {
  const site = { id: "s", require_photo: false, require_ticket: true } as Site,
    actor = { id: "supervisor", role: "supervisor", site_ids: ["s"] } as Actor;
  const input = {
    decision: "Accepted",
    reason: "Physical receipt checked",
    accepted_quantity: 18,
    accepted_unit: "tonnes",
    version: 1,
  } as const;
  assert.doesNotThrow(() => validateTransition(actor, base, input, site));
  assert.throws(() =>
    validateTransition({ ...actor, id: "gate" }, base, input, site),
  );
  assert.throws(() =>
    validateTransition(actor, base, { ...input, accepted_unit: "kg" }, site),
  );
  assert.throws(() =>
    validateTransition(actor, base, { ...input, version: 2 }, site),
  );
});
test("server validation rejects invalid decimal quantities and missing decisions", () => {
  const input: DeliveryInput = {
    id: base.id,
    site_id: "20000000-0000-4000-8000-000000000001",
    material_id: "40000000-0000-4000-8000-000000000001",
    supplier_id: null,
    vehicle: " demo ",
    ticket_number: "T",
    ticket_quantity: 2.125,
    ticket_unit: "tonnes",
    arrival_at: "2026-01-01T00:00:00Z",
    notes: "",
    intent: "submit",
  };
  assert.equal(parseDelivery(input).vehicle, "DEMO");
  for (const q of [NaN, -1, 0, Infinity, 1.2345])
    assert.throws(() => parseDelivery({ ...input, ticket_quantity: q }));
  assert.throws(() =>
    parseReview({ decision: "Rejected", reason: "", version: 1 }),
  );
});
test("CSV quotes values and neutralises spreadsheet formula injection", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("normal, material"), '"normal, material"');
  assert.equal(csvCell("@SUM(1)"), '"\'@SUM(1)"');
});
test("image magic must match an allowed image format", () => {
  assert.equal(
    sniffImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])),
    "image/png",
  );
  assert.throws(() =>
    sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")),
  );
});
