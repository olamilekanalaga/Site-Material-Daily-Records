import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n: number) =>
  `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1),
  otherCompany = id(2),
  site = id(3),
  otherSite = id(4),
  hiddenSite = id(5);
const gate = id(10),
  colleague = id(11),
  supervisor = id(12),
  outsider = id(13),
  platform = id(14);
const material = id(20),
  otherMaterial = id(21),
  legacy = id(30),
  delivery = id(31),
  photo = id(40);
let marshal: string;
let legacyBefore: unknown;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function rpc(name: string, input?: unknown) {
  const result =
    input === undefined
      ? await db.query<{ r: any }>(`select ${name}() r`)
      : await db.query<{ r: any }>(`select ${name}($1::jsonb) r`, [
          JSON.stringify(input),
        ]);
  return result.rows[0].r;
}
const capture = (overrides: Record<string, unknown> = {}) => ({
  id: delivery,
  site_id: site,
  material_id: material,
  marshal_id: marshal,
  supplier_name: "Sample supplier",
  arrival_at: "2026-10-20T10:30:00Z",
  intent: "draft",
  ...overrides,
});
async function upload(did: string, eid: string) {
  const path = `${company}/${site}/${did}/${eid}`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
    [path],
  );
  await db.query("select register_evidence($1,$2::jsonb)", [
    did,
    JSON.stringify({
      id: eid,
      kind: "load",
      name: "sample.png",
      mime: "image/png",
      size: 42,
      storage_path: path,
      sha256: "a".repeat(64),
    }),
  ]);
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public,storage to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611050001_delivery_pilot.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`insert into companies(id,name) values('${company}','Sample company'),('${otherCompany}','Other company');
    insert into auth.users(id,email,raw_user_meta_data) values
    ('${gate}','gate@example.invalid','{"name":"Existing marshal"}'),('${colleague}','second@example.invalid','{"name":"Second marshal"}'),
    ('${supervisor}','supervisor@example.invalid','{"name":"Sample supervisor"}'),('${outsider}','outsider@example.invalid','{}'),('${platform}','platform@example.invalid','{}');
    insert into company_memberships(company_id,user_id,role) values('${company}','${gate}','gate'),('${company}','${colleague}','gate'),('${company}','${supervisor}','supervisor'),('${otherCompany}','${outsider}','gate'),('${company}','${platform}','platform_admin');
    insert into sites(id,company_id,name) values('${site}','${company}','Sample site'),('${hiddenSite}','${company}','Unassigned site'),('${otherSite}','${otherCompany}','Other site');
    insert into site_assignments(company_id,site_id,user_id) values('${company}','${site}','${gate}'),('${company}','${site}','${colleague}'),('${company}','${site}','${supervisor}'),('${otherCompany}','${otherSite}','${outsider}');
    insert into materials(id,company_id,name) values('${material}','${company}','Type 1'),('${otherMaterial}','${otherCompany}','Other material');`);
  await as(gate);
  await rpc("save_delivery", {
    id: legacy,
    site_id: site,
    material_id: material,
    supplier_id: null,
    vehicle: "OLD 001",
    ticket_number: "OLD-TICKET",
    ticket_quantity: 12.5,
    ticket_unit: "tonnes",
    arrival_at: "2026-10-01T09:00:00Z",
    notes: "Legacy record retained",
    intent: "submit",
  });
  legacyBefore = (
    await db.query<{ data: unknown }>(
      "select to_jsonb(d) data from delivery_records d where id=$1",
      [legacy],
    )
  ).rows[0].data;
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611060001_simple_delivery_log.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await as(gate);
  marshal = (await rpc("app_bootstrap")).marshals.find(
    (m: any) => m.name === "Existing marshal",
  ).id;
});
after(async () => {
  await db.close();
});

test("simple SQL upgrade preserves every legacy value and backfills existing assigned marshal names", async () => {
  await as(gate);
  const row = (
    await db.query<any>(
      "select to_jsonb(d) data from delivery_records d where id=$1",
      [legacy],
    )
  ).rows[0].data;
  const { marshal_id, marshal_name, supplier_name, capture_mode, ...original } =
    row;
  assert.deepEqual(original, legacyBefore);
  assert.equal(capture_mode, "legacy");
  assert.equal(marshal_id, null);
  assert.equal(marshal_name, null);
  assert.equal(supplier_name, null);
  const boot = await rpc("app_bootstrap");
  assert.deepEqual(
    boot.marshals.map((m: any) => m.name),
    ["Existing marshal", "Second marshal"],
  );
  assert(!boot.marshals.some((m: any) => m.company_id === otherCompany));
});

test("simple SQL records only submitted image-backed captures and prevents duplicate/mutated retries", async () => {
  await as(gate);
  await assert.rejects(
    rpc("log_delivery", capture({ intent: "submit" })),
    /draft.*image/i,
  );
  const draft = (await rpc("log_delivery", capture())).delivery;
  assert.equal(draft.status, "Draft");
  assert.equal(draft.submitted_at, null);
  assert.equal(draft.vehicle, "");
  assert.equal(draft.ticket_quantity, null);
  assert.equal(draft.marshal_name, "Existing marshal");
  assert.equal(draft.creator_name, "Existing marshal");
  assert.equal((await rpc("log_delivery", capture())).delivery.version, 1);
  await assert.rejects(
    rpc("log_delivery", capture({ supplier_name: "Changed" })),
    /different delivery/,
  );
  await assert.rejects(
    rpc("log_delivery", capture({ intent: "submit", version: 1 })),
    /image/,
  );
  await upload(delivery, photo);
  await assert.rejects(
    rpc("log_delivery", capture({ intent: "submit", version: 2 })),
    /Record changed/,
  );
  const saved = (
    await rpc("log_delivery", capture({ intent: "submit", version: 1 }))
  ).delivery;
  assert.equal(saved.status, "Submitted");
  assert.ok(saved.submitted_at);
  assert.equal(saved.accepted_quantity, null);
  assert.equal(saved.reviews.length, 0);
  assert.equal(saved.evidence.length, 1);
  const retry = (
    await rpc("log_delivery", capture({ intent: "submit", version: 1 }))
  ).delivery;
  assert.equal(retry.submitted_at, saved.submitted_at);
  assert.equal(retry.version, 2);
  assert.equal((await rpc("log_delivery", capture())).delivery.version, 2);
  assert.equal(
    (await db.query("select * from delivery_records where id=$1", [delivery]))
      .rows.length,
    1,
  );
  await as(supervisor);
  assert.equal(
    (
      await db.query(
        "select * from audit_events where entity_id=$1 and action='delivery_records.update'",
        [delivery],
      )
    ).rows.length,
    1,
  );
  await as(gate);
  await assert.rejects(
    rpc("save_delivery", {
      id: delivery,
      site_id: site,
      material_id: material,
      supplier_id: null,
      vehicle: "",
      ticket_number: "",
      ticket_quantity: null,
      ticket_unit: "loads",
      arrival_at: "2026-10-20T10:30:00Z",
      notes: "",
      intent: "submit",
      version: 2,
    }),
    /simple logging endpoint/,
  );
});

test("simple SQL enforces field validation, trusted marshal snapshots and server timestamps", async () => {
  await as(gate);
  for (const bad of ["", " ", "a".repeat(201), 42, null])
    await assert.rejects(
      rpc("log_delivery", capture({ id: id(60), supplier_name: bad })),
      /Supplier/,
    );
  assert.equal(
    (
      await rpc(
        "log_delivery",
        capture({ id: id(61), supplier_name: "a".repeat(200) }),
      )
    ).delivery.supplier_name.length,
    200,
  );
  for (const bad of [null, "infinity", "2099-01-01T00:00:00Z"])
    await assert.rejects(
      rpc("log_delivery", capture({ id: id(60), arrival_at: bad })),
      /time|future/,
    );
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(60), version: null })),
    /positive integer/,
  );
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(60), material_id: otherMaterial })),
    /Material/,
  );
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(60), marshal_id: id(999) })),
    /Traffic marshal/,
  );
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(60), site_id: hiddenSite })),
    /not permitted/,
  );
  const second = (await rpc("app_bootstrap")).marshals.find(
    (m: any) => m.name === "Second marshal",
  );
  const draft = (
    await rpc(
      "log_delivery",
      capture({
        id: id(60),
        marshal_id: second.id,
        marshal_name: "Forged",
        creator_name: "Forged",
        created_by: supervisor,
        created_at: "2000-01-01T00:00:00Z",
        submitted_at: "2000-01-01T00:00:00Z",
        status: "Accepted",
        company_id: otherCompany,
      }),
    )
  ).delivery;
  assert.equal(draft.marshal_name, "Second marshal");
  assert.equal(draft.created_by, gate);
  assert.equal(draft.creator_name, "Existing marshal");
  assert.equal(draft.company_id, company);
  assert.equal(draft.status, "Draft");
  assert.equal(draft.submitted_at, null);
  assert.notEqual(draft.created_at, "2000-01-01T00:00:00+00:00");
});

test("simple SQL supervisors inspect photos while other gates and tenants cannot read them", async () => {
  await as(supervisor);
  assert.equal(
    (await rpc("app_bootstrap")).deliveries.some((d: any) => d.id === delivery),
    true,
  );
  assert.equal(
    (await db.query("select * from delivery_evidence where id=$1", [photo]))
      .rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await db.query("select audit_evidence_view($1)", [photo]);
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(70) })),
    /not permitted/,
  );
  for (const user of [colleague, outsider, platform]) {
    await as(user);
    assert.equal(
      (await db.query("select * from delivery_records where id=$1", [delivery]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from delivery_evidence where id=$1", [photo]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select app_can_read_delivery($1) allowed",
          [delivery],
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      db.query("select audit_evidence_view($1)", [photo]),
      /access denied/,
    );
    if (user !== platform) {
      const boot = await rpc("app_bootstrap");
      assert(!boot.deliveries.some((d: any) => d.id === delivery));
      assert(!boot.audit.some((a: any) => a.entity_id === delivery));
    }
  }
  await db.exec("reset role;set role anon");
  await assert.rejects(rpc("log_delivery", capture()), /permission denied/);
});

test("simple SQL role changes remove access to former supervisor audit snapshots and notifications", async () => {
  await as(supervisor);
  await db.query("select review_delivery($1,$2::jsonb)", [
    legacy,
    JSON.stringify({
      decision: "Flagged",
      reason: "Sample review",
      version: 1,
    }),
  ]);
  assert(
    (
      await db.query("select * from audit_events where actor_id=$1", [
        supervisor,
      ])
    ).rows.length > 0,
  );
  assert(
    (
      await db.query("select * from notifications where delivery_id=$1", [
        legacy,
      ])
    ).rows.length > 0,
  );
  await db.exec("reset role");
  await db.query(
    "update company_memberships set role='gate' where user_id=$1",
    [supervisor],
  );
  try {
    await as(supervisor);
    assert.equal((await db.query("select * from audit_events")).rows.length, 0);
    assert.equal(
      (
        await db.query("select * from notifications where delivery_id=$1", [
          legacy,
        ])
      ).rows.length,
      0,
    );
    const boot = await rpc("app_bootstrap");
    assert.deepEqual(boot.audit, []);
    assert(!boot.deliveries.some((d: any) => d.id === legacy));
  } finally {
    await db.exec("reset role");
    await db.query(
      "update company_memberships set role='supervisor' where user_id=$1",
      [supervisor],
    );
  }
});

test("simple SQL rejects cross-site marshal references at RPC and foreign-key levels", async () => {
  await db.exec("reset role");
  const foreignMarshal = id(80);
  await db.query(
    "insert into traffic_marshals(id,company_id,site_id,name) values($1,$2,$3,'Other marshal')",
    [foreignMarshal, company, hiddenSite],
  );
  await as(gate);
  await assert.rejects(
    rpc("log_delivery", capture({ id: id(81), marshal_id: foreignMarshal })),
    /Traffic marshal/,
  );
  await assert.rejects(
    db.query(
      "insert into traffic_marshals(company_id,site_id,name) values($1,$2,'Forged')",
      [company, site],
    ),
    /permission denied/,
  );
  await db.exec("reset role");
  await assert.rejects(
    db.query("update delivery_records set marshal_id=$1 where id=$2", [
      foreignMarshal,
      delivery,
    ]),
    /foreign key/,
  );
});
