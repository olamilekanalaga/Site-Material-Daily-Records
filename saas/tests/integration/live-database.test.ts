import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { upgradeCatalogue } from "../../src/lib/catalogue";

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
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', email_confirmed_at timestamptz, is_anonymous boolean not null default false);
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
  // Simulate an earlier catalogue with explicitly visible extra default choices.
  await db.exec(`alter table materials add column capture_hidden boolean;
    insert into materials(id,company_id,name,capture_hidden) values('${id(24)}','${company}','Cement',false);`);
  await migration("202611070001_live_delivery_backend.sql");
  await migration("202611250001_delivery_movements.sql");
  await migration("202611250002_streamlined_staff_auth.sql");
  await migration("202611250003_share_submitted_site_records.sql");
  await migration("202611260001_delivery_capture_time.sql");
  await migration("202611260002_require_delivery_supplier.sql");
  await migration("202611260003_concrete_delivery_fields.sql");
  await migration("20261127124132_accept_hire_category.sql");
  await migration(
    "20261127131602_track_receiving_company_and_approve_items.sql",
  );
  await migration("20261127150155_replace_delivery_photo.sql");
  await migration("20261127151213_remove_replaced_delivery_photos.sql");
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
  const cement = boot.materials.find((item: any) => item.id === id(24));
  assert.equal(cement.name, "Cement");
  assert.equal(cement.capture_hidden, true);
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
      { category: "Aggregates / Sands", total: 5 },
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

