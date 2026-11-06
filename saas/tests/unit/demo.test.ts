import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  demoBootstrap,
  dispatchDemo,
  migrateDemoState,
  type DemoState,
  type DemoRole,
} from "../../src/lib/demo/engine";
import { summarise } from "../../src/lib/reporting";
import type {
  Delivery,
  DeliveryInput,
  SimpleDeliveryInput,
} from "../../src/lib/types";
import { demoProfiles } from "../../src/lib/demo/profiles";

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
    ["6F5", "G1", "Type 1", "Sand", "10mm shingles", "20mm shingles", "Other"],
  );
  assert(
    boot.deliveries.every(
      (item) =>
        item.notes.includes("Fictional") && item.vehicle.startsWith("DEMO"),
    ),
  );
  assert.equal(boot.historical.length, 0);
  assert.equal(Object.keys(state.files).length, 0);
  assert.deepEqual(
    boot.suppliers.map((item) => item.name),
    ["Example Aggregates", "Sample Quarry", "Demo Building Supplies"],
  );
  assert.equal(boot.sites[0].name, "Demonstration Site");
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

test("ten fictional samples are split between the two named marshals with scoped views", async () => {
  const state = createDemoState(new Date("2026-11-06T10:00:00Z"));
  const b = demoBootstrap(state);
  assert.equal(state.deliveries.length, 10);
  assert.equal(new Set(state.deliveries.map((item) => item.id)).size, 10);
  assert.equal(b.deliveries.length, 5);
  assert(b.deliveries.every((item) => item.marshal_name === "B"));
  await ok(call(state, "/api/demo/profile", { profile: "olamilekan" }));
  const ola = demoBootstrap(state);
  assert.equal(ola.deliveries.length, 5);
  assert(
    ola.deliveries.every((item) => item.marshal_name === "Olamilekan Alaga"),
  );
  assert(
    ola.deliveries.every(
      (item) =>
        item.status === "Submitted" &&
        item.accepted_quantity === null &&
        item.reviews.length === 0 &&
        item.notes.includes("Fictional"),
    ),
  );
  await role(state, "supervisor");
  const supervisor = demoBootstrap(state);
  assert.equal(supervisor.deliveries.length, 10);
  assert.deepEqual(
    [...new Set(supervisor.deliveries.map((item) => item.marshal_name))].sort(),
    ["B", "Olamilekan Alaga"],
  );
});

test("the 6F5 correction preserves saved browser deliveries, photos and audit history", async () => {
  const state = createDemoState();
  const aggregate = state.materials[0];
  const fields = input(state, { intent: "draft", ticket_number: "KEEP-6F5" });
  const { delivery: draft } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", fields),
  );
  const upload = photo();
  await ok(call(state, `/api/deliveries/${draft.id}/evidence`, upload));
  await ok(
    call(
      state,
      `/api/deliveries/${draft.id}`,
      { ...fields, intent: "submit", version: draft.version },
      "PATCH",
    ),
  );
  aggregate.name = "GF5";
  const customMaterial = {
    ...aggregate,
    id: crypto.randomUUID(),
    name: "GF5 custom blend",
  };
  state.materials.push(customMaterial);
  const deliveries = structuredClone(state.deliveries);
  const history = structuredClone(state.audit);
  const files = state.files;
  const materialCount = state.materials.length;
  migrateDemoState(state);
  migrateDemoState(state);
  const boot = demoBootstrap(state);
  assert.equal(
    boot.materials.find((item) => item.id === aggregate.id)?.name,
    "6F5",
  );
  assert.equal(state.materials.length, materialCount);
  assert.equal(state.materials.at(-1)?.name, customMaterial.name);
  assert.equal(
    boot.deliveries.find((item) => item.id === draft.id)?.material_id,
    aggregate.id,
  );
  assert.deepEqual(state.deliveries, deliveries);
  assert.deepEqual(state.audit, history);
  assert.equal(state.files, files);
  assert.deepEqual(
    new Uint8Array(await state.files[String(upload.get("id"))].arrayBuffer()),
    new Uint8Array(await png.arrayBuffer()),
  );
});

