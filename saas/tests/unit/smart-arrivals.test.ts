import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  demoBootstrap,
  dispatchDemo,
  migrateDemoState,
  type DemoState,
} from "../../src/lib/demo/engine";
import {
  itemDetails,
  normaliseItemName,
  searchCatalogue,
} from "../../src/lib/catalogue";
import { arrivalCounts } from "../../src/lib/delivery-records";
import type {
  CatalogueItem,
  Delivery,
  SimpleDeliveryInput,
} from "../../src/lib/types";

function call(state: DemoState, url: string, body?: unknown) {
  return dispatchDemo(state, url, {
    method: body === undefined ? "GET" : "POST",
    body,
  });
}
async function ok<T>(response: Promise<Response>): Promise<T> {
  const result = await response;
  const body = await result.json();
  assert.equal(result.status, 200, JSON.stringify(body));
  return body as T;
}
function input(
  state: DemoState,
  item: string,
  custom = false,
): SimpleDeliveryInput {
  return {
    id: crypto.randomUUID(),
    site_id: state.sites[0].id,
    material_id: custom
      ? ""
      : state.materials.find((candidate) => candidate.name === item)!.id,
    marshal_id: demoBootstrap(state).actor.id,
    supplier_name: "",
    // An old form-open timestamp must never become a newly saved arrival time.
    arrival_at: "2020-01-01T00:00:00.000Z",
    recorded_at: "2020-01-01T00:00:00.000Z",
    capture_kind: "arrival",
    ...(custom ? { custom_item_name: item } : {}),
    intent: "draft",
  };
}
function photo() {
  const form = new FormData();
  form.set("id", crypto.randomUUID());
  form.set("kind", "ticket");
  form.set(
    "file",
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
      "sample-ticket.png",
      { type: "image/png" },
    ),
  );
  return form;
}
async function capture(state: DemoState, fields: SimpleDeliveryInput) {
  const { delivery: draft } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", fields),
  );
  await ok(call(state, `/api/deliveries/${draft.id}/evidence`, photo()));
  return (
    await ok<{ delivery: Delivery }>(
      call(state, "/api/log-deliveries", {
        ...fields,
        intent: "submit",
        version: draft.version,
      }),
    )
  ).delivery;
}

test("known items derive trusted categories and entry types without quantities", async () => {
  const state = createDemoState();
  for (const [name, category, entryType] of [
    ["6F5", "Aggregates", "Delivery"],
    ["Timber", "Timber", "Delivery"],
    ["Road sweeper", "Site services", "Service visit"],
    ["Toilet servicing", "Site services", "Service visit"],
  ]) {
    const delivery = await capture(state, input(state, name));
    assert.equal(delivery.category, category);
    assert.equal(delivery.entry_type, entryType);
    assert.equal(delivery.item_name, name);
    assert.equal(delivery.ticket_quantity, null);
    assert.equal(delivery.accepted_quantity, null);
    assert.equal(delivery.status, "Submitted");
    assert.equal(delivery.reviews.length, 0);
  }
  const { delivery } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", {
      ...input(state, "6F5"),
      category: "Site services",
      entry_type: "Service visit",
    }),
  );
  assert.equal(delivery.category, "Aggregates");
  assert.equal(delivery.entry_type, "Delivery");
});

