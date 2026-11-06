import { test } from "node:test";
import assert from "node:assert/strict";
import type { Delivery } from "../../src/lib/types";
import {
  arrivalCounts,
  periodDeliveries,
} from "../../src/lib/delivery-records";

function delivery(
  id: string,
  arrival: string,
  patch: Partial<Delivery> = {},
): Delivery {
  return {
    id,
    company_id: "company",
    site_id: "site",
    material_id: "6f5",
    supplier_id: null,
    vehicle: "",
    ticket_number: "",
    ticket_quantity: null,
    ticket_unit: "loads",
    arrival_at: arrival,
    created_by: "marshal",
    creator_name: "Bemigho Estano",
    created_at: arrival,
    updated_at: arrival,
    submitted_at: arrival,
    status: "Submitted",
    commercial_status: "Not Linked",
    notes: "",
    accepted_quantity: null,
    accepted_unit: null,
    version: 1,
    evidence: [],
    reviews: [],
    ...patch,
  };
}

test("October date range includes entire site-local endpoint days and excludes drafts and other sites", () => {
  const data = [
    delivery("before", "2026-09-30T22:59:59.999Z"),
    delivery("first", "2026-09-30T23:00:00Z"),
    delivery("last", "2026-10-30T23:59:59.999Z"),
    delivery("after", "2026-10-31T00:00:00Z"),
    delivery("draft", "2026-10-15T10:00:00Z", {
      submitted_at: null,
      status: "Draft",
    }),
    delivery("foreign", "2026-10-15T10:00:00Z", { site_id: "another-site" }),
  ];
  const before = structuredClone(data);
  const result = periodDeliveries(data, "site", "Europe/London", {
    from: "2026-10-01",
    to: "2026-10-30",
  });
  assert.deepEqual(
    result.map((item) => item.id),
    ["last", "first"],
  );
  assert.deepEqual(data, before, "Filtering must not mutate saved records");
});

test("open ranges include future arrivals when in range and reversed ranges return no records", () => {
  const data = [
    delivery("early", "2026-10-01T12:00:00Z"),
    delivery("late", "2026-11-15T12:00:00Z"),
  ];
  assert.deepEqual(
    periodDeliveries(data, "site", "Europe/London", {
      from: "2026-10-30",
      to: "",
    }).map((item) => item.id),
    ["late"],
  );
  assert.deepEqual(
    periodDeliveries(data, "site", "Europe/London", {
      from: "",
      to: "2026-10-30",
    }).map((item) => item.id),
    ["early"],
  );
  assert.equal(
    periodDeliveries(data, "site", "Europe/London", { from: "", to: "" })
      .length,
    2,
  );
  assert.deepEqual(
    periodDeliveries(data, "site", "Europe/London", {
      from: "2026-10-30",
      to: "2026-10-01",
    }),
    [],
  );
});

test("edits and resubmissions count each delivery ID once using its latest version", () => {
  const old = delivery("same", "2026-10-10T12:00:00Z");
  const edited = delivery("same", "2026-11-10T12:00:00Z", {
    version: 2,
    material_id: "sand",
  });
  const data = [
    old,
    edited,
    structuredClone(edited),
    delivery("other", "2026-10-12T12:00:00Z"),
  ];
  assert.deepEqual(
    periodDeliveries(data, "site", "Europe/London", {
      from: "2026-10-01",
      to: "2026-10-30",
    }).map((item) => item.id),
    ["other"],
  );
  const counts = arrivalCounts(data);
  assert.equal(counts.total, 2);
  assert.equal(counts.byMaterial.get("sand"), 1);
  assert.equal(counts.byMaterial.get("6f5"), 1);
});

test("material summaries count arrivals rather than adding incompatible quantities", () => {
  const data = [
    delivery("tonnes", "2026-10-10T12:00:00Z", {
      ticket_quantity: 20,
      ticket_unit: "tonnes",
      accepted_quantity: 19,
      accepted_unit: "tonnes",
    }),
    delivery("volume", "2026-10-10T13:00:00Z", {
      ticket_quantity: 8,
      ticket_unit: "m³",
    }),
    delivery("sand", "2026-10-10T14:00:00Z", {
      material_id: "sand",
      ticket_quantity: 3000,
      ticket_unit: "kg",
    }),
    delivery("draft", "2026-10-10T15:00:00Z", {
      status: "Draft",
      submitted_at: null,
    }),
  ];
  const counts = arrivalCounts(data);
  assert.equal(counts.total, 3);
  assert.deepEqual(
    [...counts.byMaterial],
    [
      ["6f5", 2],
      ["sand", 1],
    ],
  );
});
