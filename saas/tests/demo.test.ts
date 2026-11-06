import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  demoBootstrap,
  dispatchDemo,
  type DemoState,
  type DemoRole,
} from "../src/lib/demo/engine";
import { summarise } from "../src/lib/reporting";
import type { Delivery, DeliveryInput } from "../src/lib/types";

async function call(
  state: DemoState,
  url: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  return dispatchDemo(state, url, { method, body });
}
async function ok<T>(response: Promise<Response>): Promise<T> {
  const result = await response;
  const body = await result.json();
  assert.equal(result.status, 200, JSON.stringify(body));
  return body as T;
}
async function role(state: DemoState, next: DemoRole) {
  await ok(call(state, "/api/demo/role", { role: next }));
}
function input(
  state: DemoState,
  fields: Partial<DeliveryInput> = {},
): DeliveryInput {
  return {
    id: crypto.randomUUID(),
    site_id: state.sites[0].id,
    material_id: state.materials[0].id,
    supplier_id: state.suppliers[0].id,
    vehicle: "DEMO 999",
    ticket_number: "FICTIONAL-999",
    ticket_quantity: 20,
    ticket_unit: "tonnes",
    arrival_at: new Date().toISOString(),
    notes: "Fictional test delivery",
    intent: "submit",
    ...fields,
  };
}
const png = new File(
  [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
  "fictional-photo.png",
  { type: "image/png" },
);
function photo(id = crypto.randomUUID(), file = png) {
  const form = new FormData();
  form.set("id", id);
  form.set("kind", "ticket");
  form.set("file", file);
  return form;
}

test("demo opens without credentials and uses only clearly fictional sample data", async () => {
  const state = createDemoState();
  const boot = await ok<ReturnType<typeof demoBootstrap>>(
    call(state, "/api/bootstrap"),
  );
  assert.equal(boot.mode, "demo");
  assert.equal(boot.actor.role, "gate");
  assert.equal(boot.company.name, "DJCU Demo Workspace");
  assert.deepEqual(
    boot.materials.map((item) => item.name),
    ["GF5", "G1", "Type 1", "Sand", "10mm shingles", "20mm shingles", "Other"],
  );
  assert(
    boot.deliveries.every(
      (item) =>
        item.notes.includes("Fictional") && item.vehicle.startsWith("DEMO"),
    ),
  );
  assert.equal(boot.historical.length, 0);
  assert.equal(Object.keys(state.files).length, 0);
  assert(boot.suppliers.every((item) => item.name.includes("fictional")));
  assert.equal(
    (
      await call(state, "/api/auth/login", {
        email: "real@example.com",
        password: "secret",
      })
    ).status,
    404,
  );
  assert(!JSON.stringify(state).includes("real@example.com"));
});

test("complete gate photo capture, supervisor receipt and manager reporting workflow stays local", async () => {
  const state = createDemoState(),
    fields = input(state, { intent: "draft", vehicle: " demo 999 " });
  const initial = summarise(state.deliveries).arrivals;
  let result = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", fields),
  );
  assert.equal(result.delivery.status, "Draft");
  assert.equal(result.delivery.vehicle, "DEMO 999");
  assert.equal(summarise(state.deliveries).arrivals, initial);
  const form = photo(),
    evidenceId = String(form.get("id"));
  await ok(call(state, `/api/deliveries/${fields.id}/evidence`, form));
  const stored = await call(state, `/api/evidence/${evidenceId}`);
  assert.equal(stored.status, 200);
  assert.deepEqual(
    new Uint8Array(await stored.arrayBuffer()),
    new Uint8Array(await png.arrayBuffer()),
  );
  result = await ok(
    call(
      state,
      `/api/deliveries/${fields.id}`,
      { ...fields, version: result.delivery.version, intent: "submit" },
      "PATCH",
    ),
  );
  assert.equal(result.delivery.status, "Submitted");
  assert.equal(result.delivery.evidence.length, 1);
  assert.equal(summarise(state.deliveries).arrivals, initial + 1);
  const captured = structuredClone(result.delivery);
  await role(state, "supervisor");
  result = await ok(
    call(state, `/api/deliveries/${fields.id}/review`, {
      decision: "Accepted",
      version: captured.version,
      reason: "Checked fictional physical receipt",
      accepted_quantity: 19.125,
      accepted_unit: "tonnes",
    }),
  );
  assert.equal(result.delivery.ticket_quantity, 20);
  assert.equal(result.delivery.accepted_quantity, 19.125);
  assert.equal(result.delivery.commercial_status, "Not Linked");
  assert.equal(result.delivery.reviews.length, 1);
  assert.notEqual(result.delivery.reviews[0].reviewer_id, captured.created_by);
  await role(state, "site_manager");
  assert.equal(
    demoBootstrap(state).deliveries.find(
      (delivery) => delivery.id === fields.id,
    )?.status,
    "Accepted",
  );
  const csv = await call(
    state,
    `/api/reports?site_id=${fields.site_id}&material_id=${fields.material_id}`,
  );
  assert.equal(csv.status, 200);
  assert(csv.headers.get("Content-Type")?.includes("text/csv"));
  const report = await csv.text();
  assert(report.includes(fields.id));
  assert(report.includes('"20","tonnes","19.125","tonnes"'));
  assert(state.audit.some((event) => event.action === "report.exported"));
  const reviewed = state.audit.find(
    (event) =>
      event.action === "delivery.reviewed" && event.entity_id === fields.id,
  );
  assert.equal((reviewed?.before as Delivery).status, "Submitted");
  assert.equal((reviewed?.after as Delivery).status, "Accepted");
});

