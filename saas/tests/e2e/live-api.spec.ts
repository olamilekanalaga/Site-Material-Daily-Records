import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Bootstrap, Delivery, Marshal } from "../../src/lib/types";

// These requests exercise the authenticated server adapter, not browser demo state.
const baseURL = "http://127.0.0.1:3100";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);
type BoundMarshal = Marshal & { can_record?: boolean; user_id?: string | null };
let gate: APIRequestContext;
let supervisor: APIRequestContext;
let outsider: APIRequestContext;
let anonymous: APIRequestContext;
let boot: Bootstrap;
let marshal: BoundMarshal;

async function signIn(email: string, portal: "marshal" | "supervisor") {
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const response = await context.post("/api/auth/login", {
    data: { email, password: "DemoPass123!", portal },
  });
  expect(response.status(), await response.text()).toBe(200);
  return context;
}
async function bootstrap(context: APIRequestContext) {
  const response = await context.get("/api/bootstrap");
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Bootstrap;
}
function fields(patch: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    site_id: marshal.site_id,
    material_id: boot.materials.find((item) => item.name === "6F5")!.id,
    supplier_id: boot.suppliers.find((item) => item.active)!.id,
    marshal_id: marshal.id,
    supplier_name: "",
    capture_kind: "arrival",
    arrival_at: "2001-01-01T01:00:00.000Z",
    recorded_at: "2001-01-01T01:00:00.000Z",
    intent: "draft",
    ...patch,
  };
}
async function post(context: APIRequestContext, input: object) {
  return context.post("/api/log-deliveries", { data: input });
}
async function draft(input: object) {
  const response = await post(gate, input);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).delivery as Delivery;
}
async function upload(deliveryId: string, id = randomUUID()) {
  const response = await gate.post(`/api/deliveries/${deliveryId}/evidence`, {
    multipart: {
      id,
      kind: "ticket",
      file: { name: "test-ticket.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return id;
}
async function save(input: ReturnType<typeof fields>) {
  const first = await draft(input);
  const evidenceId = await upload(first.id);
  const response = await post(gate, {
    ...input,
    intent: "submit",
    version: first.version,
  });
  expect(response.status(), await response.text()).toBe(200);
  return { delivery: (await response.json()).delivery as Delivery, evidenceId };
}

test.beforeAll(async () => {
  gate = await signIn("gate@demo.invalid", "marshal");
  supervisor = await signIn("supervisor@demo.invalid", "supervisor");
  outsider = await signIn("other@demo.invalid", "marshal");
  anonymous = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  boot = await bootstrap(gate);
  const permitted = (boot.marshals || []).filter(
    (item) => (item as BoundMarshal).can_record,
  );
  expect(permitted).toHaveLength(1);
  marshal = permitted[0] as BoundMarshal;
  expect(marshal.user_id).toBe(boot.actor.id);
});

test.afterAll(async () => {
  await Promise.all(
    [gate, supervisor, outsider, anonymous]
      .filter(Boolean)
      .map((context) => context.dispose()),
  );
});

test("live capture requires an approved account, its bound marshal and an authorised site", async () => {
  expect((await post(anonymous, fields())).status()).toBe(401);
  expect((await post(supervisor, fields())).status()).toBe(403);
  const colleague = (boot.marshals || []).find(
    (item) => item.id !== marshal.id,
  );
  expect(colleague).toBeTruthy();
  expect(
    (await post(gate, fields({ marshal_id: colleague!.id }))).status(),
  ).toBe(403);
  const foreign = await bootstrap(outsider);
  expect(
    (await post(gate, fields({ site_id: foreign.sites[0].id }))).status(),
  ).toBe(403);
  expect(
    (
      await post(gate, fields({ material_id: foreign.materials[0].id }))
    ).status(),
  ).toBe(400);
  for (const patch of [
    { material_id: "", custom_item_name: "   " },
    { material_id: "", custom_item_name: "!?!" },
    { supplier_id: "", custom_supplier_name: "   " },
    { selected_category: "A guessed category" },
  ])
    expect((await post(gate, fields(patch))).status()).toBe(400);
  expect((await gate.get("/api/bootstrap?portal=supervisor")).status()).toBe(
    403,
  );
  const bypassId = randomUUID();
  const legacy = await gate.post("/api/deliveries", {
    data: {
      id: bypassId,
      site_id: marshal.site_id,
      material_id: boot.materials.find((item) => item.name === "6F5")!.id,
      supplier_id: null,
      vehicle: "",
      ticket_number: "",
      ticket_quantity: null,
      ticket_unit: "loads",
      arrival_at: new Date().toISOString(),
      notes: "Attempt to bypass live profile and photo checks",
      intent: "submit",
    },
  });
  expect([400, 403]).toContain(legacy.status());
  expect(
    (await bootstrap(gate)).deliveries.some((row) => row.id === bypassId),
  ).toBe(false);
  const withoutSupplier = await save(
    fields({ supplier_id: "", supplier_name: "" }),
  );
  expect(withoutSupplier.delivery.supplier_id).toBeNull();
  expect(withoutSupplier.delivery.supplier_name || "").toBe("");
  expect(withoutSupplier.delivery.status).toBe("Submitted");
});

test("manual material and supplier names persist once and remain reusable while classification is pending", async () => {
  const suffix = randomUUID().slice(0, 8);
  const materialName = `Site  Panel ${suffix}`;
  const supplierName = `Gate  Supplier ${suffix}`;
  const first = await save(
    fields({
      material_id: "",
      custom_item_name: materialName,
      supplier_id: "",
      custom_supplier_name: supplierName,
      selected_category: "Other Materials",
    }),
  );
  const second = await save(
    fields({
      material_id: "",
      custom_item_name: materialName.toLowerCase().replace(/\s+/g, " "),
      supplier_id: "",
      custom_supplier_name: supplierName.toUpperCase().replace(/\s+/g, " "),
      selected_category: "Other Materials",
    }),
  );
  expect(second.delivery.material_id).toBe(first.delivery.material_id);
  expect(second.delivery.supplier_id).toBe(first.delivery.supplier_id);
  expect(first.delivery.item_name).toBe(materialName);
  expect(first.delivery.entry_type).toBe("Pending review");
  expect(first.delivery.status).toBe("Submitted");
  expect(first.delivery.accepted_quantity).toBeNull();
  const restored = await bootstrap(gate);
  expect(
    restored.materials.filter((item) => item.id === first.delivery.material_id),
  ).toHaveLength(1);
  expect(
    restored.materials.find((item) => item.id === first.delivery.material_id)
      ?.approval_status,
  ).toBe("Pending");
  expect(
    restored.suppliers.filter((item) => item.id === first.delivery.supplier_id),
  ).toHaveLength(1);
  const reused = await save(
    fields({
      material_id: first.delivery.material_id,
      supplier_id: first.delivery.supplier_id,
    }),
  );
  expect(reused.delivery.material_id).toBe(first.delivery.material_id);
  expect(reused.delivery.supplier_id).toBe(first.delivery.supplier_id);
  expect(reused.delivery.entry_type).toBe("Pending review");
});

test("server timestamps ignore a form-open clock and a correction needs an explanation without changing creation time", async () => {
  const before = Date.now();
  const first = await draft(
    fields({
      created_at: "2001-01-01",
      status: "Accepted",
      created_by: randomUUID(),
    }),
  );
  expect(Date.parse(first.recorded_at!)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(first.recorded_at!)).toBeLessThanOrEqual(Date.now());
  expect(first.arrival_at).toBe(first.recorded_at);
  expect(first.created_at).toBe(first.recorded_at);
  expect(first.created_by).toBe(boot.actor.id);
  expect(first.status).toBe("Draft");
  const correctedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  expect(
    (await post(gate, fields({ corrected_arrival_at: correctedAt }))).status(),
  ).toBe(400);
  expect(
    (
      await post(
        gate,
        fields({
          corrected_arrival_at: new Date(Date.now() + 3_600_000).toISOString(),
          correction_reason: "Future",
        }),
      )
    ).status(),
  ).toBe(400);
  const input = fields({
    corrected_arrival_at: correctedAt,
    correction_reason: "Recorded after the queue cleared",
  });
  const saved = await save(input);
  expect(saved.delivery.arrival_at).toBe(correctedAt);
  expect(Date.parse(saved.delivery.recorded_at!)).toBeGreaterThan(
    Date.parse(correctedAt),
  );
  expect(saved.delivery.created_at).toBe(saved.delivery.recorded_at);
  expect(
    (saved.delivery as Delivery & { correction_reason: string })
      .correction_reason,
  ).toBe("Recorded after the queue cleared");
  expect(
    (
      await post(gate, { ...input, correction_reason: "Replaced explanation" })
    ).status(),
  ).toBe(409);
});

test("upload failure and repeated submissions cannot complete without evidence or create duplicate arrivals", async () => {
  const input = fields();
  const responses = await Promise.all([post(gate, input), post(gate, input)]);
  for (const response of responses)
    expect(response.status(), await response.text()).toBe(200);
  const created = (await responses[0].json()).delivery as Delivery;
  expect(
    (
      await post(gate, { ...input, intent: "submit", version: created.version })
    ).status(),
  ).toBe(400);
  const invalid = await gate.post(`/api/deliveries/${created.id}/evidence`, {
    multipart: {
      id: randomUUID(),
      kind: "ticket",
      file: {
        name: "not-a-photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("invalid"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  expect(
    (await bootstrap(gate)).deliveries.find((row) => row.id === input.id)
      ?.submitted_at,
  ).toBeNull();
  const photoId = await upload(created.id);
  await upload(created.id, photoId);
  const finalInput = { ...input, intent: "submit", version: created.version };
  const submissions = await Promise.all([
    post(gate, finalInput),
    post(gate, finalInput),
  ]);
  for (const response of submissions)
    expect(response.status(), await response.text()).toBe(200);
  const restored = await bootstrap(gate);
  const saved = restored.deliveries.filter((row) => row.id === input.id);
  expect(saved).toHaveLength(1);
  expect(saved[0].evidence).toHaveLength(1);
  expect(saved[0].recorded_at).toBe(created.recorded_at);
  expect(saved[0].submitted_at).toBeTruthy();
  const differentSupplier = boot.suppliers.find(
    (item) => item.id !== input.supplier_id,
  )!;
  expect(
    (
      await post(gate, { ...input, supplier_id: differentSupplier.id })
    ).status(),
  ).toBe(409);
});

test("an independently authenticated supervisor reads the shared record and private photo while outsiders are denied", async () => {
  const input = fields({
    supplier_id: "",
    custom_supplier_name: `Shared supplier ${randomUUID().slice(0, 8)}`,
  });
  const { delivery, evidenceId } = await save(input);
  const separate = await signIn("supervisor@demo.invalid", "supervisor");
  try {
    const records = await bootstrap(separate);
    expect(
      records.deliveries.find((row) => row.id === delivery.id)?.supplier_id,
    ).toBe(delivery.supplier_id);
    const photo = await separate.get(`/api/evidence/${evidenceId}`);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["cache-control"]).toContain("no-store");
    expect(await photo.body()).toEqual(png);
    expect(
      (await bootstrap(separate)).deliveries.some(
        (row) => row.id === delivery.id,
      ),
    ).toBe(true);
    expect((await anonymous.get(`/api/evidence/${evidenceId}`)).status()).toBe(
      401,
    );
    expect((await outsider.get(`/api/evidence/${evidenceId}`)).status()).toBe(
      404,
    );
    expect(
      (await bootstrap(outsider)).deliveries.some(
        (row) => row.id === delivery.id,
      ),
    ).toBe(false);
    expect((await post(outsider, input)).status()).toBe(403);
  } finally {
    await separate.dispose();
  }
});

test("live exports apply date, material and supplier filters to persistent submitted records", async () => {
  const supplierName = `CSV supplier ${randomUUID().slice(0, 8)}`;
  const { delivery } = await save(
    fields({ supplier_id: "", custom_supplier_name: supplierName }),
  );
  // This later-created record arrived earlier. The export must follow the
  // displayed delivery time, retaining recording time separately for audit.
  const { delivery: lateEntry } = await save(
    fields({
      supplier_id: delivery.supplier_id,
      corrected_arrival_at: new Date(
        Date.parse(delivery.arrival_at) - 60 * 60 * 1000,
      ).toISOString(),
      correction_reason: "Earlier arrival recorded after the queue cleared",
    }),
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  });
  const params = new URLSearchParams({
    view: "arrivals",
    format: "csv",
    site_id: delivery.site_id,
    from: formatter.format(new Date(lateEntry.arrival_at)),
    to: formatter.format(new Date(delivery.arrival_at)),
    material_id: delivery.material_id,
    supplier_id: delivery.supplier_id!,
  });
  const csv = await supervisor.get(`/api/reports?${params}`);
  expect(csv.status(), await csv.text()).toBe(200);
  const body = await csv.text();
  expect(body).toContain(supplierName);
  expect(body.trim().split(/\r?\n/)).toHaveLength(3);
  expect(body).toContain("6F5");
  expect(body.indexOf(delivery.id)).toBeGreaterThanOrEqual(0);
  expect(body.indexOf(lateEntry.id)).toBeGreaterThanOrEqual(0);
  expect(body.indexOf(delivery.id)).toBeLessThan(body.indexOf(lateEntry.id));
  params.set("movement_view", "Materials");
  const materials = await supervisor.get(`/api/reports?${params}`);
  expect(materials.status()).toBe(200);
  expect(await materials.text()).toContain(delivery.id);
  params.set("movement_view", "Services");
  const services = await supervisor.get(`/api/reports?${params}`);
  expect(services.status()).toBe(200);
  expect(await services.text()).not.toContain(delivery.id);
  params.delete("movement_view");
  params.set("from", "2000-01-01");
  params.set("to", "2000-01-01");
  const excluded = await supervisor.get(`/api/reports?${params}`);
  expect(excluded.status()).toBe(200);
  expect(await excluded.text()).not.toContain(supplierName);
});
