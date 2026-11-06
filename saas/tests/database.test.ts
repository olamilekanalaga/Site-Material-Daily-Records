import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
// Actual production PostgreSQL RLS/RPCs; only Supabase-managed auth/storage scaffolding is stubbed.
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = id(1),
  other = id(2),
  site = id(3),
  otherSite = id(4),
  hidden = id(5),
  gate = id(10),
  supervisor = id(11),
  manager = id(12),
  admin = id(13),
  outsider = id(14),
  platform = id(15),
  material = id(20),
  otherMaterial = id(21),
  supplier = id(22),
  delivery = id(30);
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function rpc(name: string, input?: unknown, rid?: string) {
  const r =
    input === undefined
      ? await db.query<{ r: any }>(`select ${name}() r`)
      : rid
        ? await db.query<{ r: any }>(`select ${name}($1::uuid,$2::jsonb) r`, [
            rid,
            JSON.stringify(input),
          ])
        : await db.query<{ r: any }>(`select ${name}($1::jsonb) r`, [
            JSON.stringify(input),
          ]);
  return r.rows[0].r;
}
const input = (did = delivery, patch: Record<string, unknown> = {}) => ({
  id: did,
  site_id: site,
  material_id: material,
  supplier_id: supplier,
  vehicle: "DEMO 001",
  ticket_number: "DEMO-T001",
  ticket_quantity: 12.5,
  ticket_unit: "tonnes",
  arrival_at: "2026-10-20T10:00:00Z",
  notes: "Fictional delivery",
  intent: "submit",
  ...patch,
});
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611050001_delivery_pilot.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`insert into companies(id,name) values('${c}','DJ Civils Demo — Unofficial Prototype'),('${other}','Other Fictional Company');
 insert into auth.users(id,email) values('${gate}','gate@demo.invalid'),('${supervisor}','supervisor@demo.invalid'),('${manager}','manager@demo.invalid'),('${admin}','admin@demo.invalid'),('${outsider}','other@demo.invalid'),('${platform}','platform@demo.invalid'),('${id(16)}','unassigned@demo.invalid');
 insert into company_memberships(company_id,user_id,role) values('${c}','${gate}','gate'),('${c}','${supervisor}','supervisor'),('${c}','${manager}','site_manager'),('${c}','${admin}','company_admin'),('${other}','${outsider}','gate'),('${c}','${platform}','platform_admin');
 insert into sites(id,company_id,name,require_photo) values('${site}','${c}','Demo Riverside',false),('${hidden}','${c}','Unassigned demo site',false),('${otherSite}','${other}','Other demo site',false);
 insert into site_assignments(company_id,site_id,user_id) values('${c}','${site}','${gate}'),('${c}','${site}','${supervisor}'),('${c}','${site}','${manager}'),('${other}','${otherSite}','${outsider}');
 insert into materials(id,company_id,name) values('${material}','${c}','GF5'),('${otherMaterial}','${other}','Other material');insert into suppliers(id,company_id,name) values('${supplier}','${c}','Fictional Aggregate Supply');`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611060001_simple_delivery_log.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(async () => {
  await db.close();
});
test("SQL production migration applies and rejects unauthenticated calls", async () => {
  await db.exec("set role anon");
  await assert.rejects(rpc("app_bootstrap"), /permission denied/);
});
test("SQL RLS isolates tenant/site through direct SQL and RPCs", async () => {
  await as(gate);
  assert.equal((await db.query("select * from companies")).rows.length, 1);
  assert.equal((await db.query("select * from sites")).rows.length, 1);
  const b = await rpc("app_bootstrap");
  assert.equal(b.actor.id, gate);
  assert.equal(b.sites.length, 1);
  assert.equal(b.members.length, 0);
  await assert.rejects(
    rpc("save_delivery", input(id(100), { site_id: otherSite })),
    /not permitted/,
  );
  await assert.rejects(
    rpc("save_delivery", input(id(101), { site_id: hidden })),
    /not permitted/,
  );
  await assert.rejects(
    rpc("save_delivery", input(id(102), { material_id: otherMaterial })),
    /unavailable/,
  );
});
test("SQL submission is idempotent, warns duplicates and audits originals", async () => {
  await as(gate);
  const d = await rpc("save_delivery", input());
  assert.equal(d.delivery.status, "Submitted");
  assert.equal(d.delivery.ticket_quantity, 12.5);
  assert.equal((await rpc("save_delivery", input())).delivery.id, delivery);
  assert.equal(
    (await db.query("select * from delivery_records")).rows.length,
    1,
  );
  assert.equal(
    (
      await rpc(
        "save_delivery",
        input(id(31), { ticket_number: " demo-t001 " }),
      )
    ).warnings.length,
    1,
  );
  await as(supervisor);
  assert.equal(
    (
      await db.query(
        "select * from audit_events where action='delivery_records.insert'",
      )
    ).rows.length,
    2,
  );
  await assert.rejects(
    db.query("update delivery_records set status='Accepted' where id=$1", [
      delivery,
    ]),
    /permission denied/,
  );
});
test("SQL supervisor verification separates quantities and preserves review history", async () => {
  await as(gate);
  await assert.rejects(
    rpc(
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 10,
        accepted_unit: "tonnes",
        version: 1,
      },
      delivery,
    ),
    /Supervisor/,
  );
  await as(supervisor);
  const d = (
    await rpc(
      "review_delivery",
      {
        decision: "Accepted",
        reason: "Observed fictional load",
        accepted_quantity: 10.25,
        accepted_unit: "tonnes",
        version: 1,
      },
      delivery,
    )
  ).delivery;
  assert.equal(d.ticket_quantity, 12.5);
  assert.equal(d.accepted_quantity, 10.25);
  assert.equal(d.reviews.length, 1);
  await assert.rejects(
    rpc(
      "review_delivery",
      { decision: "Rejected", reason: "Change", version: 2 },
      delivery,
    ),
    /Invalid review transition/,
  );
  await assert.rejects(
    db.exec("delete from delivery_reviews"),
    /permission denied/,
  );
});
test("SQL acceptance enforces missing fields, corrections, concurrency and photo policy", async () => {
  const did = id(32);
  await as(gate);
  await rpc("save_delivery", input(did, { supplier_id: null }));
  await as(supervisor);
  await assert.rejects(
    rpc(
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 3,
        accepted_unit: "tonnes",
        version: 1,
      },
      did,
    ),
    /Resolve supplier/,
  );
  await assert.rejects(
    rpc(
      "review_delivery",
      { decision: "Rejected", reason: "", version: 1 },
      did,
    ),
    /explanation/,
  );
  await rpc(
    "review_delivery",
    {
      decision: "Correction Requested",
      reason: "Missing supplier",
      version: 1,
    },
    did,
  );
  await as(gate);
  await assert.rejects(
    rpc("save_delivery", input(did, { version: 1 })),
    /Record changed/,
  );
  const correcting = (
    await rpc("save_delivery", input(did, { version: 2, intent: "draft" }))
  ).delivery;
  assert.equal(correcting.status, "Correction Requested");
  assert.ok(correcting.submitted_at);
  await rpc("save_delivery", input(did, { version: 3 }));
  assert.equal(
    (await rpc("save_delivery", input(did, { version: 3 }))).delivery.version,
    4,
  );
  await as(admin);
  await rpc("app_admin", {
    action: "settings",
    site_id: site,
    require_ticket: true,
    require_photo: true,
  });
  await as(supervisor);
  await assert.rejects(
    rpc(
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 3,
        accepted_unit: "tonnes",
        version: 4,
      },
      did,
    ),
    /photograph/,
  );
});
test("SQL private storage is tenant/site scoped, immutable, resumable and audited", async () => {
  const did = id(33),
    eid = id(40),
    path = `${c}/${site}/${did}/${eid}`;
  await as(gate);
  await rpc("save_delivery", input(did, { intent: "draft" }));
  await db.query(
    "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
    [path],
  );
  const file = {
    id: eid,
    kind: "ticket",
    name: "fictional.png",
    mime: "image/png",
    size: 50,
    storage_path: path,
    sha256: "a".repeat(64),
  };
  assert.equal((await rpc("register_evidence", file, did)).id, eid);
  assert.equal((await rpc("register_evidence", file, did)).id, eid);
  await assert.rejects(
    rpc("register_evidence", { ...file, sha256: "b".repeat(64) }, did),
    /already exists/,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
      [`${other}/${otherSite}/${did}/${id(41)}`],
    ),
    /row-level security/,
  );
  assert.equal(
    (
      await db.query(
        "update storage.objects set name='rewritten' where name=$1 returning *",
        [path],
      )
    ).rows.length,
    0,
  );
  await rpc("save_delivery", input(did, { version: 1 }));
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
      [`${c}/${site}/${did}/${id(42)}`],
    ),
    /row-level security/,
  );
  await as(supervisor);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await db.query("select audit_evidence_view($1)", [eid]);
  assert.equal(
    (
      await db.query(
        "select * from audit_events where action='evidence.viewed'",
      )
    ).rows.length,
    1,
  );
  await as(outsider);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from delivery_evidence")).rows.length,
    0,
  );
});
test("SQL role changes never permit self-verification or cross-tenant invitation; platform role is unprivileged", async () => {
  await as(admin);
  await rpc("app_admin", {
    action: "member",
    user_id: gate,
    role: "supervisor",
    site_ids: [site],
  });
  await as(gate);
  await assert.rejects(
    rpc(
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 2,
        accepted_unit: "tonnes",
        version: 1,
      },
      id(31),
    ),
    /own delivery/,
  );
  await as(admin);
  await rpc("app_admin", {
    action: "member",
    user_id: gate,
    role: "gate",
    site_ids: [site],
  });
  await assert.rejects(
    rpc("app_admin", {
      action: "member",
      user_id: outsider,
      role: "director",
      site_ids: [site],
    }),
    /another company/,
  );
  await assert.rejects(
    rpc("app_admin", {
      action: "member",
      user_id: manager,
      role: "platform_admin",
      site_ids: [],
    }),
    /Invalid company role/,
  );
  await as(platform);
  assert.equal((await db.query("select * from companies")).rows.length, 0);
  assert.equal(
    (await db.query("select * from delivery_records")).rows.length,
    0,
  );
  await assert.rejects(rpc("app_bootstrap"), /No company membership/);
});
test("SQL historical aggregates stay separate; report exports audited; audit append only", async () => {
  await as(admin);
  await rpc("app_admin", {
    action: "historical",
    site_id: site,
    date: "2026-10-20",
    material_id: material,
    reported_count: 12,
    source_reference: "FICTIONAL illustration",
    confidence: "Uncertain",
    notes: "Not individual arrivals",
  });
  const b = await rpc("app_bootstrap");
  assert.equal(b.historical.length, 1);
  assert.equal(b.deliveries.length, 4);
  await as(manager);
  await rpc("audit_report_export", { site_id: site, date: "2026-10-20" });
  assert.equal(
    (
      await db.query(
        "select * from audit_events where action='report.exported'",
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    db.exec("delete from audit_events"),
    /permission denied/,
  );
});

test("SQL direct RPC rejects null versions, incompatible units and invalid decimal quantities", async () => {
  await as(gate);
  for (const quantity of [0, -1, 1.0001, 1000000001])
    await assert.rejects(
      rpc("save_delivery", input(id(150), { ticket_quantity: quantity })),
      /Ticket quantity/,
    );
  await assert.rejects(
    rpc("save_delivery", input(id(150), { version: null })),
    /positive integer version/,
  );
  await as(supervisor);
  await assert.rejects(
    rpc(
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 3,
        accepted_unit: "tonnes",
        version: null,
      },
      id(31),
    ),
    /positive integer version/,
  );
  for (const [quantity, unit] of [
    [0, "tonnes"],
    [1.0001, "tonnes"],
    [1000000001, "tonnes"],
    [3, "kg"],
  ])
    await assert.rejects(
      rpc(
        "review_delivery",
        {
          decision: "Accepted",
          accepted_quantity: quantity,
          accepted_unit: unit,
          version: 1,
        },
        id(31),
      ),
      /Accepted quantity/,
    );
});

test("SQL authenticated but unassigned users fail closed for EVERY mutation RPC and storage", async () => {
  await db.exec("reset role");
  const before = (
    await db.query<{ n: number }>("select count(*)::int n from audit_events")
  ).rows[0].n;
  await as(id(16));
  assert.equal(
    (await db.query("select * from delivery_records")).rows.length,
    0,
  );
  for (const [name, payload, did, pattern] of [
    ["save_delivery", input(id(160)), undefined, /not permitted/],
    [
      "review_delivery",
      {
        decision: "Accepted",
        accepted_quantity: 3,
        accepted_unit: "tonnes",
        version: 1,
      },
      id(31),
      /Supervisor/,
    ],
    [
      "register_evidence",
      {
        id: id(44),
        kind: "ticket",
        name: "x.png",
        mime: "image/png",
        size: 50,
        storage_path: `${c}\/${site}\/${id(33)}\/${id(44)}`,
      },
      id(33),
      /not permitted/,
    ],
    [
      "app_admin",
      { action: "material", name: "Forbidden" },
      undefined,
      /administrator/,
    ],
    ["audit_report_export", { site_id: site }, undefined, /permission denied/],
  ] as [string, unknown, string | undefined, RegExp][])
    await assert.rejects(rpc(name, payload, did), pattern);
  await assert.rejects(
    db.query("select audit_evidence_view($1)", [id(40)]),
    /access denied/,
  );
  await assert.rejects(rpc("app_bootstrap"), /No company membership/);
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('delivery-evidence',$1)",
      [`${c}/${site}/${id(33)}/${id(44)}`],
    ),
    /row-level security/,
  );
  await db.exec("reset role");
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from audit_events"))
      .rows[0].n,
    before,
  );
});