test("stable IDs protect repeated creation, photo upload and submission from double tallying", async () => {
  const state = createDemoState(),
    fields = input(state, { intent: "draft" });
  let { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", fields),
  );
  await ok(call(state, "/api/deliveries", fields));
  const form = photo();
  await ok(call(state, `/api/deliveries/${fields.id}/evidence`, form));
  await ok(call(state, `/api/deliveries/${fields.id}/evidence`, form));
  const submission = { ...fields, intent: "submit", version: delivery.version };
  ({ delivery } = await ok<{ delivery: Delivery }>(
    call(state, `/api/deliveries/${fields.id}`, submission, "PATCH"),
  ));
  await ok(call(state, `/api/deliveries/${fields.id}`, submission, "PATCH"));
  assert.equal(
    state.deliveries.filter((record) => record.id === fields.id).length,
    1,
  );
  assert.equal(delivery.evidence.length, 1);
  assert.equal(
    state.audit.filter(
      (event) =>
        event.action === "evidence.attached" &&
        event.entity_id === form.get("id"),
    ).length,
    1,
  );
  assert.equal(summarise(state.deliveries).arrivals, 6);
});

test("duplicate supplier ticket numbers produce an investigation warning", async () => {
  const state = createDemoState(),
    existing = state.deliveries[0];
  const result = await ok<{ warnings: string[] }>(
    call(
      state,
      "/api/deliveries",
      input(state, {
        supplier_id: existing.supplier_id,
        ticket_number: existing.ticket_number.toLowerCase(),
      }),
    ),
  );
  assert(
    result.warnings.some((warning) =>
      warning.includes("ticket number already appears"),
    ),
  );
});

test("gate cannot approve, manager cannot capture and administrator cannot bypass supervisor", async () => {
  const state = createDemoState(),
    pending = state.deliveries.find(
      (delivery) => delivery.status === "Submitted",
    )!;
  const decision = {
    decision: "Accepted",
    reason: "",
    version: pending.version,
    accepted_quantity: 20,
    accepted_unit: "tonnes",
  };
  for (const next of ["gate", "site_manager", "company_admin"] as const) {
    await role(state, next);
    assert.equal(
      (await call(state, `/api/deliveries/${pending.id}/review`, decision))
        .status,
      403,
    );
  }
  await role(state, "site_manager");
  assert.equal(
    (await call(state, "/api/deliveries", input(state))).status,
    403,
  );
  await role(state, "supervisor");
  pending.created_by = demoBootstrap(state).actor.id;
  assert.equal(
    (await call(state, `/api/deliveries/${pending.id}/review`, decision))
      .status,
    403,
  );
});

