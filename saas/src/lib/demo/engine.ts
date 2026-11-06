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
  Unit,
} from "../types";
import { localDate } from "../reporting";

/** Fictional, per-browser playground. No server, credentials or production data. */
export const demoRoles = [
  "gate",
  "supervisor",
  "site_manager",
  "company_admin",
] as const;
export type DemoRole = (typeof demoRoles)[number];
export type DemoState = {
  schema: 1;
  role: DemoRole;
  company: Bootstrap["company"];
  sites: Site[];
  members: Actor[];
  materials: CatalogueItem[];
  suppliers: CatalogueItem[];
  deliveries: Delivery[];
  historical: HistoricalSummary[];
  audit: AuditEvent[];
  files: Record<string, Blob>;
};
export class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function check(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new DemoError(status, message);
}
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const companyId = "d1000000-0000-4000-8000-000000000001";
const siteId = "d2000000-0000-4000-8000-000000000001";
const fixtureId = (group: string, index: number) =>
  `d${group}${index.toString(16).padStart(6, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const units: Unit[] = ["tonnes", "m³", "loads", "kg"];
const clone = <T>(value: T): T => structuredClone(value);
function text(value: unknown, max = 200, required = false): string {
  check(typeof value === "string", "Expected text");
  const result = value.trim();
  check(
    result.length <= max && (!required || result.length),
    `Enter ${required ? "1" : "0"}–${max} characters`,
  );
  return result;
}
function uuid(value: unknown): string {
  check(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    "Invalid record ID",
  );
  return value.toLowerCase();
}
function quantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= 1e9 &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001,
    "Quantity must be positive with at most 3 decimal places",
  );
  return value;
}
function object(value: unknown): Record<string, unknown> {
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Invalid request",
  );
  return value as Record<string, unknown>;
}

export function createDemoState(instant = new Date()): DemoState {
  const stamp = instant.toISOString();
  const members = demoRoles.map((role, index): Actor => ({
    id: fixtureId("3", index + 1),
    company_id: companyId,
    role,
    name: [
      "Alex · Demo gate",
      "Sam · Demo supervisor",
      "Taylor · Demo site manager",
      "Jordan · Demo administrator",
    ][index],
    email: `demo-${role}@example.invalid`,
    site_ids: [siteId],
  }));
  const materials = [
    "GF5",
    "G1",
    "Type 1",
    "Sand",
    "10mm shingles",
    "20mm shingles",
    "Other",
  ].map((name, index) => ({
    id: fixtureId("4", index + 1),
    company_id: companyId,
    name,
    active: true,
  }));
  const suppliers = [
    "Example Aggregates — fictional",
    "Sample Quarry — fictional",
    "Demo Building Supplies — fictional",
  ].map((name, index) => ({
    id: fixtureId("5", index + 1),
    company_id: companyId,
    name,
    active: true,
  }));
  const statuses = [
    "Accepted",
    "Rejected",
    "Flagged",
    "Submitted",
    "Accepted",
  ] as const;
  const deliveries = statuses.map((status, index): Delivery => {
    const id = fixtureId("6", index + 1);
    const arrival = new Date(
      instant.getTime() - (statuses.length - index) * 12 * 60_000,
    ).toISOString();
    const accepted = status === "Accepted";
    const review: Review | null =
      status === "Submitted"
        ? null
        : {
            id: fixtureId("7", index + 1),
            delivery_id: id,
            reviewer_id: members[1].id,
            reviewer_name: members[1].name,
            decision: status,
            reason:
              status === "Rejected"
                ? "Fictional example: material did not meet the requested specification."
                : status === "Flagged"
                  ? "Fictional example: ticket reference requires investigation."
                  : "Fictional sample of an independent physical receipt check.",
            accepted_quantity: accepted ? (index === 4 ? 8 : 19.5) : null,
            accepted_unit: accepted ? (index === 4 ? "m³" : "tonnes") : null,
            created_at: stamp,
          };
    return {
      id,
      company_id: companyId,
      site_id: siteId,
      material_id: materials[index === 4 ? 3 : index].id,
      supplier_id: suppliers[index % suppliers.length].id,
      vehicle: `DEMO ${101 + index}`,
      ticket_number: `SAMPLE-${101 + index}`,
      ticket_quantity: index === 4 ? 8 : 20,
      ticket_unit: index === 4 ? "m³" : "tonnes",
      arrival_at: arrival,
      created_by: members[0].id,
      creator_name: members[0].name,
      created_at: arrival,
      updated_at: stamp,
      submitted_at: arrival,
      status,
      commercial_status: "Not Linked",
      notes:
        "Fictional demonstration record. No real delivery or company approval is implied.",
      accepted_quantity: review?.accepted_quantity ?? null,
      accepted_unit: review?.accepted_unit ?? null,
      version: review ? 2 : 1,
      evidence: [],
      reviews: review ? [review] : [],
    };
  });
  const state: DemoState = {
    schema: 1,
    role: "gate",
    company: { id: companyId, name: "DJCU Demo Workspace" },
    sites: [
      {
        id: siteId,
        company_id: companyId,
        name: "Demonstration Site — fictional",
        timezone: "Europe/London",
        require_ticket: true,
        require_photo: false,
      },
    ],
    members,
    materials,
    suppliers,
    deliveries,
    historical: [],
    audit: [],
    files: {},
  };
  for (const delivery of deliveries) {
    audit(
      state,
      members[0],
      "demo.sample.created",
      delivery.id,
      siteId,
      null,
      delivery,
    );
    if (delivery.reviews.length)
      audit(
        state,
        members[1],
        "demo.sample.reviewed",
        delivery.id,
        siteId,
        null,
        delivery.reviews[0],
      );
  }
  return state;
}
function actor(state: DemoState): Actor {
  const found = state.members.find((member) => member.role === state.role);
  check(found, "Demo persona is unavailable", 403);
  return found;
}
function canSite(person: Actor, id: string) {
  return person.role === "company_admin" || person.site_ids.includes(id);
}
function site(state: DemoState, person: Actor, id: string): Site {
  const found = state.sites.find(
    (item) => item.id === id && item.company_id === person.company_id,
  );
  check(found && canSite(person, id), "Site not authorised", 403);
  return found;
}
function record(state: DemoState, person: Actor, id: string): Delivery {
  const found = state.deliveries.find(
    (item) =>
      item.id === id &&
      item.company_id === person.company_id &&
      canSite(person, item.site_id),
  );
  check(
    found && (found.status !== "Draft" || found.created_by === person.id),
    "Delivery not found",
    404,
  );
  return found;
}
function audit(
  state: DemoState,
  person: Actor,
  action: string,
  entity: string,
  siteId: string | null,
  before: unknown,
  after: unknown,
) {
  state.audit.push({
    id: uid(),
    company_id: person.company_id,
    site_id: siteId,
    actor_id: person.id,
    actor_name: person.name,
    action,
    entity_id: entity,
    created_at: now(),
    before: clone(before),
    after: clone(after),
  });
}
export function demoBootstrap(state: DemoState): Bootstrap {
  const person = actor(state);
  return clone({
    actor: person,
    company: state.company,
    sites: state.sites.filter(
      (item) =>
        item.company_id === person.company_id && canSite(person, item.id),
    ),
    materials: state.materials.filter(
      (item) => item.company_id === person.company_id,
    ),
    suppliers: state.suppliers.filter(
      (item) => item.company_id === person.company_id,
    ),
    deliveries: state.deliveries
      .filter(
        (item) =>
          item.company_id === person.company_id &&
          canSite(person, item.site_id) &&
          (item.status !== "Draft" || item.created_by === person.id),
      )
      .sort((a, b) => b.arrival_at.localeCompare(a.arrival_at)),
    audit: state.audit
      .filter(
        (item) =>
          item.company_id === person.company_id &&
          (person.role === "company_admin" ||
            (item.site_id && canSite(person, item.site_id))),
      )
      .slice(-500)
      .reverse(),
    historical: state.historical.filter(
      (item) =>
        item.company_id === person.company_id && canSite(person, item.site_id),
    ),
    members:
      person.role === "company_admin"
        ? state.members.filter(
            (member) => member.company_id === person.company_id,
          )
        : [],
    mode: "demo",
  });
}
function parseDelivery(value: unknown): DeliveryInput {
  const raw = object(value);
  check(
    ["draft", "arrived", "submit"].includes(String(raw.intent)),
    "Invalid delivery intent",
  );
  check(units.includes(raw.ticket_unit as Unit), "Invalid quantity unit");
  check(
    typeof raw.arrival_at === "string" &&
      Number.isFinite(Date.parse(raw.arrival_at)) &&
      Date.parse(raw.arrival_at) <= Date.now() + 300_000,
    "Enter a valid arrival time that is not in the future",
  );
  check(
    raw.version === undefined ||
      (Number.isInteger(raw.version) && Number(raw.version) > 0),
    "Invalid version",
  );
  return {
    id: uuid(raw.id),
    site_id: uuid(raw.site_id),
    material_id: uuid(raw.material_id),
    supplier_id: raw.supplier_id ? uuid(raw.supplier_id) : null,
    vehicle: text(raw.vehicle, 30).toUpperCase(),
    ticket_number: text(raw.ticket_number, 100),
    ticket_quantity: quantity(raw.ticket_quantity),
    ticket_unit: raw.ticket_unit as Unit,
    arrival_at: new Date(raw.arrival_at as string).toISOString(),
    notes: text(raw.notes, 2000),
    intent: raw.intent as DeliveryInput["intent"],
    version: raw.version as number | undefined,
  };
}
function save(
  state: DemoState,
  person: Actor,
  input: DeliveryInput,
  patch: boolean,
) {
  check(
    ["gate", "company_admin"].includes(person.role),
    "You cannot record deliveries",
    403,
  );
  site(state, person, input.site_id);
  check(
    state.materials.some(
      (item) =>
        item.id === input.material_id &&
        item.company_id === person.company_id &&
        item.active,
    ),
    "Material not available",
  );
  check(
    !input.supplier_id ||
      state.suppliers.some(
        (item) =>
          item.id === input.supplier_id &&
          item.company_id === person.company_id &&
          item.active,
      ),
    "Supplier not available",
  );
  const previous = state.deliveries.find((item) => item.id === input.id);
  if (previous) {
    check(
      previous.company_id === person.company_id &&
        canSite(person, previous.site_id),
      "Delivery not found",
      404,
    );
    check(
      previous.created_by === person.id,
      "Only the original recorder may edit this arrival",
      403,
    );
    if (
      !patch ||
      (input.intent === "submit" &&
        previous.submitted_at &&
        previous.status !== "Correction Requested" &&
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
            previous[key as keyof Delivery] ===
            input[key as keyof DeliveryInput],
        ))
    )
      return {
        delivery: clone(previous),
        warnings: [
          "Demo submission already received; original record returned.",
        ],
      };
    check(
      ["Draft", "Arrived", "Correction Requested"].includes(previous.status),
      "Delivery cannot be edited in this status",
      409,
    );
    check(
      input.version === previous.version,
      "Record changed. Reload before editing.",
      409,
    );
    check(
      input.site_id === previous.site_id,
      "A delivery cannot move to a different site",
    );
  } else check(!patch, "Delivery not found", 404);
  const { intent, version: ignoredVersion, ...fields } = input;
  void ignoredVersion;
  const stamp = now();
  const delivery: Delivery = {
    ...fields,
    company_id: person.company_id,
    created_by: person.id,
    creator_name: person.name,
    created_at: previous?.created_at ?? stamp,
    updated_at: stamp,
    submitted_at:
      previous?.submitted_at ?? (intent === "submit" ? stamp : null),
    status:
      intent === "submit"
        ? "Submitted"
        : previous?.submitted_at
          ? "Correction Requested"
          : intent === "arrived"
            ? "Arrived"
            : "Draft",
    commercial_status: previous?.commercial_status ?? "Not Linked",
    accepted_quantity: null,
    accepted_unit: null,
    version: (previous?.version ?? 0) + 1,
    evidence: previous?.evidence ?? [],
    reviews: previous?.reviews ?? [],
  };
  audit(
    state,
    person,
    previous ? "delivery.corrected" : "delivery.created",
    delivery.id,
    delivery.site_id,
    previous ?? null,
    delivery,
  );
  if (previous) state.deliveries[state.deliveries.indexOf(previous)] = delivery;
  else state.deliveries.push(delivery);
  const warnings: string[] = [];
  if (
    intent === "submit" &&
    (!delivery.supplier_id ||
      !delivery.vehicle ||
      delivery.ticket_quantity === null)
  )
    warnings.push(
      "Incomplete arrival: add supplier, vehicle and ticket quantity before acceptance.",
    );
  if (
    delivery.ticket_number &&
    state.deliveries.some(
      (other) =>
        other.id !== delivery.id &&
        other.company_id === person.company_id &&
        other.site_id === delivery.site_id &&
        other.supplier_id === delivery.supplier_id &&
        other.ticket_number.toLowerCase() ===
          delivery.ticket_number.toLowerCase(),
    )
  )
    warnings.push(
      "This supplier ticket number already appears at this site. Investigate before acceptance.",
    );
  return { delivery: clone(delivery), warnings };
}
function review(state: DemoState, person: Actor, id: string, value: unknown) {
  const delivery = record(state, person, id);
  check(
    person.role === "supervisor" && person.id !== delivery.created_by,
    "Only a different assigned supervisor may verify receipt",
    403,
  );
  check(
    ["Submitted", "Under Review", "Flagged"].includes(delivery.status),
    "This delivery is not available for review",
    409,
  );
  const input = object(value);
  const decision = input.decision as ReviewInput["decision"];
  check(
    [
      "Under Review",
      "Accepted",
      "Rejected",
      "Flagged",
      "Correction Requested",
    ].includes(decision),
    "Invalid review decision",
  );
  check(
    input.version === delivery.version,
    "Record changed. Reload before reviewing.",
    409,
  );
  const reason = text(input.reason, 2000);
  check(
    !["Rejected", "Flagged", "Correction Requested"].includes(decision) ||
      reason,
    "A reason is required",
  );
  const accepted = decision === "Accepted";
  const acceptedQuantity = accepted ? quantity(input.accepted_quantity) : null;
  const acceptedUnit = accepted ? (input.accepted_unit as Unit) : null;
  if (accepted) {
    const policy = site(state, person, delivery.site_id);
    check(
      acceptedQuantity !== null && units.includes(acceptedUnit as Unit),
      "Accepted quantity and unit required",
    );
    check(
      acceptedUnit === delivery.ticket_unit,
      "Accepted unit must match the ticket unit; conversion is not supported",
    );
    check(
      delivery.supplier_id &&
        delivery.vehicle &&
        delivery.ticket_quantity !== null,
      "Supplier, vehicle and ticket quantity are required before acceptance",
    );
    check(
      !policy.require_ticket || delivery.ticket_number,
      "Site policy requires a ticket number",
    );
    check(
      !policy.require_photo ||
        delivery.evidence.some((item) => item.kind === "ticket"),
      "Site policy requires a ticket photograph",
    );
  }
  const before = clone(delivery);
  const entry: Review = {
    id: uid(),
    delivery_id: id,
    reviewer_id: person.id,
    reviewer_name: person.name,
    decision,
    reason,
    accepted_quantity: acceptedQuantity,
    accepted_unit: acceptedUnit,
    created_at: now(),
  };
  delivery.status = decision;
  delivery.accepted_quantity = acceptedQuantity;
  delivery.accepted_unit = acceptedUnit;
  delivery.version++;
  delivery.updated_at = entry.created_at;
  delivery.reviews.push(entry);
  audit(
    state,
    person,
    "delivery.reviewed",
    id,
    delivery.site_id,
    before,
    delivery,
  );
  return { delivery: clone(delivery) };
}

function imageMime(bytes: Uint8Array): string {
  if (
    bytes.length > 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  )
    return "image/png";
  if (
    bytes.length > 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new DemoError(400, "Use a JPEG, PNG or WebP photograph");
}
async function attach(
  state: DemoState,
  person: Actor,
  deliveryId: string,
  value: unknown,
) {
  const delivery = record(state, person, deliveryId);
  check(
    ["gate", "company_admin"].includes(person.role) &&
      delivery.created_by === person.id,
    "Only the original recorder can attach photographs",
    403,
  );
  check(
    ["Draft", "Arrived", "Correction Requested"].includes(delivery.status),
    "Photographs cannot be added in this status",
    409,
  );
  check(value instanceof FormData, "Photograph form required");
  const id = uuid(value.get("id")),
    file = value.get("file"),
    kind = value.get("kind") as Evidence["kind"];
  check(file instanceof Blob && file.size > 0, "Choose a photograph");
  check(file.size <= 3 * 1024 * 1024, "Photograph exceeds 3 MiB", 413);
  check(
    ["ticket", "vehicle", "load"].includes(kind),
    "Invalid photograph kind",
  );
  const mime = imageMime(new Uint8Array(await file.arrayBuffer()));
  check(mime === file.type, "Photograph content does not match file type");
  const existing = state.deliveries
    .flatMap((item) => item.evidence)
    .find((item) => item.id === id);
  if (existing) {
    check(
      existing.delivery_id === deliveryId &&
        existing.kind === kind &&
        state.files[id] &&
        state.files[id].size === file.size,
      "Evidence ID already used",
      409,
    );
    const previous = new Uint8Array(await state.files[id].arrayBuffer());
    const uploaded = new Uint8Array(await file.arrayBuffer());
    check(
      previous.every((byte, index) => byte === uploaded[index]),
      "Evidence ID already used",
      409,
    );
    return { evidence: clone(existing) };
  }
  check(
    delivery.evidence.length < 12,
    "Demo allows up to 12 photographs per arrival",
  );
  const evidence: Evidence = {
    id,
    delivery_id: deliveryId,
    kind,
    name: text(
      (file instanceof File ? file.name : "photo").replace(/[\r\n/\\]/g, "_"),
      200,
      true,
    ),
    mime,
    size: file.size,
    created_at: now(),
  };
  delivery.evidence.push(evidence);
  state.files[id] = file;
  audit(
    state,
    person,
    "evidence.attached",
    id,
    delivery.site_id,
    null,
    evidence,
  );
  return { evidence: clone(evidence) };
}
function admin(state: DemoState, person: Actor, value: unknown) {
  check(
    person.role === "company_admin",
    "Company administrator permission required",
    403,
  );
  const input = object(value);
  for (const flag of ["require_ticket", "require_photo", "active"])
    check(
      input[flag] === undefined || typeof input[flag] === "boolean",
      `${flag} must be true or false`,
    );
  if (input.action === "material" || input.action === "supplier") {
    const list =
      input.action === "material" ? state.materials : state.suppliers;
    const previous = input.id
      ? list.find(
          (item) =>
            item.id === input.id && item.company_id === person.company_id,
        )
      : undefined;
    check(!input.id || previous, "Catalogue item not found", 404);
    const item = {
      id: previous?.id ?? uid(),
      company_id: person.company_id,
      name: text(input.name, 100, true),
      active: input.active === undefined ? true : Boolean(input.active),
    };
    audit(
      state,
      person,
      `${input.action}.saved`,
      item.id,
      null,
      previous ?? null,
      item,
    );
    if (previous) list[list.indexOf(previous)] = item;
    else list.push(item);
    return { ok: true };
  }
  if (input.action === "settings") {
    const item = site(state, person, uuid(input.site_id));
    const before = clone(item);
    item.require_photo = Boolean(input.require_photo);
    item.require_ticket = Boolean(input.require_ticket);
    audit(state, person, "site.settings", item.id, item.id, before, item);
    return { ok: true };
  }
  if (input.action === "site") {
    const timezone = text(input.timezone, 100, true);
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new DemoError(400, "Invalid timezone");
    }
    const item: Site = {
      id: uid(),
      company_id: person.company_id,
      name: text(input.name, 100, true),
      timezone,
      require_photo: false,
      require_ticket: false,
    };
    state.sites.push(item);
    for (const member of state.members.filter(
      (member) =>
        member.company_id === person.company_id &&
        demoRoles.includes(member.role as DemoRole),
    ))
      member.site_ids.push(item.id);
    audit(state, person, "site.created", item.id, item.id, null, item);
    return { ok: true };
  }
  if (input.action === "historical") {
    const target = site(state, person, uuid(input.site_id));
    check(
      state.materials.some(
        (item) =>
          item.id === input.material_id &&
          item.company_id === person.company_id,
      ),
      "Invalid material",
    );
    check(
      typeof input.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(input.date) &&
        Number.isFinite(Date.parse(input.date)),
      "Invalid summary date",
    );
    check(
      Number.isInteger(input.reported_count) &&
        Number(input.reported_count) >= 0 &&
        Number(input.reported_count) < 1e6,
      "Count must be a nonnegative integer",
    );
    check(
      ["Unreviewed", "Uncertain", "Reviewed"].includes(
        String(input.confidence),
      ),
      "Invalid review status",
    );
    const previous = input.id
      ? state.historical.find(
          (item) =>
            item.id === input.id && item.company_id === person.company_id,
        )
      : undefined;
    check(!input.id || previous, "Historical summary not found", 404);
    const item: HistoricalSummary = {
      id: previous?.id ?? uid(),
      company_id: person.company_id,
      site_id: target.id,
      date: input.date,
      material_id: String(input.material_id),
      reported_count: Number(input.reported_count),
      source_reference: text(input.source_reference, 200, true),
      confidence: String(input.confidence),
      notes: text(input.notes, 2000),
    };
    audit(
      state,
      person,
      "historical.reviewed",
      item.id,
      target.id,
      previous ?? null,
      item,
    );
    if (previous) state.historical[state.historical.indexOf(previous)] = item;
    else state.historical.push(item);
    return { ok: true };
  }
  if (input.action === "member") {
    check(
      [
        "gate",
        "supervisor",
        "site_manager",
        "project_manager",
        "commercial",
        "director",
        "company_admin",
      ].includes(String(input.role)),
      "Invalid role",
    );
    check(Array.isArray(input.site_ids), "Select assigned sites");
    const sites = input.site_ids.map((id) => site(state, person, uuid(id)).id);
    // No credentials, invitation or supplied email are stored in this playground.
    const item: Actor = {
      id: uid(),
      company_id: person.company_id,
      name: text(input.name, 100, true),
      email: "fictional-employee@example.invalid",
      role: input.role as Role,
      site_ids: sites,
    };
    state.members.push(item);
    audit(state, person, "member.created", item.id, null, null, item);
    return { ok: true };
  }
  throw new DemoError(400, "Unknown administration action");
}
function csvCell(value: unknown) {
  let cell = String(value ?? "");
  if (/^(\s*[=+\-@]|[\t\r\n])/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}
function report(state: DemoState, person: Actor, params: URLSearchParams) {
  check(
    ["site_manager", "company_admin", "supervisor"].includes(person.role),
    "Reporting permission required",
    403,
  );
  const date = params.get("date"),
    siteId = params.get("site_id");
  check(!date || /^\d{4}-\d{2}-\d{2}$/.test(date), "Invalid report date");
  if (siteId) site(state, person, siteId);
  const boot = demoBootstrap(state);
  const rows = boot.deliveries.filter(
    (delivery) =>
      delivery.submitted_at &&
      (!siteId || delivery.site_id === siteId) &&
      (!params.get("supplier_id") ||
        delivery.supplier_id === params.get("supplier_id")) &&
      (!params.get("material_id") ||
        delivery.material_id === params.get("material_id")) &&
      (!date ||
        localDate(
          delivery.arrival_at,
          boot.sites.find((item) => item.id === delivery.site_id)?.timezone ??
            "UTC",
        ) === date),
  );
  const header = [
    "Delivery ID",
    "Site",
    "Arrival (ISO)",
    "Material",
    "Supplier",
    "Vehicle",
    "Ticket",
    "Physical status",
    "Ticket quantity",
    "Ticket unit",
    "Accepted quantity",
    "Accepted unit",
    "Commercial status",
    "Recorder",
    "Notes",
    "Latest reviewer",
    "Latest decision",
    "Latest review reason",
  ];
  const body = rows.map((delivery) => [
    delivery.id,
    boot.sites.find((item) => item.id === delivery.site_id)?.name,
    delivery.arrival_at,
    boot.materials.find((item) => item.id === delivery.material_id)?.name,
    boot.suppliers.find((item) => item.id === delivery.supplier_id)?.name,
    delivery.vehicle,
    delivery.ticket_number,
    delivery.status,
    delivery.ticket_quantity,
    delivery.ticket_unit,
    delivery.accepted_quantity,
    delivery.accepted_unit,
    delivery.commercial_status,
    delivery.creator_name,
    delivery.notes,
    delivery.reviews.at(-1)?.reviewer_name,
    delivery.reviews.at(-1)?.decision,
    delivery.reviews.at(-1)?.reason,
  ]);
  audit(state, person, "report.exported", person.company_id, siteId, null, {
    date,
    count: rows.length,
    fictional: true,
  });
  return new Response(
    "\uFEFF" +
      [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="djcu-fictional-demo-report.csv"',
        "Cache-Control": "no-store",
      },
    },
  );
}
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** All routes terminate here. Unsupported routes cannot reach a real API. */
export async function dispatchDemo(
  state: DemoState,
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Response> {
  try {
    const target = new URL(url, "https://demo.invalid");
    check(
      target.origin === "https://demo.invalid",
      "External URLs are unavailable in the demonstration",
      400,
    );
    const path = target.pathname,
      method = (options.method ?? "GET").toUpperCase();
    const person = actor(state);
    if (path === "/api/bootstrap" && method === "GET")
      return json(demoBootstrap(state));
    if (path === "/api/demo/role" && method === "POST") {
      const role = object(options.body).role;
      check(demoRoles.includes(role as DemoRole), "Select a demo role");
      state.role = role as DemoRole;
      audit(
        state,
        actor(state),
        "demo.persona.changed",
        actor(state).id,
        null,
        { role: person.role },
        { role },
      );
      return json(demoBootstrap(state));
    }
    if (path === "/api/auth/logout" && method === "POST") {
      state.role = "gate";
      return json({ ok: true, demo: true });
    }
    if (path === "/api/deliveries" && method === "POST")
      return json(save(state, person, parseDelivery(options.body), false));
    const deliveryPath = path.match(
      /^\/api\/deliveries\/([^/]+)(?:\/(review|evidence))?$/,
    );
    if (deliveryPath) {
      const id = uuid(deliveryPath[1]);
      if (!deliveryPath[2] && method === "PATCH") {
        const input = parseDelivery(options.body);
        check(input.id === id, "Delivery ID does not match path");
        return json(save(state, person, input, true));
      }
      if (deliveryPath[2] === "review" && method === "POST")
        return json(review(state, person, id, options.body));
      if (deliveryPath[2] === "evidence" && method === "POST")
        return json(await attach(state, person, id, options.body));
    }
    const evidencePath = path.match(/^\/api\/evidence\/([^/]+)$/);
    if (evidencePath && method === "GET") {
      const id = uuid(evidencePath[1]);
      const delivery = state.deliveries.find((item) =>
        item.evidence.some((evidence) => evidence.id === id),
      );
      check(delivery, "Photograph not found", 404);
      record(state, person, delivery.id);
      const file = state.files[id];
      check(file, "Photograph not found", 404);
      audit(state, person, "evidence.viewed", id, delivery.site_id, null, {
        demo: true,
      });
      return new Response(file, {
        headers: {
          "Content-Type": file.type,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      });
    }
    if (path === "/api/admin" && method === "POST")
      return json(admin(state, person, options.body));
    if (path === "/api/reports" && method === "GET")
      return report(state, person, target.searchParams);
    throw new DemoError(
      404,
      "This action is unavailable in the fictional browser demonstration",
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Demo request failed" },
      error instanceof DemoError ? error.status : 400,
    );
  }
}