test("five-row browser upgrades retain uploaded records and history while adding samples once", async () => {
  const state = createDemoState(new Date("2026-11-06T10:00:00Z"));
  const fields = input(state, { intent: "draft", ticket_number: "KEEP-THIS" });
  const { delivery: draft } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", fields),
  );
  const upload = photo();
  await ok(call(state, `/api/deliveries/${draft.id}/evidence`, upload));
  await ok(
    call(
      state,
      `/api/deliveries/${draft.id}`,
      { ...fields, intent: "submit", version: draft.version },
      "PATCH",
    ),
  );
  // Recreate an earlier browser database: five fixtures plus an uploaded record.
  const originalIds = new Set(
    state.deliveries.slice(0, 5).map((item) => item.id),
  );
  originalIds.add(draft.id);
  state.deliveries = state.deliveries.filter((item) =>
    originalIds.has(item.id),
  );
  state.audit = state.audit.filter((event) => originalIds.has(event.entity_id));
  state.members[0].name = "Alex · Demo gate";
  state.sites[0].name = "Demonstration Site — fictional";
  for (const supplier of state.suppliers) supplier.name += " — fictional";
  const customSupplier = {
    id: crypto.randomUUID(),
    company_id: state.company.id,
    name: "My fictional supplier",
    active: true,
  };
  state.suppliers.push(customSupplier);
  for (const delivery of state.deliveries) {
    delivery.creator_name = "Alex · Demo gate";
    delivery.marshal_id = state.members[0].id;
    delivery.marshal_name = "B Traffic Marshal";
    delivery.supplier_name = state.suppliers.find(
      (supplier) => supplier.id === delivery.supplier_id,
    )?.name;
  }
  delete state.sample_data_version;
  const originals = structuredClone(state.deliveries);
  const history = structuredClone(state.audit);
  const originalFiles = state.files;
  migrateDemoState(state);
  migrateDemoState(state);
  assert.equal(state.deliveries.length, 11);
  assert.equal(new Set(state.deliveries.map((item) => item.id)).size, 11);
  for (const original of originals)
    assert.deepEqual(
      state.deliveries.find((item) => item.id === original.id),
      original,
    );
  assert.deepEqual(state.audit.slice(0, history.length), history);
  assert.equal(state.audit.length, history.length + 5);
  assert.equal(state.files, originalFiles);
  assert.deepEqual(
    new Uint8Array(await state.files[String(upload.get("id"))].arrayBuffer()),
    new Uint8Array(await png.arrayBuffer()),
  );
  await role(state, "supervisor");
  const upgraded = demoBootstrap(state);
  const visible = upgraded.deliveries;
  assert.equal(visible.length, 11);
  assert.equal(upgraded.sites[0].name, "Demonstration Site");
  assert.equal(upgraded.suppliers[0].name, "Example Aggregates");
  assert.equal(upgraded.suppliers.at(-1)?.name, customSupplier.name);
  assert(visible.every((item) => !item.supplier_name?.includes("fictional")));
  assert.equal(visible.find((item) => item.id === draft.id)?.marshal_name, "B");
  assert(
    visible.every((item) =>
      ["B", "Olamilekan Alaga"].includes(item.marshal_name!),
    ),
  );
  assert(
    visible.every((item) =>
      ["B", "Olamilekan Alaga"].includes(item.creator_name),
    ),
  );
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
  assert.equal(summarise(state.deliveries).arrivals, 11);
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
  assert.equal(summarise(state.deliveries).arrivals, 11);
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
  assert.equal(summarise(state.deliveries).arrivals, 10);
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

test("named marshal profiles have distinct gate identities and retain delivery attribution", async () => {
  assert.deepEqual(demoProfiles, [
    { id: "b", name: "B", initials: "B" },
    { id: "olamilekan", name: "Olamilekan Alaga", initials: "OA" },
  ]);
  const state = createDemoState();
  const firstActor = demoBootstrap(state).actor;
  assert.equal(firstActor.name, "B");
  const bInput = input(state, { intent: "draft", ticket_number: "B-DEMO" });
  const { delivery: bDraft } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", bInput),
  );
  await role(state, "supervisor");
  const selected = await ok<ReturnType<typeof demoBootstrap>>(
    call(state, "/api/demo/profile", { profile: "olamilekan" }),
  );
  assert.equal(selected.actor.role, "gate");
  assert.equal(selected.actor.name, "Olamilekan Alaga");
  assert.notEqual(selected.actor.id, firstActor.id);
  assert.equal(
    selected.deliveries.some((delivery) => delivery.id === bDraft.id),
    false,
  );
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${bDraft.id}`,
        { ...bInput, version: bDraft.version },
        "PATCH",
      )
    ).status,
    403,
  );
  const olaInput = input(state, { ticket_number: "OLA-DEMO" });
  const { delivery: olaDelivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/deliveries", olaInput),
  );
  assert.equal(olaDelivery.creator_name, "Olamilekan Alaga");
  assert.equal(olaDelivery.created_by, selected.actor.id);
  assert.equal(bDraft.creator_name, "B");
  assert.equal(bDraft.created_by, firstActor.id);
  await ok(call(state, "/api/demo/profile", { profile: "b" }));
  assert.equal(demoBootstrap(state).actor.id, firstActor.id);
  assert.equal(
    state.deliveries.find((delivery) => delivery.id === olaDelivery.id)
      ?.creator_name,
    "Olamilekan Alaga",
  );
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${olaDelivery.id}`,
        { ...olaInput, version: olaDelivery.version },
        "PATCH",
      )
    ).status,
    403,
  );
});