test("SQL and browser catalogue defaults agree and manual aggregate restoration survives seeding", async () => {
  await db.exec("reset role");
  const definitions = (
    await db.query<{ result: unknown }>(
      "select app_material_definitions() result",
    )
  ).rows[0].result;
  assert.deepEqual(
    definitions,
    upgradeCatalogue([], company).map(
      ({
        name,
        normalised_name,
        category,
        entry_type,
        synonyms,
        capture_hidden,
      }) => ({
        name,
        normalised_name,
        category,
        entry_type,
        synonyms,
        capture_hidden,
      }),
    ),
  );
  await as(gate);
  const draft = (
    await rpc(
      "log_delivery",
      fields({ material_id: "", custom_item_name: "cement" }),
    )
  ).delivery;
  assert.equal(draft.material_id, id(24));
  assert.equal(draft.item_name, "cement");
  assert.equal(draft.category, "Aggregates / Sands");
  await as(null, "service_role");
  await db.query("select app_seed_company_catalogue($1)", [company]);
  await as(gate);
  const boot = await rpc("app_bootstrap");
  assert.equal(
    boot.materials.find((item: any) => item.id === id(24)).capture_hidden,
    false,
  );
  assert.equal(
    boot.materials.filter((item: any) => item.normalised_name === "cement")
      .length,
    1,
  );
  assert(boot.deliveries.some((item: any) => item.id === legacy));
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

test("arrival uses the phone time unless an actual time was entered", async () => {
  await as(gate);
  const deviceTime = "2025-11-05T08:00:00.000Z";
  const manualTime = "2025-11-05T07:00:00.000Z";
  const automatic = (
    await rpc("log_delivery", fields({ device_arrival_at: deviceTime }))
  ).delivery;
  const manual = (
    await rpc(
      "log_delivery",
      fields({
        device_arrival_at: deviceTime,
        corrected_arrival_at: manualTime,
        correction_reason: "Arrival time entered manually",
      }),
    )
  ).delivery;
  assert.equal(new Date(automatic.arrival_at).toISOString(), deviceTime);
  assert.equal(new Date(manual.arrival_at).toISOString(), manualTime);
  assert(Date.parse(manual.recorded_at) > Date.parse(manualTime));
});

test("live manual names are approved on submission and deduplicate across case and spacing", async () => {
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
  assert.equal(item.approval_status, "Approved");
  assert.equal(item.entry_type, "Delivery");
  assert.equal(item.category, "Other Materials");
  assert.equal(first.delivery.category, "Other Materials");
  assert.equal(first.delivery.entry_type, "Delivery");
  assert.equal(first.delivery.receiving_company, "DJ Civils Ltd.");
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
  assert.equal(reused.delivery.entry_type, "Delivery");
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

test("concrete requires a mix and preserves ticket tonnage", async () => {
  await as(gate);
  await refused(rpc("log_delivery", fields({ selected_category: "Concrete" })));
  const { delivery } = await finish(
    fields({
      selected_category: "Concrete",
      material_id: "",
      custom_item_name: "Ready-mix concrete",
      mix: "C25/30",
      tonnage: 12.345,
    }),
  );
  assert.equal(delivery.mix, "C25/30");
  assert.equal(delivery.ticket_quantity, 12.345);
  assert.equal(delivery.ticket_unit, "tonnes");
  await refused(rpc("log_delivery", fields({ mix: "C25/30", tonnage: 12 })));
});

test("a marshal can submit a Hire movement with evidence and a supervisor can read it", async () => {
  await as(gate);
  const input = fields({
    selected_category: "Hire",
    material_id: "",
    custom_item_name: "Mini excavator rental",
    direction: "OUT",
    receiving_company: "GTC",
  });
  const draft = (await rpc("log_delivery", input)).delivery;
  assert.equal(draft.catalogue_status, "Pending");
  const { delivery, evidenceId } = await finish(input);
  assert.equal(delivery.receiving_company, "GTC");
  assert.equal(delivery.catalogue_status, "Approved");
  await refused(
    rpc("log_delivery", { ...input, receiving_company: "DJ Civils Ltd." }),
  );
  assert.equal(delivery.selected_category, "Hire");
  assert.equal(delivery.direction, "OUT");
  assert.equal(delivery.item_name, "Mini excavator rental");
  assert.equal(delivery.status, "Submitted");
  assert.equal(delivery.evidence[0].id, evidenceId);
  await as(supervisor);
  const boot = await rpc("app_bootstrap");
  assert.equal(
    boot.deliveries.find((record: { id: string }) => record.id === delivery.id)
      .receiving_company,
    "GTC",
  );
  await refused(rpc("log_delivery", fields({ selected_category: "Hire" })));
});

test("only the recorder can replace a submitted photo and remove its prior file after it is saved", async () => {
  await as(gate);
  const { delivery, evidenceId } = await finish(fields());
  const replacement = {
    id: crypto.randomUUID(),
    replaces_id: evidenceId,
    kind: "ticket",
    name: "replacement.png",
    mime: "image/png",
    size: 68,
    sha256: "d".repeat(64),
  };
  const path = (id: string) => `${company}/${site}/${delivery.id}/${id}`;
  const upload = (id: string, size = replacement.size) =>
    db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('delivery-evidence',$1,$2::jsonb)",
      [path(id), JSON.stringify({ size })],
    );
  const remove = (id: string) =>
    db.query(
      "delete from storage.objects where bucket_id='delivery-evidence' and name=$1 returning name",
      [path(id)],
    );
  async function register(input = replacement) {
    const result = await db.query<{
      result: { delivery: Record<string, any> };
    }>("select register_evidence($1,$2::jsonb) result", [
      delivery.id,
      JSON.stringify({ ...input, storage_path: path(input.id) }),
    ]);
    return result.rows[0].result.delivery;
  }

  for (const user of [colleague, supervisor, outsider]) {
    await as(user);
    await refused(upload(replacement.id));
    await refused(register());
  }
  await as(gate);
  await refused(register());
  assert.equal((await remove(evidenceId)).rows.length, 0);
  const oversized = { ...replacement, id: crypto.randomUUID(), size: 500001 };
  await upload(oversized.id, oversized.size);
  await refused(register(oversized));
  await upload(replacement.id);
  const updated = await register();
  assert.equal(updated.version, delivery.version + 1);
  assert.deepEqual(
    updated.evidence.map((photo: { id: string }) => photo.id),
    [replacement.id],
  );
  assert.deepEqual(updated.pending_photo_cleanup, [evidenceId]);
  assert.equal((await register()).version, updated.version);
  await refused(register({ ...replacement, id: crypto.randomUUID() }));

  await as(supervisor);
  const boot = await rpc("app_bootstrap");
  assert.deepEqual(
    boot.deliveries
      .find((record: { id: string }) => record.id === delivery.id)
      .evidence.map((photo: { id: string }) => photo.id),
    [replacement.id],
  );
  assert.equal((await remove(evidenceId)).rows.length, 0);
  await as(gate);
  assert.equal((await remove(replacement.id)).rows.length, 0);
  assert.equal((await remove(evidenceId)).rows.length, 1);
  assert.deepEqual((await register()).pending_photo_cleanup, []);
  const originals = await db.query(
    "select id from delivery_evidence where id=$1",
    [evidenceId],
  );
  assert.equal(originals.rows.length, 1);
  const retained = await db.query(
    "select name from storage.objects where name=$1",
    [path(evidenceId)],
  );
  assert.equal(retained.rows.length, 0);
});

test("new arrivals require a supplier without inventing a supplier catalogue row", async () => {
  await as(gate);
  const count = (
    await db.query<{ count: number }>(
      "select count(*)::integer count from suppliers",
    )
  ).rows[0].count;
  await refused(rpc("log_delivery", fields({ supplier_id: null })));
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
    { receiving_company: "Unknown company" },
    { receiving_company: null },
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

test("same-site supervisors and marshals can read submitted records and photos; outsiders cannot", async () => {
  for (const reader of [supervisor, colleague]) {
    await as(reader);
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
  }
  for (const person of [outsider, platform, unassigned]) {
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

test("OUT survives submission and a retry cannot change it to IN", async () => {
  await as(gate);
  await refused(rpc("log_delivery", fields({ direction: "invalid" })));
  const input = fields({ direction: "OUT" });
  const draft = (await rpc("log_delivery", input)).delivery;
  assert.equal(draft.direction, "OUT");
  await refused(rpc("log_delivery", { ...input, direction: "IN" }));
  await image(draft.id);
  const { delivery } = await rpc("log_delivery", {
    ...input,
    intent: "submit",
    version: draft.version,
  });
  assert.equal(delivery.direction, "OUT");
  assert.ok(delivery.submitted_at);
  await as(supervisor);
  const boot = await rpc("app_bootstrap");
  assert.equal(
    boot.deliveries.find((row: { id: string }) => row.id === draft.id)
      .direction,
    "OUT",
  );
  assert.equal(
    boot.deliveries.find((row: { id: string }) => row.id === legacy).direction,
    "IN",
  );
});

test("public registration immediately assigns a freely chosen staff role to an unused email, with role and photo isolation", async () => {
  const users = [
    { user: id(81), role: "gate" },
    { user: id(82), role: "supervisor" },
    { user: id(83), role: "site_manager" },
  ];
  await db.exec("reset role");
  await db.query(
    "insert into staff_private.registration_site(company_id,site_id) values($1,$2)",
    [company, site],
  );
  const profile = (role: string) => ({
    requested_role: role,
    first_name: "New",
    last_name: "Member",
    phone: "07000000000",
  });
  const event = (role: string) => ({
    user: {
      email: "unlisted@example.invalid",
      is_anonymous: false,
      app_metadata: { provider: "email" },
      user_metadata: profile(role),
    },
  });
  await as(null, "anon");
  await refused(rpc("staff_private.before_staff_signup", event("gate")));
  await as(null, "supabase_auth_admin");
  assert.deepEqual(
    await rpc("staff_private.before_staff_signup", event("site_manager")),
    {},
  );
  assert.equal(
    (await rpc("staff_private.before_staff_signup", event("company_admin")))
      .error.http_code,
    403,
  );

  for (const { user, role } of users) {
    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values($1,$2,$3::jsonb,$4::jsonb,now())",
      [
        user,
        role + "@example.invalid",
        JSON.stringify({ provider: "email" }),
        JSON.stringify(profile(role)),
      ],
    );
    await as(user);
    const boot = await rpc("app_bootstrap");
    assert.equal(boot.actor.role, role);
    assert.equal(boot.actor.name, "New Member");
    assert.deepEqual(
      boot.sites.map((item: { id: string }) => item.id),
      [site],
    );
    assert.equal(
      boot.marshals.filter((m: { can_record: boolean }) => m.can_record).length,
      role === "gate" ? 1 : 0,
    );
    if (role !== "gate") {
      await refused(rpc("log_delivery", fields()));
      await refused(
        db.query("select review_delivery($1,'{}'::jsonb)", [storedDelivery.id]),
      );
    }
    await db.query(
      "insert into storage.objects(bucket_id,name) values('staff-portraits',$1)",
      [`profiles/${user}`],
    );
    await refused(
      db.query(
        "insert into storage.objects(bucket_id,name) values('staff-portraits',$1)",
        [`profiles/${outsider}`],
      ),
    );
  }

  await as(users[1].user);
  assert.equal(
    (
      await db.query("select name from storage.objects where name=$1", [
        `profiles/${users[0].user}`,
      ])
    ).rows.length,
    1,
  );
  await as(outsider);
  assert.equal(
    (
      await db.query("select name from storage.objects where name=$1", [
        `profiles/${users[0].user}`,
      ])
    ).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query(
    "update auth.users set raw_user_meta_data=$2::jsonb where id=$1",
    [users[1].user, JSON.stringify(profile("company_admin"))],
  );
  await as(users[1].user);
  assert.equal((await rpc("app_bootstrap")).actor.role, "supervisor");
});