test("unknown arrivals preserve entered text, count immediately and share one pending catalogue item", async () => {
  const state = createDemoState();
  const first = await capture(
    state,
    input(state, "  Specialist   Pump Visit  ", true),
  );
  const second = await capture(
    state,
    input(state, "SPECIALIST pump visit", true),
  );
  assert.equal(first.item_name, "  Specialist   Pump Visit  ");
  assert.equal(second.item_name, "SPECIALIST pump visit");
  assert.equal(first.material_id, second.material_id);
  assert.equal(first.category, "Pending classification");
  assert.equal(first.entry_type, "Pending review");
  assert.equal(
    state.materials.filter(
      (item) =>
        normaliseItemName(item.name) === normaliseItemName(first.item_name!),
    ).length,
    1,
  );
  assert.equal(
    state.audit.filter((event) => event.action === "catalogue.item.pending")
      .length,
    1,
  );
  assert.equal(arrivalCounts([first, second]).total, 2);
  const item = state.materials.find(
    (candidate) => candidate.id === first.material_id,
  )!;
  assert.equal(item.approval_status, "Pending");
  assert(
    !searchCatalogue(state.materials, "Specialist Pump").some(
      (candidate) => candidate.id === item.id,
    ),
  );
  assert.equal(first.supplier_name, "");
});

test("supervisor approval persists and reclassifies reporting without rewriting original arrival evidence", async () => {
  const state = createDemoState();
  const first = await capture(
    state,
    input(state, "Bespoke pump service", true),
  );
  const original = structuredClone(
    state.deliveries.find((row) => row.id === first.id)!,
  );
  const approval = {
    item_id: first.material_id,
    category: "Site services",
    entry_type: "Service visit",
  };
  assert.equal(
    (await call(state, "/api/demo/catalogue/review", approval)).status,
    403,
  );
  state.role = "supervisor";
  assert.equal(
    (
      await call(state, "/api/demo/catalogue/review", {
        ...approval,
        category: "Guessed category",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(state, "/api/demo/catalogue/review", {
        ...approval,
        entry_type: "Pending review",
      })
    ).status,
    400,
  );
  const { item } = await ok<{ item: CatalogueItem }>(
    call(state, "/api/demo/catalogue/review", approval),
  );
  assert.equal(item.approval_status, "Approved");
  await ok(call(state, "/api/demo/catalogue/review", approval));
  assert.equal(
    state.audit.filter((event) => event.action === "catalogue.item.approved")
      .length,
    1,
  );
  assert.deepEqual(
    state.deliveries.find((row) => row.id === first.id),
    original,
  );
  const restored = migrateDemoState(structuredClone(state));
  const visible = demoBootstrap(restored).deliveries.find(
    (row) => row.id === first.id,
  )!;
  assert.equal(visible.category, "Site services");
  assert.equal(visible.entry_type, "Service visit");
  assert.equal(visible.item_name, original.item_name);
  assert.equal(
    searchCatalogue(restored.materials, "bespoke pump")[0].id,
    first.material_id,
  );
  assert.equal(
    itemDetails(original, restored.materials).approval_status,
    "Approved",
  );
  assert.equal(
    restored.files[first.evidence[0].id].size,
    original.evidence[0].size,
  );
});

test("save-time timestamp is stable across lost-response retries and repeated confirmed submissions", async () => {
  const state = createDemoState();
  const fields = input(state, "6F5");
  const before = Date.now();
  const { delivery: first } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", fields),
  );
  assert(Date.parse(first.recorded_at!) >= before);
  assert(Date.parse(first.recorded_at!) <= Date.now());
  assert.equal(first.recorded_at, first.arrival_at);
  assert.equal(first.created_at, first.recorded_at);
  const retry = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", {
      ...fields,
      arrival_at: "2022-01-01T12:00:00Z",
      recorded_at: "2022-01-01T12:00:00Z",
    }),
  );
  assert.deepEqual(retry.delivery, first);
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        intent: "submit",
        version: first.version,
      })
    ).status,
    400,
  );
  await ok(call(state, `/api/deliveries/${first.id}/evidence`, photo()));
  const submission = { ...fields, intent: "submit", version: first.version };
  const { delivery: saved } = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", submission),
  );
  const repeated = await ok<{ delivery: Delivery }>(
    call(state, "/api/log-deliveries", submission),
  );
  assert.deepEqual(repeated.delivery, saved);
  assert.equal(saved.created_at, first.created_at);
  assert.equal(saved.recorded_at, first.recorded_at);
  assert.equal(
    state.deliveries.filter((row) => row.id === fields.id).length,
    1,
  );
  assert.equal(
    state.audit.filter(
      (event) =>
        event.action === "delivery.submitted" && event.entity_id === fields.id,
    ).length,
    1,
  );
  const next = await capture(state, input(state, "6F5"));
  assert.equal(arrivalCounts([saved, repeated.delivery, next]).total, 2);
});