test("selected marshal survives role changes, logout and sample reset", async () => {
  const state = createDemoState();
  const selected = await ok<ReturnType<typeof demoBootstrap>>(
    call(state, "/api/demo/profile", { profile: "olamilekan" }),
  );
  const captured = input(state);
  await ok(call(state, "/api/deliveries", captured));
  await role(state, "supervisor");
  await role(state, "gate");
  assert.equal(demoBootstrap(state).actor.id, selected.actor.id);
  await role(state, "site_manager");
  await ok(call(state, "/api/auth/logout", {}));
  assert.equal(demoBootstrap(state).actor.name, "Olamilekan Alaga");
  state.files["example"] = png;
  const reset = await ok<ReturnType<typeof demoBootstrap>>(
    call(state, "/api/demo/reset", {}),
  );
  assert.equal(reset.actor.id, selected.actor.id);
  assert.equal(reset.actor.role, "gate");
  assert.equal(reset.actor.name, "Olamilekan Alaga");
  assert.equal(reset.deliveries.length, 5);
  assert.equal(state.deliveries.length, 10);
  assert(!reset.deliveries.some((delivery) => delivery.id === captured.id));
  assert.equal(Object.keys(state.files).length, 0);
});

test("legacy browser state migrates without changing old actor IDs, records, photos or history", async () => {
  const state = createDemoState();
  delete state.gate_profile;
  state.members = state.members.slice(0, 4);
  const oldGateId = "d3000000-0000-4000-8000-000000000001";
  state.members[0].id = oldGateId;
  state.members[0].name = "Alex · Demo gate";
  for (const delivery of state.deliveries) {
    delivery.created_by = oldGateId;
    delivery.creator_name = "Alex · Demo gate";
  }
  state.files["legacy-photo"] = png;
  const oldDeliveries = structuredClone(state.deliveries),
    oldHistory = structuredClone(state.audit);
  const filesBefore = state.files;
  migrateDemoState(state);
  migrateDemoState(state);
  assert.equal(state.members.length, 5);
  assert.equal(state.gate_profile, "b");
  assert.equal(demoBootstrap(state).actor.id, oldGateId);
  assert.equal(demoBootstrap(state).actor.name, "B");
  assert.deepEqual(state.deliveries, oldDeliveries);
  assert.deepEqual(state.audit, oldHistory);
  assert.equal(state.files, filesBefore);
  assert.equal(state.files["legacy-photo"], png);
  await ok(call(state, "/api/demo/profile", { profile: "olamilekan" }));
  assert.equal(demoBootstrap(state).actor.name, "Olamilekan Alaga");
});

