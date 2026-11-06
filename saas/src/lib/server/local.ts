import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type {
  Actor,
  AuditEvent,
  Bootstrap,
  CatalogueItem,
  Delivery,
  DeliveryInput,
  Evidence,
  HistoricalSummary,
  Review,
  ReviewInput,
  Role,
  Site,
  Marshal,
  SimpleDeliveryInput,
} from "../types";
import {
  AppError,
  assert,
  canEdit,
  canSite,
  capturePermission,
  now,
  text,
  uid,
  uuid,
  validateTransition,
} from "./core";

let database: DatabaseSync;
const C = "10000000-0000-4000-8000-000000000001",
  S = "20000000-0000-4000-8000-000000000001";
const C2 = "10000000-0000-4000-8000-000000000002",
  S2 = "20000000-0000-4000-8000-000000000002",
  S3 = "20000000-0000-4000-8000-000000000003";
type Account = Actor & { password_hash: string; salt: string; active: boolean };
type StoredEvidence = Evidence & {
  company_id: string;
  site_id: string;
  sha256: string;
};
function hash(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function password(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}
function db() {
  if (database) return database;
  assert(
    process.env.APP_MODE === "local" && !process.env.VERCEL,
    "Local storage is disabled",
    503,
  );
  // Runtime-only local adapter. Do not trace or deploy device/demo databases.
  const dir = resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || ".local-data",
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  database = new DatabaseSync(
    resolve(/* turbopackIgnore: true */ dir, "pilot.sqlite"),
  );
  database.exec(
    `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL,id TEXT NOT NULL,company_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS objects_company ON objects(kind,company_id); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY,data BLOB NOT NULL);`,
  );
  if (!get("company", C)) seed();
  seedMarshals();
  correctDemoMaterialName();
  return database;
}
function correctDemoMaterialName() {
  // Correct the supplied catalogue entry in place; saved deliveries retain its ID.
  const aggregate = get<CatalogueItem>(
    "material",
    "30000000-0000-4000-8000-000000000001",
  );
  if (aggregate?.company_id === C && aggregate.name === "GF5")
    put("material", { ...aggregate, name: "6F5" });
}
function seedMarshals() {
  // Add catalogue entries to existing local demo databases without resetting data.
  for (const s of all<Site>("site")) {
    const profiles =
      s.company_id === C
        ? [
            { seedName: "B Traffic Marshal", name: "Bemigho Estano" },
            { seedName: "Olamilekan Alaga", name: "Olamilekan Alaga" },
          ]
        : [{ seedName: "Other Demo Marshal", name: "Other Demo Marshal" }];
    for (const { seedName, name } of profiles) {
      // Display-name changes must preserve IDs referenced by saved deliveries.
      const key = hash(`marshal:${s.id}:${seedName}`);
      const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
      const existing = get<Marshal>("marshal", id);
      if (!existing)
        put("marshal", {
          id,
          company_id: s.company_id,
          site_id: s.id,
          name,
          active: true,
        });
      else if (
        (existing.name === seedName ||
          (seedName === "B Traffic Marshal" && existing.name === "B")) &&
        existing.name !== name
      )
        put("marshal", { ...existing, name });
    }
  }
}
function all<T>(kind: string, company?: string): T[] {
  const rows = (
    company
      ? db()
          .prepare("SELECT body FROM objects WHERE kind=? AND company_id=?")
          .all(kind, company)
      : db().prepare("SELECT body FROM objects WHERE kind=?").all(kind)
  ) as { body: string }[];
  return rows.map((x) => JSON.parse(x.body) as T);
}
function get<T>(kind: string, id: string): T | undefined {
  const row = db()
    .prepare("SELECT body FROM objects WHERE kind=? AND id=?")
    .get(kind, id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as T) : undefined;
}
function put<T extends { id: string; company_id: string }>(kind: string, x: T) {
  db()
    .prepare(
      "INSERT INTO objects(kind,id,company_id,body) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET company_id=excluded.company_id,body=excluded.body",
    )
    .run(kind, x.id, x.company_id, JSON.stringify(x));
}
function transaction<T>(fn: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}
function publicActor(a: Account): Actor {
  const { id, name, email, company_id, role, site_ids } = a;
  return { id, name, email, company_id, role, site_ids };
}
function account(
  email: string,
  name: string,
  role: Role,
  company_id: string,
  site_ids: string[],
  pass = "DemoPass123!",
) {
  const salt = randomBytes(16).toString("hex");
  const a: Account = {
    id: uid(),
    name,
    email,
    company_id,
    role,
    site_ids,
    salt,
    password_hash: password(pass, salt),
    active: true,
  };
  put("actor", a);
  return a;
}
function seed() {
  transaction(() => {
    // Another route worker may have seeded while this connection waited for the lock.
    if (get("company", C)) return;
    put("company", {
      id: C,
      company_id: C,
      name: "DJ Civils Demo — Unofficial Prototype",
    } as { id: string; company_id: string });
    put("company", {
      id: C2,
      company_id: C2,
      name: "Fictional Other Company",
    } as { id: string; company_id: string });
    put("site", {
      id: S,
      company_id: C,
      name: "Demo Riverside",
      timezone: "Europe/London",
      require_ticket: false,
      require_photo: false,
    } as Site);
    put("site", {
      id: S2,
      company_id: C2,
      name: "Private Foreign Demo",
      timezone: "Europe/London",
      require_ticket: false,
      require_photo: false,
    } as Site);
    put("site", {
      id: S3,
      company_id: C,
      name: "Restricted Demo Site",
      timezone: "Europe/London",
      require_ticket: true,
      require_photo: true,
    } as Site);
    const gate = account(
      "gate@demo.invalid",
      "Alex Gate (fictional)",
      "gate",
      C,
      [S],
    );
    const supervisor = account(
      "supervisor@demo.invalid",
      "Sam Supervisor (fictional)",
      "supervisor",
      C,
      [S],
    );
    account(
      "manager@demo.invalid",
      "Morgan Manager (fictional)",
      "site_manager",
      C,
      [S],
    );
    account(
      "admin@demo.invalid",
      "Casey Admin (fictional)",
      "company_admin",
      C,
      [S, S3],
    );
    account(
      "other@demo.invalid",
      "Other Company User (fictional)",
      "gate",
      C2,
      [S2],
    );
    account(
      "restricted@demo.invalid",
      "Restricted Site Gate (fictional)",
      "gate",
      C,
      [S3],
    );
    account(
      "director@demo.invalid",
      "Drew Director (fictional)",
      "director",
      C,
      [S, S3],
    );
    const materials = [
      "6F5",
      "G1",
      "Type 1",
      "Sand",
      "10mm shingles",
      "20mm shingles",
      "Other",
    ].map((name, i) => ({
      id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      company_id: C,
      name,
      active: true,
    }));
    materials.forEach((m) => put("material", m));
    const supplier = {
      id: "40000000-0000-4000-8000-000000000001",
      company_id: C,
      name: "Fictional Aggregate Co",
      active: true,
    };
    put("supplier", supplier);
    put("supplier", {
      id: "40000000-0000-4000-8000-000000000002",
      company_id: C,
      name: "Demo Sand Supply",
      active: true,
    });
    put("material", {
      id: "30000000-0000-4000-8000-000000000099",
      company_id: C2,
      name: "Foreign Sand",
      active: true,
    });
    ["Accepted", "Submitted", "Flagged", "Rejected"].forEach((status, i) => {
      const d: Delivery = {
        id: uid(),
        company_id: C,
        site_id: S,
        material_id: materials[i % 3].id,
        supplier_id: supplier.id,
        vehicle: `DEMO ${i + 1}`,
        ticket_number: `FICTION-${i + 1}`,
        ticket_quantity: 20,
        ticket_unit: "tonnes",
        arrival_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
        created_by: gate.id,
        creator_name: gate.name,
        created_at: now(),
        updated_at: now(),
        submitted_at: now(),
        status: status as Delivery["status"],
        commercial_status: "Not Linked",
        notes:
          "Fictional demonstration record. No company approval or real ticket.",
        accepted_quantity: status === "Accepted" ? 19.5 : null,
        accepted_unit: status === "Accepted" ? "tonnes" : null,
        version: 1,
        evidence: [],
        reviews: [],
      };
      put("delivery", d);
      if (status !== "Submitted") {
        const r: Review = {
          id: uid(),
          delivery_id: d.id,
          reviewer_id: supervisor.id,
          reviewer_name: supervisor.name,
          decision: d.status,
          reason:
            status === "Rejected"
              ? "Fictional incorrect material"
              : status === "Flagged"
                ? "Fictional quantity discrepancy"
                : "Fictional physical receipt confirmed",
          accepted_quantity: d.accepted_quantity,
          accepted_unit: d.accepted_unit,
          created_at: now(),
        };
        put("review", { ...r, company_id: C } as Review & {
          company_id: string;
        });
      }
      audit(gate, "demo.seed", d.id, S, null, d);
    });
  });
}
function audit(
  actor: Actor,
  action: string,
  entity_id: string,
  site_id: string | null,
  before: unknown,
  after: unknown,
) {
  const event: AuditEvent = {
    id: uid(),
    company_id: actor.company_id,
    site_id,
    actor_id: actor.id,
    actor_name: actor.name,
    action,
    entity_id,
    created_at: now(),
    before,
    after,
  };
  put("audit", event);
}
function site(actor: Actor, id: string) {
  const s = get<Site>("site", id);
  assert(
    s && s.company_id === actor.company_id && canSite(actor, id),
    "Site not found or not authorised",
    403,
  );
  return s;
}
function hydrate(d: Delivery): Delivery {
  const marshal = d.marshal_id
    ? get<Marshal>("marshal", d.marshal_id)
    : undefined;
  return {
    ...d,
    marshal_name:
      marshal?.company_id === d.company_id ? marshal.name : d.marshal_name,
    evidence: all<StoredEvidence>("evidence", d.company_id)
      .filter((x) => x.delivery_id === d.id)
      .map(({ id, delivery_id, kind, name, mime, size, created_at }) => ({
        id,
        delivery_id,
        kind,
        name,
        mime,
        size,
        created_at,
      })),
    reviews: all<Review>("review", d.company_id)
      .filter((x) => x.delivery_id === d.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}
function record(actor: Actor, id: string) {
  const d = get<Delivery>("delivery", id);
  assert(
    d &&
      d.company_id === actor.company_id &&
      canSite(actor, d.site_id) &&
      (actor.role !== "gate" || d.created_by === actor.id) &&
      (d.status !== "Draft" || d.created_by === actor.id),
    "Delivery not found",
    404,
  );
  return hydrate(d);
}
export const local = {
  login(email: string, pass: string, ip: string) {
    const key = hash(email.toLowerCase() + ip);
    const attempt = db()
      .prepare("SELECT count,expires FROM attempts WHERE key=?")
      .get(key) as { count: number; expires: number } | undefined;
    if (attempt && attempt.expires > Date.now() && attempt.count >= 10)
      throw new AppError(429, "Too many attempts. Try again in 15 minutes.");
    const a = all<Account>("actor").find(
      (x) => x.email === email.toLowerCase() && x.active,
    );
    const candidate = password(pass, a?.salt || "invalid-account");
    if (
      !a ||
      !timingSafeEqual(
        Buffer.from(candidate, "hex"),
        Buffer.from(a.password_hash, "hex"),
      )
    ) {
      db()
        .prepare(
          "INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=excluded.expires",
        )
        .run(key, Date.now() + 900000, Date.now());
      throw new AppError(401, "Invalid email or password");
    }
    db().prepare("DELETE FROM attempts WHERE key=?").run(key);
    const token = randomBytes(32).toString("base64url");
    db()
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hash(token), a.id, Date.now() + 8 * 3600000);
    audit(a, "auth.login", a.id, null, null, { session: "created" });
    return token;
  },
  actor(token: string): Actor {
    const session = db()
      .prepare("SELECT user_id,expires FROM sessions WHERE token=?")
      .get(hash(token)) as { user_id: string; expires: number } | undefined;
    assert(session && session.expires > Date.now(), "Sign in required", 401);
    const a = get<Account>("actor", session.user_id);
    assert(a && a.active, "Sign in required", 401);
    return publicActor(a);
  },
  logout(token: string) {
    try {
      const a = this.actor(token);
      audit(a, "auth.logout", a.id, null, null, { session: "ended" });
    } catch {}
    db().prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  },
  bootstrap(actor: Actor): Bootstrap {
    assert(
      actor.role !== "platform_admin",
      "Platform administration does not grant company access",
      403,
    );
    const sites = all<Site>("site", actor.company_id).filter((x) =>
      canSite(actor, x.id),
    );
    seedMarshals();
    correctDemoMaterialName();
    const deliveries = all<Delivery>("delivery", actor.company_id)
      .filter(
        (x) =>
          canSite(actor, x.site_id) &&
          (actor.role !== "gate" || x.created_by === actor.id) &&
          (x.status !== "Draft" || x.created_by === actor.id),
      )
      .map(hydrate)
      .sort((a, b) => b.arrival_at.localeCompare(a.arrival_at));
    const events = all<AuditEvent>("audit", actor.company_id)
      .filter(
        (x) =>
          actor.role !== "gate" &&
          (actor.role === "company_admin" ||
            (x.site_id && canSite(actor, x.site_id))),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 500);
    return {
      actor,
      company: get<{ id: string; name: string }>("company", actor.company_id)!,
      sites,
      materials: all<CatalogueItem>("material", actor.company_id),
      suppliers: all<CatalogueItem>("supplier", actor.company_id),
      marshals: all<Marshal>("marshal", actor.company_id).filter(
        (m) => m.active && canSite(actor, m.site_id),
      ),
      deliveries,
      audit: events,
      historical: all<HistoricalSummary>("historical", actor.company_id).filter(
        (x) => canSite(actor, x.site_id),
      ),
      members:
        actor.role === "company_admin"
          ? all<Account>("actor", actor.company_id).map(publicActor)
          : [],
      mode: "local",
    };
  },
  log(actor: Actor, input: SimpleDeliveryInput) {
    return transaction(() => {
      capturePermission(actor);
      site(actor, input.site_id);
      const material = get<CatalogueItem>("material", input.material_id);
      assert(
        material?.company_id === actor.company_id && material.active,
        "Material not available",
      );
      const marshal = get<Marshal>("marshal", input.marshal_id);
      assert(
        marshal?.company_id === actor.company_id &&
          marshal.site_id === input.site_id &&
          marshal.active,
        "Traffic marshal not available",
        403,
      );
      const existing = get<Delivery>("delivery", input.id);
      if (existing) {
        assert(
          existing.company_id === actor.company_id &&
            existing.created_by === actor.id &&
            existing.site_id === input.site_id,
          "Delivery does not belong to you",
          403,
        );
        assert(
          existing.capture_mode === "simple",
          "Record ID is already used by another delivery",
          409,
        );
        assert(
          (
            [
              "site_id",
              "material_id",
              "marshal_id",
              "supplier_name",
              "arrival_at",
            ] as const
          ).every((key) => existing[key] === input[key]),
          "Saved draft details differ. Retry the original delivery or start a new one.",
          409,
        );
        // A lost successful response must not create another arrival or alter its timestamp.
        if (existing.submitted_at || input.intent === "draft")
          return { delivery: hydrate(existing) };
        assert(
          existing.status === "Draft",
          "Delivery cannot be submitted in this status",
          409,
        );
        assert(
          existing.version === input.version,
          "Record changed. Reload before saving.",
          409,
        );
        assert(
          hydrate(existing).evidence.length > 0,
          "Upload a delivery image before saving",
        );
        const stamp = now();
        const submitted: Delivery = {
          ...existing,
          submitted_at: stamp,
          updated_at: stamp,
          status: "Submitted",
          version: existing.version + 1,
        };
        put("delivery", submitted);
        audit(
          actor,
          "delivery.logged",
          input.id,
          input.site_id,
          existing,
          submitted,
        );
        return { delivery: hydrate(submitted) };
      }
      assert(
        input.intent === "draft",
        "Save the draft and upload a delivery image first",
      );
      const stamp = now();
      const draft: Delivery = {
        id: input.id,
        company_id: actor.company_id,
        site_id: input.site_id,
        material_id: input.material_id,
        supplier_id: null,
        supplier_name: input.supplier_name,
        marshal_id: marshal.id,
        marshal_name: marshal.name,
        capture_mode: "simple",
        arrival_at: input.arrival_at,
        vehicle: "",
        ticket_number: "",
        ticket_quantity: null,
        ticket_unit: "loads",
        notes: "",
        created_by: actor.id,
        creator_name: actor.name,
        created_at: stamp,
        updated_at: stamp,
        submitted_at: null,
        status: "Draft",
        commercial_status: "Not Linked",
        accepted_quantity: null,
        accepted_unit: null,
        version: 1,
        evidence: [],
        reviews: [],
      };
      put("delivery", draft);
      audit(
        actor,
        "delivery.draft.created",
        draft.id,
        draft.site_id,
        null,
        draft,
      );
      return { delivery: draft };
    });
  },
  save(actor: Actor, input: DeliveryInput, patch = false) {
    return transaction(() => {
      capturePermission(actor);
      site(actor, input.site_id);
      const mat = get<CatalogueItem>("material", input.material_id);
      assert(
        mat && mat.company_id === actor.company_id && mat.active,
        "Material not available",
      );
      if (input.supplier_id) {
        const supplier = get<CatalogueItem>("supplier", input.supplier_id);
        assert(
          supplier &&
            supplier.company_id === actor.company_id &&
            supplier.active,
          "Supplier not available",
        );
      }
      const existing = get<Delivery>("delivery", input.id);
      if (existing) {
        assert(
          existing.company_id === actor.company_id &&
            canSite(actor, existing.site_id),
          "Delivery not found",
          404,
        );
        assert(
          existing.created_by === actor.id,
          "Only the original recorder may edit this arrival",
          403,
        );
        assert(
          existing.capture_mode !== "simple",
          "Use the delivery logging endpoint for this record",
          409,
        );
        if (
          !patch ||
          (input.intent === "submit" &&
            existing.submitted_at &&
            existing.status !== "Correction Requested" &&
            [
              "site_id",
              "material_id",
              "supplier_id",
              "vehicle",
              "ticket_number",
              "ticket_quantity",
              "ticket_unit",
              "arrival_at",
              "notes",
            ].every(
              (key) =>
                existing[key as keyof Delivery] ===
                input[key as keyof DeliveryInput],
            ))
        )
          return {
            delivery: hydrate(existing),
            warnings: [
              "Submission already received; original record returned.",
            ],
          };
        assert(
          canEdit(actor, existing),
          "Delivery cannot be edited in this status",
          409,
        );
        assert(
          input.version === existing.version,
          "Record changed. Reload before editing.",
          409,
        );
        assert(
          existing.site_id === input.site_id,
          "A delivery cannot be moved to a different site",
        );
      } else assert(!patch, "Delivery not found", 404);
      const stamp = now();
      const { intent, version: _, ...fields } = input;
      const d: Delivery = {
        ...fields,
        company_id: actor.company_id,
        created_by: actor.id,
        creator_name: actor.name,
        created_at: existing?.created_at || stamp,
        updated_at: stamp,
        submitted_at:
          intent === "submit"
            ? existing?.submitted_at || stamp
            : existing?.submitted_at || null,
        status:
          intent === "submit"
            ? "Submitted"
            : existing?.submitted_at
              ? "Correction Requested"
              : intent === "arrived"
                ? "Arrived"
                : "Draft",
        commercial_status: existing?.commercial_status || "Not Linked",
        accepted_quantity: null,
        accepted_unit: null,
        version: (existing?.version || 0) + 1,
        evidence: [],
        reviews: [],
      };
      put("delivery", d);
      audit(
        actor,
        existing ? "delivery.corrected" : "delivery.created",
        d.id,
        d.site_id,
        existing || null,
        d,
      );
      const warnings: string[] = [];
      if (input.intent === "submit") {
        const missing = [
          !d.supplier_id ? "supplier" : null,
          !d.vehicle ? "vehicle" : null,
          d.ticket_quantity === null ? "ticket quantity" : null,
        ].filter(Boolean);
        if (missing.length)
          warnings.push(
            "Incomplete arrival: " +
              missing.join(", ") +
              ". Complete before acceptance.",
          );
      }
      if (
        d.ticket_number &&
        all<Delivery>("delivery", actor.company_id).some(
          (x) =>
            x.id !== d.id &&
            x.site_id === d.site_id &&
            x.supplier_id === d.supplier_id &&
            x.ticket_number.toLowerCase() === d.ticket_number.toLowerCase(),
        )
      )
        warnings.push(
          "This supplier ticket number already appears at this site. Investigate before acceptance.",
        );
      return { delivery: hydrate(d), warnings };
    });
  },
  review(actor: Actor, id: string, input: ReviewInput) {
    return transaction(() => {
      const d = record(actor, id);
      validateTransition(actor, d, input, site(actor, d.site_id));
      const stamp = now();
      const review: Review = {
        id: uid(),
        delivery_id: id,
        reviewer_id: actor.id,
        reviewer_name: actor.name,
        decision: input.decision,
        reason: input.reason,
        accepted_quantity: input.accepted_quantity,
        accepted_unit: input.accepted_unit,
        created_at: stamp,
      };
      put("review", { ...review, company_id: actor.company_id } as Review & {
        company_id: string;
      });
      const updated = {
        ...d,
        status: input.decision,
        accepted_quantity: input.accepted_quantity,
        accepted_unit: input.accepted_unit,
        version: d.version + 1,
        updated_at: stamp,
        evidence: [],
        reviews: [],
      };
      put("delivery", updated);
      audit(actor, "delivery.reviewed", id, d.site_id, d, {
        ...updated,
        review,
      });
      return { delivery: hydrate(updated) };
    });
  },
  evidence(
    actor: Actor,
    deliveryId: string,
    id: string,
    kind: Evidence["kind"],
    name: string,
    mime: string,
    bytes: Uint8Array,
  ) {
    return transaction(() => {
      const d = record(actor, deliveryId);
      assert(
        canEdit(actor, d),
        "Evidence may only be added by the recorder before submission or during correction",
        403,
      );
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const existing = get<StoredEvidence>("evidence", id);
      if (existing) {
        assert(
          existing.company_id === actor.company_id &&
            existing.delivery_id === deliveryId &&
            existing.sha256 === sha256 &&
            existing.kind === kind,
          "Evidence ID already used",
          409,
        );
        const { company_id: _, site_id: __, sha256: ___, ...e } = existing;
        return e;
      }
      const evidence: StoredEvidence = {
        id,
        company_id: actor.company_id,
        site_id: d.site_id,
        delivery_id: deliveryId,
        kind,
        name,
        mime,
        size: bytes.length,
        created_at: now(),
        sha256,
      };
      db().prepare("INSERT INTO files VALUES(?,?)").run(id, bytes);
      put("evidence", evidence);
      audit(actor, "evidence.attached", id, d.site_id, null, {
        delivery_id: deliveryId,
        kind,
        name,
        mime,
        size: bytes.length,
        sha256,
      });
      const { company_id: _, site_id: __, sha256: ___, ...e } = evidence;
      return e;
    });
  },
  file(actor: Actor, id: string) {
    const e = get<StoredEvidence>("evidence", id);
    assert(
      e && e.company_id === actor.company_id && canSite(actor, e.site_id),
      "Evidence not found",
      404,
    );
    record(actor, e.delivery_id);
    const row = db().prepare("SELECT data FROM files WHERE id=?").get(id) as
      { data: Uint8Array } | undefined;
    assert(row, "Evidence not found", 404);
    audit(actor, "evidence.viewed", id, e.site_id, null, {
      delivery_id: e.delivery_id,
    });
    return { evidence: e, data: row.data };
  },
  reportExport(actor: Actor, input: unknown) {
    audit(actor, "report.exported", actor.company_id, null, null, input);
  },
  admin(actor: Actor, raw: Record<string, unknown>) {
    return transaction(() => {
      assert(
        actor.role === "company_admin",
        "Company administrator required",
        403,
      );
      const action = raw.action;
      const id = raw.id ? uuid(raw.id) : uid();
      if (action === "site") {
        const name = text(raw.name, 100, true);
        const timezone = text(raw.timezone || "Europe/London", 100, true);
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          throw new AppError(400, "Invalid timezone");
        }
        const s: Site = {
          id,
          company_id: actor.company_id,
          name,
          timezone,
          require_ticket: Boolean(raw.require_ticket),
          require_photo: Boolean(raw.require_photo),
        };
        assert(!get("site", id), "Site ID already exists", 409);
        put("site", s);
        audit(actor, "site.created", id, id, null, s);
        return { ok: true, site: s };
      }
      if (action === "settings") {
        const s = site(actor, uuid(raw.site_id));
        const updated = {
          ...s,
          require_ticket: Boolean(raw.require_ticket),
          require_photo: Boolean(raw.require_photo),
        };
        put("site", updated);
        audit(actor, "site.settings", s.id, s.id, s, updated);
        return { ok: true };
      }
      if (action === "material" || action === "supplier") {
        const before = get<CatalogueItem>(action, id);
        assert(
          !before || before.company_id === actor.company_id,
          "Catalogue item not found",
          404,
        );
        const item = {
          id,
          company_id: actor.company_id,
          name: text(raw.name, 100, true),
          active: raw.active === undefined ? true : Boolean(raw.active),
        };
        put(action, item);
        audit(
          actor,
          `${action}.${before ? "updated" : "created"}`,
          id,
          null,
          before || null,
          item,
        );
        return { ok: true, item };
      }
      if (action === "historical") {
        const siteId = uuid(raw.site_id);
        site(actor, siteId);
        const materialId = uuid(raw.material_id);
        const material = get<CatalogueItem>("material", materialId);
        assert(
          material && material.company_id === actor.company_id,
          "Material not available",
        );
        assert(
          typeof raw.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(raw.date) &&
            Number.isFinite(Date.parse(raw.date)) &&
            new Date(raw.date).toISOString().slice(0, 10) === raw.date,
          "Valid date required",
        );
        assert(
          Number.isInteger(raw.reported_count) &&
            Number(raw.reported_count) >= 0 &&
            Number(raw.reported_count) <= 2147483647,
          "Historical count must be a nonnegative integer",
        );
        assert(
          ["Unreviewed", "Uncertain", "Reviewed"].includes(
            String(raw.confidence),
          ),
          "Invalid confidence",
        );
        const before = get<HistoricalSummary>("historical", id);
        assert(
          !before || before.company_id === actor.company_id,
          "Summary not found",
          404,
        );
        const h: HistoricalSummary = {
          id,
          company_id: actor.company_id,
          site_id: siteId,
          date: raw.date,
          material_id: materialId,
          reported_count: Number(raw.reported_count),
          source_reference: text(raw.source_reference, 300, true),
          confidence: String(raw.confidence),
          notes: text(raw.notes || "", 2000),
        };
        put("historical", h);
        audit(actor, "historical.reviewed", id, siteId, before || null, h);
        return { ok: true, historical: h };
      }
      if (action === "member") {
        const roles: Role[] = [
          "gate",
          "supervisor",
          "company_admin",
          "site_manager",
          "commercial",
          "project_manager",
          "director",
        ];
        assert(roles.includes(raw.role as Role), "Invalid company role");
        const email = text(raw.email, 200, true).toLowerCase();
        assert(
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
          "Valid email required",
        );
        const existing = raw.user_id
          ? get<Account>("actor", uuid(raw.user_id))
          : all<Account>("actor").find((x) => x.email === email);
        assert(
          !existing || existing.company_id === actor.company_id,
          "Member cannot be assigned",
          403,
        );
        assert(
          !existing || existing.id !== actor.id || raw.role === "company_admin",
          "Cannot demote your own administrator membership",
          403,
        );
        assert(
          Array.isArray(raw.site_ids) &&
            raw.site_ids.every((x) => typeof x === "string"),
          "Assigned sites required",
        );
        for (const sid of raw.site_ids) site(actor, sid);
        if (existing) {
          const updated = {
            ...existing,
            name: raw.name ? text(raw.name, 100, true) : existing.name,
            role: raw.role as Role,
            site_ids: raw.site_ids,
          };
          put("actor", updated);
          audit(
            actor,
            "member.updated",
            updated.id,
            null,
            publicActor(existing),
            publicActor(updated),
          );
          return { ok: true, member: publicActor(updated) };
        }
        const pass = text(raw.password, 200, true);
        assert(
          pass.length >= 12,
          "Password must contain at least 12 characters",
        );
        const a = account(
          email,
          text(raw.name, 100, true),
          raw.role as Role,
          actor.company_id,
          raw.site_ids,
          pass,
        );
        audit(actor, "member.created", a.id, null, null, publicActor(a));
        return { ok: true, member: publicActor(a) };
      }
      throw new AppError(400, "Unknown administration action");
    });
  },
};