test("signed-in profile and assigned site constrain capture, classification and evidence access", async () => {
  const state = createDemoState();
  const fields = input(state, "Private site equipment", true);
  const otherMarshal = (demoBootstrap(state).marshals ?? []).find(
    (item) => item.id !== fields.marshal_id,
  )!;
  assert.equal(
    (
      await call(state, "/api/log-deliveries", {
        ...fields,
        marshal_id: otherMarshal.id,
      })
    ).status,
    403,
  );
  const delivery = await capture(state, fields);
  await ok(call(state, "/api/demo/profile", { profile: "olamilekan" }));
  assert.equal(
    (await call(state, `/api/evidence/${delivery.evidence[0].id}`)).status,
    404,
  );
  state.role = "supervisor";
  const supervisor = state.members.find(
    (member) => member.role === "supervisor",
  )!;
  supervisor.site_ids = [];
  assert.equal(
    (
      await call(state, "/api/demo/catalogue/review", {
        item_id: delivery.material_id,
        category: "Plant and equipment",
        entry_type: "Delivery",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        state,
        `/api/reports?view=arrivals&site_id=${delivery.site_id}`,
      )
    ).status,
    403,
  );
  assert(
    !demoBootstrap(state).deliveries.some((row) => row.id === delivery.id),
  );
});

test("catalogue migration preserves existing IDs, ambiguous historical labels, files and audit", () => {
  const state = createDemoState();
  const existing = structuredClone(state.deliveries);
  const originalIds = state.materials.map((item) => ({
    id: item.id,
    name: item.name,
  }));
  const event = state.audit[0];
  state.files[crypto.randomUUID()] = new Blob(["retained evidence"]);
  state.materials.push({
    id: crypto.randomUUID(),
    company_id: state.company.id,
    name: "6I",
    active: true,
  });
  const first = migrateDemoState(state);
  const count = first.materials.length;
  const second = migrateDemoState(first);
  assert.equal(second.materials.length, count);
  assert.deepEqual(second.deliveries, existing);
  for (const item of originalIds)
    assert.equal(
      second.materials.find((candidate) => candidate.id === item.id)?.name,
      item.name,
    );
  for (const name of ["G1", "6I"])
    assert.equal(
      second.materials.find((item) => item.name === name)?.approval_status,
      "Pending",
    );
  assert.equal(second.audit[0], event);
  assert.equal(Object.keys(second.files).length, 1);
});

test("arrival CSV includes pending and service records, matches inclusive site-date filters and audits exports", async () => {
  const state = createDemoState(new Date("2026-11-06T12:00:00Z"));
  const pending = await capture(state, {
    ...input(state, '=HYPERLINK("example")', true),
    supplier_name: "+Example supplier",
  });
  const service = await capture(state, input(state, "Road sweeper"));
  const excluded = await capture(state, input(state, "Timber"));
  for (const [id, timestamp] of [
    [pending.id, "2026-09-30T23:30:00Z"], // 1 October in London.
    [service.id, "2026-10-30T23:30:00Z"],
    [excluded.id, "2026-10-31T00:30:00Z"],
  ]) {
    const row = state.deliveries.find((row) => row.id === id)!;
    row.arrival_at = timestamp;
    row.recorded_at = timestamp;
  }
  const url = `/api/reports?view=arrivals&site_id=${state.sites[0].id}&from=2026-10-01&to=2026-10-30`;
  assert.equal((await call(state, url)).status, 403);
  state.role = "supervisor";
  const report = await (await call(state, url)).text();
  const lines = report.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lines.length, 3);
  assert(lines[0].includes('"Item","Category","Entry type"'));
  assert(!lines[0].includes("quantity"));
  assert(report.includes('"2026-10-01","00:30"'));
  assert(report.includes('"Pending classification","Pending review"'));
  assert(report.includes('"Road sweeper","Site services","Service visit"'));
  assert(report.includes('"\'=HYPERLINK(""example"")"'));
  assert(report.includes('"\'+Example supplier"'));
  assert(!report.includes(excluded.id));
  const pendingReport = await (
    await call(
      state,
      `${url}&classification=Pending&material_id=${pending.material_id}`,
    )
  ).text();
  assert(pendingReport.includes(pending.id));
  assert(!pendingReport.includes(service.id));
  const serviceReport = await (
    await call(
      state,
      `${url}&category=Site%20services&entry_type=Service%20visit&marshal_id=${service.marshal_id}`,
    )
  ).text();
  assert(serviceReport.includes(service.id));
  assert(!serviceReport.includes(pending.id));
  assert.equal(
    (await call(state, `${url}&classification=Unknown`)).status,
    400,
  );
  assert.equal(
    (await call(state, url.replace("from=2026-10-01", "from=2026-11-01")))
      .status,
    400,
  );
  assert.equal(
    state.audit.filter((event) => event.action === "report.exported").length,
    3,
  );
  const exportEvent = state.audit.findLast(
    (event) => event.action === "report.exported",
  )!;
  assert.equal((exportEvent.after as { count: number }).count, 1);
});

