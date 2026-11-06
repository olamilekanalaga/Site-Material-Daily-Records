import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type {
  Bootstrap,
  SimpleDeliveryInput,
  Delivery,
} from "../../src/lib/types";

const baseURL = "http://127.0.0.1:3100";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);
let gate: APIRequestContext,
  supervisor: APIRequestContext,
  admin: APIRequestContext,
  anonymous: APIRequestContext,
  boot: Bootstrap;
async function login(email: string) {
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const response = await context.post("/api/auth/login", {
    data: { email, password: "DemoPass123!" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return context;
}
const fields = (
  patch: Partial<SimpleDeliveryInput> = {},
): SimpleDeliveryInput => ({
  id: randomUUID(),
  site_id: boot.sites[0].id,
  material_id: boot.materials[0].id,
  marshal_id: boot.marshals![1].id,
  supplier_name: `Fictional supplier ${randomUUID().slice(0, 8)}`,
  arrival_at: new Date().toISOString(),
  intent: "draft",
  ...patch,
});
async function post(context: APIRequestContext, input: SimpleDeliveryInput) {
  return context.post("/api/log-deliveries", { data: input });
}
async function draft(input: SimpleDeliveryInput) {
  const response = await post(gate, input);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).delivery as Delivery;
}
async function photo(deliveryId: string, id = randomUUID()) {
  const response = await gate.post(`/api/deliveries/${deliveryId}/evidence`, {
    multipart: {
      id,
      kind: "load",
      file: { name: "fictional-load.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return id;
}
test.beforeAll(async () => {
  gate = await login("gate@demo.invalid");
  supervisor = await login("supervisor@demo.invalid");
  admin = await login("admin@demo.invalid");
  anonymous = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  boot = await (await gate.get("/api/bootstrap")).json();
});
test.afterAll(async () => {
  await Promise.all(
    [gate, supervisor, admin, anonymous]
      .filter(Boolean)
      .map((c) => c.dispose()),
  );
});

test("simple logging API requires authentication, validated fields and a recording role", async () => {
  expect((await post(anonymous, fields())).status()).toBe(401);
  expect((await post(supervisor, fields())).status()).toBe(403);
  expect((await post(gate, fields({ supplier_name: " " }))).status()).toBe(400);
  expect(
    (await post(gate, fields({ marshal_id: randomUUID() }))).status(),
  ).toBe(403);
  expect(
    (await post(gate, fields({ material_id: randomUUID() }))).status(),
  ).toBe(400);
  const forged = {
    ...fields(),
    created_by: boot.marshals![1].id,
    submitted_at: "2000-01-01",
    marshal_name: "Forged",
    status: "Accepted",
  };
  const created = await draft(forged);
  expect(created.created_by).toBe(boot.actor.id);
  expect(created.marshal_name).toBe(boot.marshals![1].name);
  expect(created.submitted_at).toBeNull();
  expect(created.status).toBe("Draft");
});

test("simple photo delivery persists and an authenticated supervisor can inspect its private image", async () => {
  const input = fields();
  const started = Date.now();
  const created = await draft(input);
  const imageId = await photo(created.id);
  const response = await post(gate, {
    ...input,
    intent: "submit",
    version: created.version,
  });
  expect(response.status(), await response.text()).toBe(200);
  const saved: Delivery = (await response.json()).delivery;
  expect(saved.vehicle).toBe("");
  expect(saved.ticket_quantity).toBeNull();
  expect(saved.accepted_quantity).toBeNull();
  expect(saved.status).toBe("Submitted");
  expect(saved.marshal_id).toBe(input.marshal_id);
  expect(saved.created_by).toBe(boot.actor.id);
  expect(Date.parse(saved.created_at)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(saved.submitted_at!)).toBeGreaterThanOrEqual(started);
  const restored = await login("supervisor@demo.invalid");
  const records: Bootstrap = await (
    await restored.get("/api/bootstrap")
  ).json();
  expect(records.deliveries.find((d) => d.id === saved.id)?.supplier_name).toBe(
    input.supplier_name,
  );
  const image = await restored.get(`/api/evidence/${imageId}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toContain("no-store");
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(await image.body()).toEqual(png);
  expect((await anonymous.get(`/api/evidence/${imageId}`)).status()).toBe(401);
  await restored.dispose();
});

test("missing image, changed payload and legacy mutation cannot bypass completion controls", async () => {
  const input = fields();
  expect((await post(gate, { ...input, intent: "submit" })).status()).toBe(400);
  const created = await draft(input);
  expect(
    (
      await post(gate, { ...input, intent: "submit", version: created.version })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(gate, { ...input, supplier_name: "Replaced supplier" })
    ).status(),
  ).toBe(409);
  const legacy = await gate.patch(`/api/deliveries/${created.id}`, {
    data: {
      id: created.id,
      site_id: created.site_id,
      material_id: created.material_id,
      supplier_id: null,
      vehicle: "",
      ticket_number: "",
      ticket_quantity: null,
      ticket_unit: "loads",
      arrival_at: created.arrival_at,
      notes: "",
      intent: "submit",
      version: created.version,
    },
  });
  expect(legacy.status()).toBe(409);
  await photo(created.id);
  expect(
    (await post(gate, { ...input, intent: "submit", version: 99 })).status(),
  ).toBe(409);
});

test("double clicks and response-loss retries create only one saved delivery", async () => {
  const input = fields();
  const [a, b] = await Promise.all([post(gate, input), post(gate, input)]);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
  const created: Delivery = (await a.json()).delivery;
  expect((await b.json()).delivery.created_at).toBe(created.created_at);
  const imageId = await photo(input.id);
  await photo(input.id, imageId);
  const submit = {
    ...input,
    intent: "submit" as const,
    version: created.version,
  };
  const results = await Promise.all([post(gate, submit), post(gate, submit)]);
  for (const result of results)
    expect(result.status(), await result.text()).toBe(200);
  const data: Bootstrap = await (await gate.get("/api/bootstrap")).json();
  const rows = data.deliveries.filter((d) => d.id === input.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].evidence).toHaveLength(1);
  expect(rows[0].status).toBe("Submitted");
});

test("another marshal login cannot read a peer's records or photographs", async () => {
  const email = `peer-${randomUUID().slice(0, 8)}@demo.invalid`;
  const member = await admin.post("/api/admin", {
    data: {
      action: "member",
      name: "Fictional peer gate",
      email,
      password: "DemoPass123!",
      role: "gate",
      site_ids: [boot.sites[0].id],
    },
  });
  expect(member.status(), await member.text()).toBe(200);
  const input = fields();
  const created = await draft(input);
  const imageId = await photo(input.id);
  expect(
    (
      await post(gate, { ...input, intent: "submit", version: created.version })
    ).ok(),
  ).toBe(true);
  const peer = await login(email);
  const data: Bootstrap = await (await peer.get("/api/bootstrap")).json();
  expect(data.deliveries.some((d) => d.id === input.id)).toBe(false);
  expect(data.audit.some((a) => a.entity_id === input.id)).toBe(false);
  expect((await peer.get(`/api/evidence/${imageId}`)).status()).toBe(404);
  expect((await post(peer, input)).status()).toBe(403);
  await peer.dispose();
});
