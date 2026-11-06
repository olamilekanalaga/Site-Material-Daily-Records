import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { local } from "../../src/lib/server/local";
import { parseSimpleDelivery, parseDelivery } from "../../src/lib/server/core";
import type {
  Actor,
  Bootstrap,
  SimpleDeliveryInput,
} from "../../src/lib/types";

const folder = mkdtempSync(join(tmpdir(), "djcu-simple-local-"));
const oldMode = process.env.APP_MODE;
const oldDir = process.env.LOCAL_DATA_DIR;
let gate: Actor, supervisor: Actor, outsider: Actor, boot: Bootstrap;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
before(() => {
  process.env.APP_MODE = "local";
  process.env.LOCAL_DATA_DIR = folder;
  gate = local.actor(
    local.login("gate@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  supervisor = local.actor(
    local.login("supervisor@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  outsider = local.actor(
    local.login("other@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  boot = local.bootstrap(gate);
});
after(() => {
  if (oldMode === undefined) delete process.env.APP_MODE;
  else process.env.APP_MODE = oldMode;
  if (oldDir === undefined) delete process.env.LOCAL_DATA_DIR;
  else process.env.LOCAL_DATA_DIR = oldDir;
  rmSync(folder, { recursive: true, force: true });
});
const input = (patch: Partial<SimpleDeliveryInput> = {}) =>
  parseSimpleDelivery({
    id: randomUUID(),
    site_id: boot.sites[0].id,
    material_id: boot.materials[0].id,
    marshal_id: boot.marshals![0].id,
    supplier_name: "  Sample Supplier  ",
    arrival_at: new Date().toISOString(),
    intent: "draft",
    ...patch,
  });
function attach(id: string) {
  const photoId = randomUUID();
  local.evidence(gate, id, photoId, "load", "fictional.png", "image/png", png);
  return photoId;
}

test("simple capture validates only logging fields and does not accept forged identities", () => {
  const parsed = parseSimpleDelivery({
    ...input(),
    creator_name: "Forged",
    created_by: outsider.id,
    submitted_at: "2001-01-01",
    accepted_quantity: 1,
  });
  assert.equal(parsed.supplier_name, "Sample Supplier");
  assert(!("vehicle" in parsed));
  assert(!("created_by" in parsed));
  assert(!("submitted_at" in parsed));
  for (const patch of [
    { supplier_name: " " },
    { supplier_name: "a".repeat(201) },
    { marshal_id: "not-a-uuid" },
    { material_id: "" },
    { arrival_at: "not a date" },
    { arrival_at: new Date(Date.now() + 3600000).toISOString() },
    { version: 0 },
  ])
    assert.throws(() => input(patch as Partial<SimpleDeliveryInput>));
});

test("authenticated logging persists marshal, supplier, photo and separate server timestamps", () => {
  const fields = input();
  const started = Date.now();
  const { delivery: draft } = local.log(gate, fields);
  assert.equal(draft.status, "Draft");
  assert.equal(draft.submitted_at, null);
  assert.equal(draft.marshal_name, boot.marshals![0].name);
  assert.equal(draft.created_by, gate.id);
  assert.notEqual(draft.marshal_id, gate.id);
  assert(draft.created_at && Date.parse(draft.created_at) >= started);
  const evidenceId = attach(draft.id);
  const submitted = local.log(gate, {
    ...fields,
    intent: "submit",
    version: draft.version,
  }).delivery;
  assert.equal(submitted.status, "Submitted");
  assert.equal(submitted.accepted_quantity, null);
  assert(submitted.submitted_at);
  assert.equal(submitted.vehicle, "");
  assert.equal(submitted.evidence[0].id, evidenceId);
  const reader = new DatabaseSync(join(folder, "pilot.sqlite"), {
    readOnly: true,
  });
  const persisted = reader
    .prepare("SELECT body FROM objects WHERE kind='delivery' AND id=?")
    .get(submitted.id) as { body: string };
  assert.equal(JSON.parse(persisted.body).supplier_name, "Sample Supplier");
  assert(reader.prepare("SELECT data FROM files WHERE id=?").get(evidenceId));
  reader.close();
  assert(
    local.bootstrap(supervisor).deliveries.some((d) => d.id === submitted.id),
  );
  assert.deepEqual(local.file(supervisor, evidenceId).data, png);
});

test("simple logging retries are idempotent and cannot finalize altered or photo-less records", () => {
  const fields = input();
  assert.throws(
    () => local.log(gate, { ...fields, intent: "submit" }),
    /draft.*image/,
  );
  const draft = local.log(gate, fields).delivery;
  assert.equal(local.log(gate, fields).delivery.created_at, draft.created_at);
  assert.throws(
    () => local.log(gate, { ...fields, supplier_name: "Different" }),
    /details differ/,
  );
  assert.throws(
    () =>
      local.log(gate, { ...fields, intent: "submit", version: draft.version }),
    /image/,
  );
  attach(fields.id);
  assert.throws(
    () => local.log(gate, { ...fields, intent: "submit", version: 99 }),
    /changed/,
  );
  const submitted = local.log(gate, {
    ...fields,
    intent: "submit",
    version: draft.version,
  }).delivery;
  const repeated = local.log(gate, {
    ...fields,
    intent: "submit",
    version: draft.version,
  }).delivery;
  assert.equal(repeated.submitted_at, submitted.submitted_at);
  assert.equal(repeated.version, submitted.version);
  assert.equal(
    local.bootstrap(gate).deliveries.filter((d) => d.id === fields.id).length,
    1,
  );
});

test("marshal catalogues stay company/site scoped and capture roles remain enforced", () => {
  assert.deepEqual(boot.marshals!.map((m) => m.name).sort(), [
    "B",
    "Olamilekan Alaga",
  ]);
  assert.equal(local.bootstrap(gate).marshals!.length, 2);
  const foreign = local.bootstrap(outsider).marshals![0];
  assert.throws(
    () => local.log(gate, input({ marshal_id: foreign.id })),
    /marshal/,
  );
  assert.throws(() => local.log(supervisor, input()), /cannot record/);
  assert.throws(() => local.log(outsider, input()), /Site not found/);
});

test("renaming the original local marshal keeps saved delivery references intact", () => {
  const marshal = boot.marshals!.find((m) => m.name === "B")!;
  const saved = local.log(gate, input({ marshal_id: marshal.id })).delivery;
  const connection = new DatabaseSync(join(folder, "pilot.sqlite"));
  try {
    connection
      .prepare("UPDATE objects SET body=? WHERE kind='marshal' AND id=?")
      .run(
        JSON.stringify({ ...marshal, name: "B Traffic Marshal" }),
        marshal.id,
      );
  } finally {
    connection.close();
  }
  const migrated = local.bootstrap(gate);
  assert.equal(migrated.marshals!.length, 2);
  assert.equal(migrated.marshals!.find((m) => m.id === marshal.id)?.name, "B");
  assert.equal(
    migrated.deliveries.find((d) => d.id === saved.id)?.marshal_id,
    marshal.id,
  );
  assert.equal(local.bootstrap(gate).marshals!.length, 2);
});

test("gate access is limited to own records/photos while selected marshal remains distinct from authentication", () => {
  const fields = input({ marshal_id: boot.marshals![1].id });
  const draft = local.log(gate, fields).delivery;
  const photoId = attach(fields.id);
  local.log(gate, { ...fields, intent: "submit", version: draft.version });
  const admin = local.actor(
    local.login("admin@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  const secondId = randomUUID();
  local.admin(admin, {
    action: "member",
    name: "Second gate",
    email: "second@demo.invalid",
    role: "gate",
    site_ids: gate.site_ids,
    password: "DemoPass123!",
    id: secondId,
  });
  const second = local.actor(
    local.login("second@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  assert(!local.bootstrap(second).deliveries.some((d) => d.id === fields.id));
  assert(!local.bootstrap(second).audit.some((a) => a.entity_id === fields.id));
  assert.throws(() => local.file(second, photoId), /not found/);
  assert.throws(() => local.log(second, fields), /does not belong/);
  assert.equal(
    local.bootstrap(supervisor).deliveries.find((d) => d.id === fields.id)
      ?.marshal_name,
    "Olamilekan Alaga",
  );
});

test("legacy endpoints cannot bypass simple delivery image requirements or rewrite historical records", () => {
  const fields = input();
  const draft = local.log(gate, fields).delivery;
  const legacy = parseDelivery({
    id: draft.id,
    site_id: draft.site_id,
    material_id: draft.material_id,
    supplier_id: null,
    vehicle: "",
    ticket_number: "",
    ticket_quantity: null,
    ticket_unit: "loads",
    arrival_at: draft.arrival_at,
    notes: "",
    intent: "submit",
    version: draft.version,
  });
  assert.throws(() => local.save(gate, legacy, true), /logging endpoint/);
  const historical = boot.deliveries[0];
  assert.throws(
    () => local.log(gate, { ...fields, id: historical.id }),
    /another delivery/,
  );
  assert.equal(
    local.bootstrap(gate).deliveries.find((d) => d.id === historical.id)
      ?.status,
    historical.status,
  );
});

test("a supervisor reassigned as gate cannot retrieve former review snapshots", () => {
  const admin = local.actor(
    local.login("admin@demo.invalid", "DemoPass123!", "simple-local-test"),
  );
  const email = "reassigned@demo.invalid";
  const member = {
    action: "member",
    name: "Reassigned supervisor",
    email,
    role: "supervisor",
    site_ids: gate.site_ids,
    password: "DemoPass123!",
  };
  local.admin(admin, member);
  const token = local.login(email, "DemoPass123!", "simple-local-test");
  const reviewer = local.actor(token);
  const fields = input();
  const draft = local.log(gate, fields).delivery;
  attach(fields.id);
  const submitted = local.log(gate, {
    ...fields,
    intent: "submit",
    version: draft.version,
  }).delivery;
  local.review(reviewer, fields.id, {
    decision: "Flagged",
    reason: "Sample investigation",
    accepted_quantity: null,
    accepted_unit: null,
    version: submitted.version,
  });
  assert(
    local.bootstrap(reviewer).audit.some((a) => a.entity_id === fields.id),
  );
  local.admin(admin, { ...member, role: "gate", user_id: reviewer.id });
  const reassigned = local.actor(token);
  assert.equal(reassigned.role, "gate");
  assert.equal(local.bootstrap(reassigned).audit.length, 0);
  assert(
    !local.bootstrap(reassigned).deliveries.some((d) => d.id === fields.id),
  );
});