test("punctuation-only custom names cannot create pending duplicates and approved Other remains selectable", async () => {
  const state = createDemoState();
  const count = state.materials.length;
  for (const name of ["...", " -- ", "@@@"])
    assert.equal(
      (await call(state, "/api/log-deliveries", input(state, name, true)))
        .status,
      400,
    );
  assert.equal(state.materials.length, count);
  assert.equal(
    (await call(state, "/api/log-deliveries", input(state, "Other"))).status,
    400,
  );
  const first = await capture(state, input(state, "Other", true));
  assert.equal(first.category, "Pending classification");
  state.role = "supervisor";
  await ok(
    call(state, "/api/demo/catalogue/review", {
      item_id: first.material_id,
      category: "Other construction supplies",
      entry_type: "Delivery",
    }),
  );
  state.role = "gate";
  const next = await capture(state, input(state, "Other"));
  assert.equal(next.material_id, first.material_id);
  assert.equal(next.item_name, "Other");
  assert.equal(next.category, "Other construction supplies");
  assert.equal(next.entry_type, "Delivery");
});

test("arrival CSV labels legacy arrival time without inventing a recorded-at timestamp", async () => {
  const state = createDemoState();
  const legacy: Delivery = {
    ...state.deliveries[0],
    arrival_at: "2026-10-01T08:35:00Z",
    created_at: "2026-10-02T11:45:00Z",
    recorded_at: undefined,
  };
  state.deliveries = [legacy];
  state.role = "supervisor";
  const report = await (
    await call(
      state,
      "/api/reports?view=arrivals&from=2026-10-01&to=2026-10-01",
    )
  ).text();
  assert(report.includes('"2026-10-01","09:35"'));
  assert(report.includes(`"","${legacy.created_at}","${legacy.id}"`));
  // A smart row displays its save timestamp while preserving the arrival filter.
  legacy.recorded_at = "2026-10-01T10:05:00Z";
  const recorded = await (
    await call(
      state,
      "/api/reports?view=arrivals&from=2026-10-01&to=2026-10-01",
    )
  ).text();
  assert(recorded.includes('"2026-10-01","11:05"'));
  assert(
    recorded.includes(
      `"${legacy.recorded_at}","${legacy.created_at}","${legacy.id}"`,
    ),
  );
});