test("site and company boundaries apply to bootstrap, capture, evidence and reports", async () => {
  const state = createDemoState();
  const original = state.deliveries[0];
  const inaccessible = {
    ...structuredClone(original),
    id: crypto.randomUUID(),
    site_id: crypto.randomUUID(),
    company_id: crypto.randomUUID(),
  };
  state.deliveries.push(inaccessible);
  assert(
    !demoBootstrap(state).deliveries.some(
      (delivery) => delivery.id === inaccessible.id,
    ),
  );
  assert.equal(
    (
      await call(
        state,
        "/api/deliveries",
        input(state, { site_id: inaccessible.site_id }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(state, `/api/deliveries/${inaccessible.id}/review`, {})).status,
    404,
  );
  await role(state, "site_manager");
  assert.equal(
    (await call(state, `/api/reports?site_id=${inaccessible.site_id}`)).status,
    403,
  );
  state.members.find((member) => member.role === "site_manager")!.site_ids = [];
  assert.equal(demoBootstrap(state).deliveries.length, 0);
  assert.equal(
    (await call(state, `/api/reports?site_id=${original.site_id}`)).status,
    403,
  );
});

test("review requires current version, positive quantity, matching unit and site evidence policy", async () => {
  const state = createDemoState(),
    pending = state.deliveries.find(
      (delivery) => delivery.status === "Submitted",
    )!;
  state.sites[0].require_photo = true;
  await role(state, "supervisor");
  const decision = {
    decision: "Accepted",
    version: pending.version,
    reason: "Checked",
    accepted_quantity: 18,
    accepted_unit: "tonnes",
  };
  assert.equal(
    (await call(state, `/api/deliveries/${pending.id}/review`, decision))
      .status,
    400,
  );
  state.sites[0].require_photo = false;
  for (const patch of [
    { version: 0 },
    { accepted_unit: "kg" },
    { accepted_quantity: 0 },
    { accepted_quantity: -1 },
    { accepted_quantity: 1.2345 },
    { accepted_quantity: null },
  ]) {
    assert.notEqual(
      (
        await call(state, `/api/deliveries/${pending.id}/review`, {
          ...decision,
          ...patch,
        })
      ).status,
      200,
    );
  }
  assert.equal(pending.status, "Submitted");
  assert.equal(pending.reviews.length, 0);
  await ok(call(state, `/api/deliveries/${pending.id}/review`, decision));
  assert.equal(
    (await call(state, `/api/deliveries/${pending.id}/review`, decision))
      .status,
    409,
  );
});

test("correction retains original input history, first submission time and a single tally", async () => {
  const state = createDemoState(),
    fields = input(state);
  let { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", fields),
  );
  const firstSubmitted = delivery.submitted_at;
  await role(state, "supervisor");
  ({ delivery } = await ok<{ delivery: Delivery }>(
    call(state, `/api/deliveries/${fields.id}/review`, {
      decision: "Correction Requested",
      reason: "Check ticket quantity",
      version: delivery.version,
    }),
  ));
  await role(state, "gate");
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${fields.id}`,
        { ...fields, ticket_quantity: 22, version: 1 },
        "PATCH",
      )
    ).status,
    409,
  );
  ({ delivery } = await ok<{ delivery: Delivery }>(
    call(
      state,
      `/api/deliveries/${fields.id}`,
      { ...fields, ticket_quantity: 22, version: delivery.version },
      "PATCH",
    ),
  ));
  assert.equal(delivery.submitted_at, firstSubmitted);
  assert.equal(summarise(state.deliveries).arrivals, 6);
  const correction = state.audit.find(
    (event) =>
      event.action === "delivery.corrected" && event.entity_id === fields.id,
  )!;
  assert.equal((correction.before as Delivery).ticket_quantity, 20);
  assert.equal((correction.after as Delivery).ticket_quantity, 22);
  assert.equal(delivery.reviews[0].decision, "Correction Requested");
});

test("incomplete manual arrivals remain pending and invalid or non-image uploads are refused", async () => {
  const state = createDemoState(),
    fields = input(state, {
      supplier_id: null,
      vehicle: "",
      ticket_quantity: null,
    });
  const { delivery, warnings } = await ok<{
    delivery: Delivery;
    warnings: string[];
  }>(call(state, "/api/deliveries", fields));
  assert.equal(delivery.status, "Submitted");
  assert(warnings.some((item) => item.includes("Incomplete")));
  await role(state, "supervisor");
  assert.equal(
    (
      await call(state, `/api/deliveries/${fields.id}/review`, {
        decision: "Accepted",
        version: delivery.version,
        reason: "",
        accepted_quantity: 5,
        accepted_unit: "tonnes",
      })
    ).status,
    400,
  );
  await role(state, "gate");
  const draft = input(state, { intent: "draft" });
  await ok(call(state, "/api/deliveries", draft));
  const bad = new File(["<svg onload=alert(1)>"], "invalid.png", {
    type: "image/png",
  });
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${draft.id}/evidence`,
        photo(crypto.randomUUID(), bad),
      )
    ).status,
    400,
  );
  const fakeType = new File([await png.arrayBuffer()], "invalid.jpg", {
    type: "image/jpeg",
  });
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${draft.id}/evidence`,
        photo(crypto.randomUUID(), fakeType),
      )
    ).status,
    400,
  );
  assert.equal(
    (await call(state, `/api/deliveries/${fields.id}/evidence`, photo()))
      .status,
    409,
  );
});

test("rejection and flag decisions require reasons and maintain independent commercial status", async () => {
  for (const decision of ["Rejected", "Flagged"] as const) {
    const state = createDemoState(),
      pending = state.deliveries.find(
        (delivery) => delivery.status === "Submitted",
      )!;
    await role(state, "supervisor");
    assert.equal(
      (
        await call(state, `/api/deliveries/${pending.id}/review`, {
          decision,
          reason: "",
          version: pending.version,
        })
      ).status,
      400,
    );
    const { delivery } = await ok<{ delivery: Delivery }>(
      call(state, `/api/deliveries/${pending.id}/review`, {
        decision,
        reason: "Fictional investigation",
        version: pending.version,
      }),
    );
    assert.equal(delivery.status, decision);
    assert.equal(delivery.accepted_quantity, null);
    assert.equal(delivery.commercial_status, "Not Linked");
  }
});

test("reports filter materials and suppliers, neutralise formulas, and keep units separate", async () => {
  const state = createDemoState(),
    fields = input(state, { notes: '=HYPERLINK("example")' });
  await ok(call(state, "/api/deliveries", fields));
  await role(state, "site_manager");
  const report = await (
    await call(
      state,
      `/api/reports?material_id=${fields.material_id}&supplier_id=${fields.supplier_id}`,
    )
  ).text();
  assert(report.includes(fields.id));
  assert(!report.includes(state.deliveries[1].id));
  assert(report.includes('"\'=HYPERLINK(""example"")"'));
  assert.deepEqual(summarise(state.deliveries).quantities, {
    tonnes: 19.5,
    "m³": 8,
  });
});

test("administrator catalogues, sites and aggregates work without storing credentials or fabricating arrivals", async () => {
  const state = createDemoState();
  assert.equal(
    (
      await call(state, "/api/admin", {
        action: "material",
        name: "Demo material",
      })
    ).status,
    403,
  );
  await role(state, "company_admin");
  await ok(
    call(state, "/api/admin", { action: "material", name: "Demo material" }),
  );
  await ok(
    call(state, "/api/admin", { action: "supplier", name: "Demo supplier" }),
  );
  await ok(
    call(state, "/api/admin", {
      action: "site",
      name: "Second fictional site",
      timezone: "Europe/London",
    }),
  );
  assert.equal(state.sites.length, 2);
  await ok(
    call(state, "/api/admin", {
      action: "historical",
      site_id: state.sites[0].id,
      date: "2026-01-01",
      material_id: state.materials[0].id,
      reported_count: 12,
      confidence: "Unreviewed",
      source_reference: "Fictional example",
      notes: "No original notebook imported",
    }),
  );
  assert.equal(state.historical.length, 1);
  assert.equal(summarise(state.deliveries).arrivals, 5);
  await ok(
    call(state, "/api/admin", {
      action: "member",
      name: "Fictional person",
      email: "private@example.com",
      password: "not-stored",
      role: "gate",
      site_ids: [state.sites[0].id],
    }),
  );
  assert(!JSON.stringify(state).includes("private@example.com"));
  assert(!JSON.stringify(state).includes("not-stored"));
  await ok(call(state, "/api/auth/logout", {}));
  assert.equal(state.role, "gate");
});

test("unknown and external routes never escape to a real API", async () => {
  const state = createDemoState();
  assert.equal(
    (await call(state, "https://production.example/api/bootstrap")).status,
    400,
  );
  assert.equal((await call(state, "/api/not-supported")).status, 404);
  assert.equal(
    (await call(state, "/api/demo/role", { role: "platform_admin" })).status,
    400,
  );
  const boot = demoBootstrap(state);
  boot.deliveries[0].ticket_quantity = 999;
  assert.notEqual(state.deliveries[0].ticket_quantity, 999);
});