test("both marshal profiles require an independent supervisor and cannot store credentials", async () => {
  for (const profile of demoProfiles) {
    const state = createDemoState();
    await ok(
      call(state, "/api/demo/profile", {
        profile: profile.id,
        email: "private@example.com",
        password: "never-save",
      }),
    );
    const { delivery } = await ok<{ delivery: Delivery }>(
      call(state, "/api/deliveries", input(state)),
    );
    const review = {
      decision: "Accepted",
      version: delivery.version,
      reason: "Fictional check",
      accepted_quantity: 20,
      accepted_unit: "tonnes",
    };
    assert.equal(
      (await call(state, `/api/deliveries/${delivery.id}/review`, review))
        .status,
      403,
    );
    await role(state, "supervisor");
    const accepted = await ok<{ delivery: Delivery }>(
      call(state, `/api/deliveries/${delivery.id}/review`, review),
    );
    assert.notEqual(
      accepted.delivery.reviews[0].reviewer_id,
      delivery.created_by,
    );
    assert.equal(accepted.delivery.creator_name, profile.name);
    assert(!JSON.stringify(state).includes("private@example.com"));
    assert(!JSON.stringify(state).includes("never-save"));
  }
});

test("unrecognised profile selections leave the active identity unchanged", async () => {
  const state = createDemoState();
  await ok(call(state, "/api/demo/profile", { profile: "olamilekan" }));
  const selected = demoBootstrap(state).actor;
  assert.equal(
    (await call(state, "/api/demo/profile", { profile: "real-admin" })).status,
    400,
  );
  assert.equal(demoBootstrap(state).actor.id, selected.id);
  assert.equal(state.gate_profile, "olamilekan");
});

function simpleInput(
  state: DemoState,
  fields: Partial<SimpleDeliveryInput> = {},
): SimpleDeliveryInput {
  return {
    id: crypto.randomUUID(),
    site_id: state.sites[0].id,
    material_id: state.materials[0].id,
    marshal_id: demoBootstrap(state).marshals![0].id,
    supplier_name: "Fictional Quarry",
    arrival_at: new Date().toISOString(),
    intent: "draft",
    ...fields,
  };
}

test("simple photo logging preserves chosen marshal, actual creator and supplier snapshots", async () => {
  const state = createDemoState(),
    boot = demoBootstrap(state);
  assert.equal(boot.marshals?.length, 2);
  assert.deepEqual(
    boot.marshals?.map((marshal) => marshal.name),
    ["B", "Olamilekan Alaga"],
  );
  assert(
    boot.marshals?.every(
      (marshal) =>
        marshal.active &&
        marshal.company_id === boot.company.id &&
        marshal.site_id === state.sites[0].id,
    ),
  );
  const fields = simpleInput(state, {
    marshal_id: boot.marshals![1].id,
    supplier_name: " Fictional Quarry ",
  });
  const { delivery: draft } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", fields),
  );
  assert.equal(draft.marshal_name, "Olamilekan Alaga");
  assert.equal(draft.created_by, boot.actor.id);
  assert.equal(draft.creator_name, "B");
  assert.notEqual(draft.marshal_id, draft.created_by);
  assert.equal(draft.supplier_name, "Fictional Quarry");
  assert.equal(draft.capture_mode, "simple");
  assert.equal(draft.status, "Draft");
  assert.equal(draft.vehicle, "");
  assert.equal(draft.ticket_number, "");
  assert.equal(draft.ticket_quantity, null);
  assert.equal(draft.ticket_unit, "loads");
  assert.equal(summarise(state.deliveries).arrivals, 10);
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        intent: "submit",
        version: draft.version,
      })
    ).status,
    400,
  );
  assert.equal(
    state.deliveries.find((delivery) => delivery.id === draft.id)?.status,
    "Draft",
  );
  const form = photo();
  form.set("kind", "load");
  await ok(call(state, `/api/deliveries/${draft.id}/evidence`, form));
  state.members.find((member) => member.id === draft.marshal_id)!.name =
    "Updated catalogue display name";
  const { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", {
      ...fields,
      intent: "submit",
      version: draft.version,
    }),
  );
  assert.equal(delivery.status, "Submitted");
  assert.equal(delivery.evidence.length, 1);
  assert.equal(delivery.marshal_name, "Olamilekan Alaga");
  assert.equal(delivery.supplier_name, "Fictional Quarry");
  assert.equal(delivery.accepted_quantity, null);
  assert.equal(delivery.accepted_unit, null);
  assert.equal(summarise(state.deliveries).arrivals, 11);
  assert.equal(
    state.audit.find(
      (event) =>
        event.action === "delivery.submitted" && event.entity_id === draft.id,
    )?.actor_id,
    boot.actor.id,
  );
});

