import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL policies/RPCs, with only provider-owned Auth/Storage metadata
// mocked. A successful run does not claim hosted Auth or file-service coverage.
const db = new PGlite();
const id = (n: number) =>
  `b2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1),
  otherCompany = id(2),
  site = id(3),
  otherSite = id(4),
  hiddenSite = id(5);
const gate = id(10),
  colleague = id(11),
  supervisor = id(12),
  outsider = id(13),
  platform = id(14),
  unassigned = id(15);
const duplicateOne = id(16),
  duplicateTwo = id(17);
const material = id(20),
  foreignMaterial = id(21),
  supplier = id(22),
  foreignSupplier = id(23),
  legacy = id(30);
let ownMarshal: string, colleagueMarshal: string, unboundMarshal: string;
let legacyBefore: Record<string, unknown>;
let originalAudit: unknown[];
let storedDelivery: Record<string, any>, storedPhoto: string;

async function as(user: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user || "",
  ]);
  await db.exec(`set role ${role}`);
}
async function rpc(name: string, input?: unknown): Promise<any> {
  const result =
    input === undefined
      ? await db.query<{ result: any }>(`select ${name}() result`)
      : await db.query<{ result: any }>(`select ${name}($1::jsonb) result`, [
          JSON.stringify(input),
        ]);
  return result.rows[0].result;
}
const fields = (
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: crypto.randomUUID(),
  site_id: site,
  marshal_id: ownMarshal,
  capture_kind: "arrival",
  material_id: material,
  supplier_id: supplier,
  intent: "draft",
  ...extra,
});
async function image(deliveryId: string, evidenceId = crypto.randomUUID()) {
  const path = `${company}/${site}/${deliveryId}/${evidenceId}`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
    [path],
  );
  await db.query("select register_evidence($1,$2::jsonb)", [
    deliveryId,
    JSON.stringify({
      id: evidenceId,
      kind: "ticket",
      name: "qa-ticket.png",
      mime: "image/png",
      size: 68,
      storage_path: path,
      sha256: "c".repeat(64),
    }),
  ]);
  return evidenceId;
}
async function finish(input: Record<string, unknown>) {
  const draft = (await rpc("log_delivery", input)).delivery;
  const evidenceId = await image(draft.id);
  const delivery = (
    await rpc("log_delivery", {
      ...input,
      intent: "submit",
      version: draft.version,
    })
  ).delivery;
  return { delivery, evidenceId };
}
const refused = (work: Promise<unknown>) => assert.rejects(work);

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public,storage to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  const migration = async (name: string) =>
    db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await migration("202611050001_delivery_pilot.sql");
  await db.exec(`insert into companies(id,name) values('${company}','QA live integration'),('${otherCompany}','QA other tenant');
    insert into auth.users(id,email,raw_user_meta_data) values
    ('${gate}','gate@example.invalid','{"name":"First approved marshal"}'),('${colleague}','colleague@example.invalid','{"name":"Second approved marshal"}'),
    ('${supervisor}','supervisor@example.invalid','{"name":"QA supervisor"}'),('${outsider}','outsider@example.invalid','{"name":"Other tenant"}'),
    ('${platform}','platform@example.invalid','{"name":"Platform operator"}'),('${unassigned}','unassigned@example.invalid','{"name":"Unassigned supervisor"}'),
    ('${duplicateOne}','duplicate-one@example.invalid','{"name":"Duplicate marshal"}'),('${duplicateTwo}','duplicate-two@example.invalid','{"name":"Duplicate marshal"}');
    insert into company_memberships(company_id,user_id,role) values
    ('${company}','${gate}','gate'),('${company}','${colleague}','gate'),('${company}','${supervisor}','supervisor'),('${company}','${platform}','platform_admin'),
    ('${company}','${unassigned}','supervisor'),('${company}','${duplicateOne}','gate'),('${company}','${duplicateTwo}','gate'),('${otherCompany}','${outsider}','gate');
    insert into sites(id,company_id,name) values('${site}','${company}','QA assigned site'),('${hiddenSite}','${company}','QA unassigned site'),('${otherSite}','${otherCompany}','Other site');
    insert into site_assignments(company_id,site_id,user_id) values
    ('${company}','${site}','${gate}'),('${company}','${site}','${colleague}'),('${company}','${site}','${supervisor}'),
    ('${company}','${site}','${duplicateOne}'),('${company}','${site}','${duplicateTwo}'),('${otherCompany}','${otherSite}','${outsider}');
    insert into materials(id,company_id,name) values('${material}','${company}','Type 1'),('${foreignMaterial}','${otherCompany}','Other tenant material');
    insert into suppliers(id,company_id,name) values('${supplier}','${company}','QA Existing Supplier'),('${foreignSupplier}','${otherCompany}','Other tenant supplier');
    insert into delivery_records(id,company_id,site_id,material_id,supplier_id,arrival_at,created_by,creator_name,vehicle,ticket_number,ticket_quantity,ticket_unit,status,submitted_at)
    values('${legacy}','${company}','${site}','${material}','${supplier}','2026-10-01T09:00:00Z','${gate}','Historical creator','OLD 001','ORIGINAL-TICKET',12.5,'tonnes','Submitted','2026-10-01T09:05:00Z');`);
  await migration("202611060001_simple_delivery_log.sql");
  legacyBefore = (
    await db.query<{ row: Record<string, unknown> }>(
      "select to_jsonb(d) row from delivery_records d where id=$1",
      [legacy],
    )
  ).rows[0].row;
  originalAudit = (await db.query("select * from audit_events order by id"))
    .rows;
  await migration("202611070001_live_delivery_backend.sql");
  await as(gate);
  const boot = await rpc("app_bootstrap");
  ownMarshal = boot.marshals.find(
    (m: any) => m.name === "First approved marshal",
  ).id;
  colleagueMarshal = boot.marshals.find(
    (m: any) => m.name === "Second approved marshal",
  ).id;
  unboundMarshal = boot.marshals.find(
    (m: any) => m.name === "Duplicate marshal",
  ).id;
});
after(async () => db.close());

test("live migration preserves historical values and binds only unambiguous authorised marshal identities", async () => {
  await as(gate);
  const row = (
    await db.query<{ row: Record<string, unknown> }>(
      "select to_jsonb(d) row from delivery_records d where id=$1",
      [legacy],
    )
  ).rows[0].row;
  for (const [key, value] of Object.entries(legacyBefore))
    assert.deepEqual(row[key], value, key);
  const boot = await rpc("app_bootstrap");
  assert.equal(boot.mode, "supabase");
  assert.equal(
    boot.marshals.find((m: any) => m.id === ownMarshal).user_id,
    gate,
  );
  assert.equal(
    boot.marshals.find((m: any) => m.id === ownMarshal).can_record,
    true,
  );
  assert.equal(
    boot.marshals.find((m: any) => m.id === colleagueMarshal).can_record,
    false,
  );
  assert.equal(
    boot.marshals.find((m: any) => m.id === unboundMarshal).user_id,
    null,
  );
  assert.equal(
    boot.marshals.find((m: any) => m.id === unboundMarshal).can_record,
    false,
  );
  assert(!boot.sites.some((s: any) => s.id === hiddenSite));
  await db.exec("reset role");
  for (const event of originalAudit as { id: string }[]) {
    assert.deepEqual(
      (await db.query("select * from audit_events where id=$1", [event.id]))
        .rows[0],
      event,
    );
  }
  const bucket = (
    await db.query<{ public: boolean }>(
      "select public from storage.buckets where id='delivery-evidence'",
    )
  ).rows[0];
  assert.equal(bucket.public, false);
});

test("operator-only catalogue seeding is idempotent and normalised duplicates cannot be inserted", async () => {
  await db.exec("reset role");
  const before = (
    await db.query(
      "select id,name from materials where company_id=$1 order by id",
      [company],
    )
  ).rows;
  assert.equal(before.length, 74);
  assert.deepEqual(
    (
      await db.query(
        "select category,count(*)::integer total from materials where company_id=$1 and not capture_hidden group by category order by category",
        [company],
      )
    ).rows,
    [
      { category: "Aggregates / Sands", total: 19 },
      { category: "Other Materials", total: 2 },
      { category: "Services", total: 3 },
    ],
  );
  await as(null, "service_role");
  for (let attempt = 0; attempt < 2; attempt++) {
    const seeded = (
      await db.query<{ result: { inserted: number } }>(
        "select app_seed_company_catalogue($1) result",
        [company],
      )
    ).rows[0].result;
    assert.equal(seeded.inserted, 0);
  }
  const status = (
    await db.query<{ result: Record<string, unknown> }>(
      "select app_provisioning_status() result",
    )
  ).rows[0].result;
  assert.equal(status.migration, "202611070001_live_delivery_backend");
  assert.equal(status.private_evidence_bucket, true);
  assert.equal(status.private_portrait_bucket, true);
  await db.exec("reset role");
  assert.deepEqual(
    (
      await db.query(
        "select id,name from materials where company_id=$1 order by id",
        [company],
      )
    ).rows,
    before,
  );
  await assert.rejects(
    db.query(
      "insert into materials(company_id,name) values($1,'  TYPE  1  ')",
      [company],
    ),
  );
  await assert.rejects(
    db.query(
      "insert into suppliers(company_id,name) values($1,'  qa EXISTING supplier  ')",
      [company],
    ),
  );
  for (const role of ["authenticated", "anon"]) {
    await as(role === "authenticated" ? gate : null, role);
    await refused(db.query("select app_seed_company_catalogue($1)", [company]));
    await refused(db.query("select app_provisioning_status()"));
    await refused(
      db.query("select log_delivery_legacy($1::jsonb)", [
        JSON.stringify(fields()),
      ]),
    );
    await refused(
      db.query("select save_delivery_legacy($1::jsonb)", [
        JSON.stringify(fields()),
      ]),
    );
  }
});

test("staff portrait paths stay private and readable only within the assigned site", async () => {
  await db.exec("reset role");
  const path = `${company}/${site}/${ownMarshal}/portrait.png`;
  await db.query("update traffic_marshals set photo_path=$1 where id=$2", [
    path,
    ownMarshal,
  ]);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('staff-portraits',$1)",
    [path],
  );
  await assert.rejects(
    db.query("update traffic_marshals set photo_path=$1 where id=$2", [
      `${otherCompany}/${site}/${ownMarshal}/portrait.png`,
      ownMarshal,
    ]),
  );
  for (const person of [gate, colleague, supervisor]) {
    await as(person);
    assert.equal(
      (
        await db.query(
          "select name from storage.objects where bucket_id='staff-portraits' and name=$1",
          [path],
        )
      ).rows.length,
      1,
    );
  }
  await as(gate);
  await refused(
    db.query(
      "insert into storage.objects(bucket_id,name) values('staff-portraits',$1)",
      [`${company}/${site}/${ownMarshal}/forged.png`],
    ),
  );
  for (const person of [outsider, platform, unassigned]) {
    await as(person);
    assert.equal(
      (
        await db.query(
          "select name from storage.objects where bucket_id='staff-portraits' and name=$1",
          [path],
        )
      ).rows.length,
      0,
    );
  }
});

test("live capture uses the server clock and a private photo before becoming a submitted arrival", async () => {
  await as(gate);
  const input = fields({
    recorded_at: "2000-01-01T00:00:00Z",
    arrival_at: "2000-01-01T00:00:00Z",
    company_id: otherCompany,
    created_by: supervisor,
    status: "Accepted",
  });
  const before = Date.now();
  const first = (await rpc("log_delivery", input)).delivery;
  assert.equal(first.created_by, gate);
  assert.equal(first.company_id, company);
  assert.equal(first.marshal_id, ownMarshal);
  assert.equal(first.status, "Draft");
  assert.equal(first.recorded_at, first.arrival_at);
  assert(Date.parse(first.recorded_at) >= before - 1000);
  assert(Date.parse(first.recorded_at) <= Date.now() + 1000);
  assert.equal(first.category, "Aggregates / Sands");
  assert.equal(first.entry_type, "Delivery");
  await refused(
    rpc("log_delivery", { ...input, intent: "submit", version: first.version }),
  );
  storedPhoto = await image(first.id);
  storedDelivery = (
    await rpc("log_delivery", {
      ...input,
      intent: "submit",
      version: first.version,
    })
  ).delivery;
  assert.equal(storedDelivery.status, "Submitted");
  assert.equal(storedDelivery.recorded_at, first.recorded_at);
  assert.equal(storedDelivery.created_at, first.created_at);
  assert.equal(storedDelivery.evidence[0].id, storedPhoto);
  assert.equal(storedDelivery.accepted_quantity, null);
  assert.deepEqual(storedDelivery.reviews, []);
});

test("live manual material and supplier names deduplicate across case/spacing and remain selectable while pending", async () => {
  await as(gate);
  const first = await finish(
    fields({
      material_id: "",
      supplier_id: null,
      custom_item_name: "QA Bespoke Panels",
      custom_supplier_name: "QA New Supplier",
      selected_category: "Other Materials",
      category: "Services",
      entry_type: "Service visit",
    }),
  );
  const second = await finish(
    fields({
      material_id: "",
      supplier_id: null,
      custom_item_name: "qa  bespoke panels",
      custom_supplier_name: "qa  new supplier",
      selected_category: "Services",
    }),
  );
  assert.equal(first.delivery.material_id, second.delivery.material_id);
  assert.equal(first.delivery.supplier_id, second.delivery.supplier_id);
  const boot = await rpc("app_bootstrap");
  const item = boot.materials.find(
    (m: any) => m.id === first.delivery.material_id,
  );
  assert.equal(item.approval_status, "Pending");
  assert.equal(item.entry_type, "Pending review");
  assert.equal(item.category, "Pending classification");
  assert.equal(first.delivery.category, "Pending classification");
  assert.equal(first.delivery.entry_type, "Pending review");
  assert.equal(first.delivery.selected_category, "Other Materials");
  assert.equal(second.delivery.selected_category, "Services");
  assert.equal(
    boot.materials.filter(
      (m: any) => m.normalised_name === item.normalised_name,
    ).length,
    1,
  );
  assert(boot.suppliers.some((s: any) => s.id === first.delivery.supplier_id));
  const reused = await finish(
    fields({ material_id: item.id, supplier_id: first.delivery.supplier_id }),
  );
  assert.equal(reused.delivery.material_id, item.id);
  assert.equal(reused.delivery.entry_type, "Pending review");
});

test("live retries retain one arrival, catalogue rows and immutable correction history", async () => {
  await as(gate);
  const corrected = new Date(Date.now() - 3_600_000).toISOString();
  const input = fields({
    corrected_arrival_at: corrected,
    correction_reason: "Recorded after the gate queue cleared",
  });
  const draft = (await rpc("log_delivery", input)).delivery;
  assert.equal(Date.parse(draft.arrival_at), Date.parse(corrected));
  assert(Date.parse(draft.recorded_at) > Date.parse(draft.arrival_at));
  assert.equal(draft.correction_reason, input.correction_reason);
  const repeated = (await rpc("log_delivery", input)).delivery;
  assert.deepEqual(repeated, draft);
  await refused(
    rpc("log_delivery", {
      ...input,
      correction_reason: "Changed after capture",
    }),
  );
  await refused(
    rpc("log_delivery", {
      ...input,
      custom_supplier_name: "Must not be created by a mutated retry",
      supplier_id: null,
    }),
  );
  await image(draft.id);
  const saved = (
    await rpc("log_delivery", {
      ...input,
      intent: "submit",
      version: draft.version,
    })
  ).delivery;
  const retried = (
    await rpc("log_delivery", {
      ...input,
      intent: "submit",
      version: draft.version,
    })
  ).delivery;
  assert.deepEqual(retried, saved);
  assert.equal(saved.created_at, draft.created_at);
  assert.equal(saved.recorded_at, draft.recorded_at);
  assert.equal(
    (await db.query("select id from delivery_records where id=$1", [draft.id]))
      .rows.length,
    1,
  );
  assert.equal(
    (
      await db.query("select id from suppliers where name=$1", [
        "Must not be created by a mutated retry",
      ])
    ).rows.length,
    0,
  );
});

test("live database permissions reject colleague impersonation, unauthorised sites and direct privileged writes", async () => {
  await as(gate);
  for (const patch of [
    { marshal_id: colleagueMarshal },
    { marshal_id: unboundMarshal },
    { site_id: hiddenSite },
    { material_id: foreignMaterial },
    { supplier_id: foreignSupplier },
  ]) {
    await refused(rpc("log_delivery", fields(patch)));
  }
  await refused(
    rpc("log_delivery", {
      ...fields(),
      capture_kind: undefined,
      supplier_name: "QA Supplier",
      arrival_at: new Date().toISOString(),
      marshal_id: colleagueMarshal,
    }),
  );
  await refused(
    db.query("insert into materials(company_id,name) values($1,'Bypass')", [
      company,
    ]),
  );
  await refused(
    db.query("insert into suppliers(company_id,name) values($1,'Bypass')", [
      company,
    ]),
  );
  await refused(
    db.query(
      "update company_memberships set role='supervisor' where user_id=$1",
      [gate],
    ),
  );
  await refused(
    db.query("update traffic_marshals set user_id=$1 where id=$2", [
      gate,
      colleagueMarshal,
    ]),
  );
  const bypassId = crypto.randomUUID();
  await refused(
    rpc("save_delivery", {
      id: bypassId,
      site_id: site,
      material_id: material,
      supplier_id: supplier,
      vehicle: "QA 001",
      ticket_number: "BYPASS",
      ticket_quantity: null,
      ticket_unit: "loads",
      arrival_at: new Date().toISOString(),
      notes: "",
      intent: "submit",
      marshal_id: colleagueMarshal,
    }),
  );
  assert.equal(
    (await db.query("select id from delivery_records where id=$1", [bypassId]))
      .rows.length,
    0,
  );
});

test("live arrivals may omit an unknown supplier without inventing a supplier catalogue row", async () => {
  await as(gate);
  const count = (
    await db.query<{ count: number }>(
      "select count(*)::integer count from suppliers",
    )
  ).rows[0].count;
  const { delivery } = await finish(fields({ supplier_id: null }));
  assert.equal(delivery.supplier_id, null);
  assert.equal(delivery.supplier_name, "");
  assert.equal(
    (
      await db.query<{ count: number }>(
        "select count(*)::integer count from suppliers",
      )
    ).rows[0].count,
    count,
  );
});

test("live validation rejects unknown/blank input and invalid correction pairs without partial rows", async () => {
  await as(gate);
  for (const patch of [
    { material_id: "", custom_item_name: "   " },
    { material_id: "", custom_item_name: "!!!" },
    { material_id: "", custom_item_name: "a".repeat(161) },
    { supplier_id: null, custom_supplier_name: "   " },
    { selected_category: "Invented category" },
    { corrected_arrival_at: new Date(Date.now() - 1000).toISOString() },
    { correction_reason: "No corrected timestamp" },
    {
      corrected_arrival_at: "2099-01-01T00:00:00Z",
      correction_reason: "Invalid future correction",
    },
  ]) {
    const input = fields(patch);
    await refused(rpc("log_delivery", input));
    assert.equal(
      (
        await db.query("select id from delivery_records where id=$1", [
          input.id,
        ])
      ).rows.length,
      0,
    );
  }
});

test("live supervisor sees another device's persisted record/photo while other users cannot read or mutate them", async () => {
  await as(supervisor);
  const boot = await rpc("app_bootstrap");
  assert(boot.deliveries.some((d: any) => d.id === storedDelivery.id));
  assert.equal(
    (
      await db.query("select * from delivery_evidence where id=$1", [
        storedPhoto,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query("select * from storage.objects where name like $1", [
        `%/${storedPhoto}`,
      ])
    ).rows.length,
    1,
  );
  await db.query("select audit_evidence_view($1)", [storedPhoto]);
  await refused(rpc("log_delivery", fields()));
  for (const person of [colleague, outsider, platform, unassigned]) {
    await as(person);
    assert.equal(
      (
        await db.query("select * from delivery_records where id=$1", [
          storedDelivery.id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("select * from delivery_evidence where id=$1", [
          storedPhoto,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("select * from storage.objects where name like $1", [
          `%/${storedPhoto}`,
        ])
      ).rows.length,
      0,
    );
    await refused(db.query("select audit_evidence_view($1)", [storedPhoto]));
  }
  await as(null, "anon");
  await refused(rpc("app_bootstrap"));
  await refused(rpc("log_delivery", fields()));
  await refused(db.query("select * from delivery_records"));
  await refused(db.query("select * from delivery_evidence"));
});
