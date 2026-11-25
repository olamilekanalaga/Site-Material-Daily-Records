import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSupervisorView,
  type SupervisorFilters,
} from "../../src/lib/supervisor-workspace";
import type { Bootstrap, CatalogueItem, Delivery } from "../../src/lib/types";

const october = { from: "2026-10-01", to: "2026-10-31" };
function material(
  id: string,
  name: string,
  patch: Partial<CatalogueItem> = {},
): CatalogueItem {
  return {
    id,
    name,
    company_id: "company",
    active: true,
    category: "Aggregates / Sands",
    entry_type: "Delivery",
    approval_status: "Approved",
    ...patch,
  };
}
function arrival(
  id: string,
  arrivalAt: string,
  patch: Partial<Delivery> = {},
): Delivery {
  return {
    id,
    company_id: "company",
    site_id: "site",
    material_id: "type1",
    supplier_id: null,
    marshal_id: "b",
    marshal_name: "Bemigho Estano",
    vehicle: "",
    ticket_number: "",
    ticket_quantity: null,
    ticket_unit: "loads",
    arrival_at: arrivalAt,
    created_by: "b",
    creator_name: "Bemigho Estano",
    created_at: arrivalAt,
    recorded_at: arrivalAt,
    updated_at: arrivalAt,
    submitted_at: arrivalAt,
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
function fixture(): Bootstrap {
  const ola = { marshal_id: "ola", marshal_name: "Olamilekan Alaga" };
  return {
    actor: {
      id: "supervisor",
      company_id: "company",
      name: "Sample supervisor",
      email: "supervisor@example.invalid",
      role: "supervisor",
      site_ids: ["site"],
    },
    company: { id: "company", name: "Sample company" },
    sites: [
      {
        id: "site",
        company_id: "company",
        name: "Sample site",
        timezone: "Europe/London",
        require_ticket: false,
        require_photo: true,
      },
    ],
    materials: [
      material("type1", "Type 1"),
      material("sand", "Sand"),
      material("pump", "Trial Gate Pump", {
        category: "Other Materials",
        entry_type: "Pending review",
        approval_status: "Pending",
      }),
      material("sweeper", "Road sweeper", {
        category: "Services",
        entry_type: "Service visit",
      }),
    ],
    suppliers: [],
    marshals: [
      {
        id: "b",
        company_id: "company",
        site_id: "site",
        name: "Bemigho Estano",
        active: true,
      },
      {
        id: "ola",
        company_id: "company",
        site_id: "site",
        name: "Olamilekan Alaga",
        active: true,
      },
    ],
    deliveries: [
      arrival("first", "2026-09-30T23:00:00.000Z"),
      arrival("last", "2026-10-31T23:59:59.999Z", ola),
      arrival("pending-bst", "2026-10-25T00:30:00.000Z", {
        material_id: "pump",
        item_name: "  Trial  Gate Pump  ",
        recorded_at: "2026-10-25T00:40:00.000Z",
      }),
      arrival("pending-gmt", "2026-10-25T01:30:00.000Z", {
        ...ola,
        material_id: "pump",
        item_name: "trial gate pump",
        recorded_at: "2026-10-25T01:40:00.000Z",
      }),
      arrival("service", "2026-10-15T10:00:00.000Z", {
        ...ola,
        material_id: "sweeper",
      }),
      arrival("sand", "2026-10-20T08:00:00.000Z", { material_id: "sand" }),
    ],
    historical: [
      {
        id: "notebook",
        company_id: "company",
        site_id: "site",
        date: "2026-10-01",
        material_id: "type1",
        reported_count: 999,
        source_reference: "Aggregate notebook summary",
        confidence: "Needs review",
        notes: "Must remain separate from individually recorded arrivals",
      },
    ],
    audit: [],
    members: [],
    mode: "demo",
  };
}

test("workspace totals and all tabs reconcile actual arrivals while pending items count once", () => {
  const data = fixture();
  const before = structuredClone(data);
  const view = buildSupervisorView(data, "site", october);
  assert.deepEqual(view.stats, { arrivals: 6, marshals: 2, toClassify: 1 });
  assert.equal(
    view.workload.reduce((sum, item) => sum + item.total, 0),
    6,
  );
  assert.deepEqual(
    view.workload.map((item) => item.total),
    [3, 3],
  );
  assert.equal(
    view.breakdowns.materials.reduce((sum, item) => sum + item.total, 0),
    6,
  );
  assert.equal(
    view.breakdowns.categories.reduce((sum, item) => sum + item.total, 0),
    6,
  );
  assert.deepEqual(view.breakdowns.services, [
    { id: "sweeper", name: "Road sweeper", total: 1 },
  ]);
  assert.equal(view.pendingItems[0].count, 2);
  assert.deepEqual(
    new Set(view.pendingItems[0].originalNames),
    new Set(["  Trial  Gate Pump  ", "trial gate pump"]),
  );
  assert.equal(view.pendingItems[0].item.id, "pump");
  assert.equal(
    view.records.length,
    6,
    "A notebook tally is not an individual arrival",
  );
  assert.deepEqual(
    data,
    before,
    "Reporting must never rewrite stored records or catalogue values",
  );
});

test("workspace date range includes full London endpoint days and deduplicates before counting", () => {
  const data = fixture();
  const corrected = arrival("same", "2026-11-01T00:00:00.000Z", { version: 2 });
  data.deliveries.push(
    arrival("before", "2026-09-30T22:59:59.999Z"),
    arrival("after", "2026-11-01T00:00:00.000Z"),
    arrival("draft", "2026-10-10T10:00:00.000Z", {
      status: "Draft",
      submitted_at: null,
    }),
    arrival("foreign-company", "2026-10-10T10:00:00.000Z", {
      company_id: "another-company",
    }),
    arrival("foreign-site", "2026-10-10T10:00:00.000Z", {
      site_id: "another-site",
    }),
    arrival("invalid", "not-a-time"),
    arrival("same", "2026-10-10T10:00:00.000Z"),
    corrected,
    structuredClone(corrected),
    structuredClone(data.deliveries[0]),
  );
  const view = buildSupervisorView(data, "site", october);
  assert.equal(view.stats.arrivals, 6);
  assert(view.records.some((record) => record.id === "first"));
  assert(view.records.some((record) => record.id === "last"));
  assert(!view.records.some((record) => record.id === "same"));
  const repeatedHour = buildSupervisorView(data, "site", {
    from: "2026-10-25",
    to: "2026-10-25",
  });
  assert.deepEqual(repeatedHour.stats, {
    arrivals: 2,
    marshals: 2,
    toClassify: 1,
  });
  assert.deepEqual(
    repeatedHour.workload.flatMap((item) => item.days),
    [
      { date: "2026-10-25", total: 1 },
      { date: "2026-10-25", total: 1 },
    ],
  );
  assert.equal(
    buildSupervisorView(data, "site", { from: "2026-11-01", to: "2026-10-01" })
      .stats.arrivals,
    0,
  );
  assert.equal(
    buildSupervisorView(data, "missing-site", october).stats.arrivals,
    0,
  );
});

test("marshal and classification filters apply consistently to records, workload and review", () => {
  const data = fixture();
  const cases: [
    SupervisorFilters,
    { arrivals: number; marshals: number; toClassify: number },
  ][] = [
    [{ marshalId: "b" }, { arrivals: 3, marshals: 1, toClassify: 1 }],
    [
      { marshalId: "ola", classification: "Pending" },
      { arrivals: 1, marshals: 1, toClassify: 1 },
    ],
    [{ materialId: "type1" }, { arrivals: 2, marshals: 2, toClassify: 0 }],
    [
      {
        category: "Services",
        entryType: "Service visit",
        classification: "Approved",
      },
      { arrivals: 1, marshals: 1, toClassify: 0 },
    ],
    [
      { marshalId: "unrepresented" },
      { arrivals: 0, marshals: 0, toClassify: 0 },
    ],
  ];
  for (const [filters, stats] of cases) {
    const view = buildSupervisorView(data, "site", october, filters);
    assert.deepEqual(view.stats, stats);
    assert.equal(view.rows.length, stats.arrivals);
    assert.equal(
      view.workload.reduce((sum, item) => sum + item.total, 0),
      stats.arrivals,
    );
    assert.equal(view.pendingItems.length, stats.toClassify);
    assert.deepEqual(
      view.marshalOptions.map((item) => item.id),
      ["b", "ola"],
      "Marshal options must allow switching back to another represented marshal",
    );
  }
});

test("catalogue approval changes derived classifications without changing original arrivals or evidence", () => {
  const data = fixture();
  const evidence = {
    id: "ticket",
    delivery_id: "pending-bst",
    kind: "ticket" as const,
    name: "sample.png",
    mime: "image/png",
    size: 8,
    created_at: "2026-10-25T00:40:00.000Z",
  };
  data.deliveries[2].evidence = [evidence];
  const before = structuredClone(data.deliveries);
  const original = buildSupervisorView(data, "site", october);
  assert.equal(original.stats.toClassify, 1);
  const approved: Bootstrap = {
    ...data,
    materials: data.materials.map((item) =>
      item.id === "pump"
        ? {
            ...item,
            category: "Services",
            entry_type: "Service visit",
            approval_status: "Approved",
          }
        : item,
    ),
  };
  const refreshed = buildSupervisorView(approved, "site", october);
  assert.deepEqual(refreshed.stats, {
    arrivals: 6,
    marshals: 2,
    toClassify: 0,
  });
  assert.equal(
    refreshed.breakdowns.services.reduce((sum, item) => sum + item.total, 0),
    3,
  );
  assert.equal(
    refreshed.rows.find((row) => row.record.id === "pending-bst")!.item.name,
    "  Trial  Gate Pump  ",
  );
  assert.deepEqual(data.deliveries, before);
  assert.deepEqual(
    refreshed.records.find((record) => record.id === "pending-bst")!.evidence,
    [evidence],
  );
  assert.equal(original.pendingItems[0].item.approval_status, "Pending");
});

test("recorded timestamps determine displayed order and legacy fallback never invents a recording event", () => {
  const data = fixture();
  data.deliveries = [
    arrival("late-recording", "2026-10-01T10:00:00.000Z", {
      recorded_at: "2026-11-01T11:00:00.000Z",
    }),
    arrival("legacy", "2026-10-31T12:00:00.000Z", {
      recorded_at: undefined,
      created_at: "2026-11-02T10:00:00.000Z",
      marshal_id: undefined,
    }),
    arrival("invalid-recorded", "2026-10-30T12:00:00.000Z", {
      recorded_at: "invalid",
    }),
  ];
  const view = buildSupervisorView(data, "site", october);
  assert.deepEqual(
    view.rows.map((row) => row.record.id),
    ["late-recording", "legacy", "invalid-recorded"],
  );
  assert.equal(view.rows[0].hasRecordedTime, true);
  assert.equal(view.rows[1].hasRecordedTime, false);
  assert.equal(view.rows[1].timestamp, "2026-10-31T12:00:00.000Z");
  assert.equal(view.rows[2].hasRecordedTime, false);
  assert.equal(view.rows[2].timestamp, "2026-10-30T12:00:00.000Z");
  assert.deepEqual(view.workload[0].days, [
    { date: "2026-10-01", total: 1 },
    { date: "2026-10-30", total: 1 },
    { date: "2026-10-31", total: 1 },
  ]);
});

test("missing catalogue references remain visible and are not fabricated into approvable items", () => {
  const data = fixture();
  data.deliveries.push(
    arrival("orphan", "2026-10-03T12:00:00.000Z", {
      material_id: "missing",
      item_name: "Original historical item",
    }),
  );
  const view = buildSupervisorView(data, "site", october);
  assert.deepEqual(view.stats, { arrivals: 7, marshals: 2, toClassify: 1 });
  assert.deepEqual(view.unavailablePendingItems, [
    {
      id: "missing",
      name: "Original historical item",
      count: 1,
      originalNames: ["Original historical item"],
    },
  ]);
  assert.equal(
    view.rows.find((row) => row.record.id === "orphan")!.item.approval_status,
    "Pending",
  );
  assert(!view.pendingItems.some((entry) => entry.item.id === "missing"));
});