test("simple retries cannot duplicate arrivals or mutate saved fields, and legacy routes cannot bypass photos", async () => {
  const state = createDemoState(),
    fields = simpleInput(state);
  const { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", fields),
  );
  await ok(call(state, "/api/log-deliveries", fields));
  for (const patch of [
    { supplier_name: "Changed supplier" },
    { material_id: state.materials[1].id },
    { marshal_id: demoBootstrap(state).marshals![1].id },
    { arrival_at: new Date(Date.now() - 60_000).toISOString() },
  ]) {
    assert.equal(
      (
        await call(state, "/api/log-deliveries", {
          ...fields,
          ...patch,
          intent: "submit",
          version: delivery.version,
        })
      ).status,
      409,
    );
  }
  assert.equal(
    (
      await call(
        state,
        `/api/deliveries/${delivery.id}`,
        input(state, { id: delivery.id, version: delivery.version }),
        "PATCH",
      )
    ).status,
    409,
  );
  const form = photo();
  form.set("kind", "load");
  await ok(call(state, `/api/deliveries/${delivery.id}/evidence`, form));
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        intent: "submit",
        version: delivery.version + 1,
      })
    ).status,
    409,
  );
  const submission = { ...fields, intent: "submit", version: delivery.version };
  const saved = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", submission),
  );
  const retry = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", submission),
  );
  assert.deepEqual(retry, saved);
  assert.equal(
    state.deliveries.filter((record) => record.id === fields.id).length,
    1,
  );
  assert.equal(
    state.audit.filter(
      (event) =>
        event.entity_id === fields.id && event.action === "delivery.created",
    ).length,
    1,
  );
  assert.equal(
    state.audit.filter(
      (event) =>
        event.entity_id === fields.id && event.action === "delivery.submitted",
    ).length,
    1,
  );
  assert.equal(summarise(state.deliveries).arrivals, 11);
});

test("simple logging rejects unassigned marshals, invalid suppliers, future times and image-free first submission", async () => {
  const state = createDemoState(),
    fields = simpleInput(state);
  for (const supplier of ["", "  ", "x".repeat(201), null]) {
    assert.equal(
      (
        await call(state, "/api/log-deliveries", {
          ...fields,
          supplier_name: supplier,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (await call(state, "/api/log-deliveries", { ...fields, intent: "submit" }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        marshal_id: crypto.randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        arrival_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    ).status,
    400,
  );
  const second = demoBootstrap(state).marshals![1];
  state.members.find((member) => member.id === second.id)!.site_ids = [];
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        marshal_id: second.id,
      })
    ).status,
    400,
  );
  state.materials[0].active = false;
  assert.equal((await call(state, "/api/log-deliveries", fields)).status, 400);
  assert.equal(state.deliveries.length, 10);
});

test("gate sees only their own records and photos, no audit snapshots, while the supervisor sees the authorised site", async () => {
  const state = createDemoState(),
    fields = simpleInput(state);
  const { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", fields),
  );
  const form = photo(),
    evidenceId = String(form.get("id"));
  form.set("kind", "load");
  await ok(call(state, `/api/deliveries/${delivery.id}/evidence`, form));
  await ok(
    call(state, "/api/log-deliveries", {
      ...fields,
      intent: "submit",
      version: delivery.version,
    }),
  );
  await ok(call(state, "/api/demo/profile", { profile: "olamilekan" }));
  const ola = demoBootstrap(state);
  assert.equal(ola.deliveries.length, 5);
  assert.equal(ola.audit.length, 0);
  assert.equal((await call(state, `/api/evidence/${evidenceId}`)).status, 404);
  assert.equal((await call(state, "/api/log-deliveries", fields)).status, 404);
  await role(state, "supervisor");
  assert(
    demoBootstrap(state).deliveries.some((record) => record.id === fields.id),
  );
  assert.equal((await call(state, `/api/evidence/${evidenceId}`)).status, 200);
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        id: crypto.randomUUID(),
      })
    ).status,
    403,
  );
});
