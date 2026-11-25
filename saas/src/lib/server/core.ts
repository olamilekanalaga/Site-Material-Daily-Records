import { randomUUID } from "node:crypto";
import { CATEGORIES, normaliseItemName } from "../catalogue";
import type {
  Actor,
  Delivery,
  DeliveryInput,
  ReviewInput,
  Site,
  SimpleDeliveryInput,
  Unit,
} from "../types";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new AppError(status, message);
}
export const units: Unit[] = ["tonnes", "m³", "loads", "kg"];
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function text(value: unknown, max = 200, required = false): string {
  assert(typeof value === "string", "Expected text");
  const v = value.trim();
  assert(
    v.length <= max && (!required || v.length > 0),
    `Text must be ${required ? "1" : "0"}–${max} characters`,
  );
  return v;
}
export function uuid(value: unknown): string {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    "Invalid record ID",
  );
  return value.toLowerCase();
}
export function quantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  assert(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= 1000000000 &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001,
    "Quantity must be positive, with at most 3 decimal places",
  );
  return value;
}
export function parseDelivery(raw: unknown): DeliveryInput {
  assert(raw && typeof raw === "object", "Invalid delivery");
  const x = raw as Record<string, unknown>;
  assert(
    ["draft", "arrived", "submit"].includes(String(x.intent)),
    "Invalid intent",
  );
  assert(units.includes(x.ticket_unit as Unit), "Invalid quantity unit");
  assert(
    typeof x.arrival_at === "string" &&
      Number.isFinite(Date.parse(x.arrival_at)),
    "Valid arrival date and time required",
  );
  assert(
    Date.parse(x.arrival_at) <= Date.now() + 300000,
    "Arrival cannot be in the future",
  );
  if (x.version !== undefined)
    assert(
      Number.isInteger(x.version) && Number(x.version) > 0,
      "Invalid version",
    );
  return {
    id: uuid(x.id),
    site_id: uuid(x.site_id),
    material_id: uuid(x.material_id),
    supplier_id: x.supplier_id ? uuid(x.supplier_id) : null,
    vehicle: text(x.vehicle, 30).toUpperCase(),
    ticket_number: text(x.ticket_number, 100),
    ticket_quantity: quantity(x.ticket_quantity),
    ticket_unit: x.ticket_unit as Unit,
    arrival_at: new Date(x.arrival_at).toISOString(),
    notes: text(x.notes, 2000),
    intent: x.intent as DeliveryInput["intent"],
    version: x.version as number | undefined,
  };
}
export function parseSimpleDelivery(raw: unknown): SimpleDeliveryInput {
  assert(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "Invalid delivery",
  );
  const x = raw as Record<string, unknown>;
  assert(x.intent === "draft" || x.intent === "submit", "Invalid intent");
  assert(
    x.capture_kind === undefined || x.capture_kind === "arrival",
    "Invalid capture method",
  );
  const smart = x.capture_kind === "arrival";
  if (!smart) {
    assert(
      typeof x.arrival_at === "string" &&
        Number.isFinite(Date.parse(x.arrival_at)),
      "Valid delivery date and time required",
    );
    assert(
      Date.parse(x.arrival_at) <= Date.now() + 300000,
      "Delivery time cannot be in the future",
    );
  }
  if (x.version !== undefined)
    assert(
      Number.isInteger(x.version) && Number(x.version) > 0,
      "Invalid version",
    );
  const customItem =
    smart && x.custom_item_name !== undefined ? x.custom_item_name : undefined;
  if (customItem !== undefined)
    assert(
      typeof customItem === "string" &&
        customItem.length <= 160 &&
        normaliseItemName(customItem).length > 0,
      "Enter a material name of 1–160 characters containing letters or numbers",
    );
  const customSupplier =
    smart && x.custom_supplier_name !== undefined
      ? text(x.custom_supplier_name, 200, true)
      : undefined;
  if (customSupplier !== undefined)
    assert(
      normaliseItemName(customSupplier).length > 0,
      "Enter a valid supplier name",
    );
  const selectedCategory = smart ? x.selected_category : undefined;
  if (selectedCategory !== undefined)
    assert(
      typeof selectedCategory === "string" &&
        (CATEGORIES as readonly string[]).includes(selectedCategory),
      "Choose a valid category",
    );
  const corrected =
    smart && x.corrected_arrival_at !== undefined
      ? x.corrected_arrival_at
      : undefined;
  const reason = smart ? text(x.correction_reason ?? "", 500) : "";
  if (corrected !== undefined) {
    assert(
      typeof corrected === "string" && Number.isFinite(Date.parse(corrected)),
      "Valid corrected delivery time required",
    );
    assert(
      Date.parse(corrected) <= Date.now() + 300000,
      "Corrected delivery time cannot be in the future",
    );
    assert(reason.length > 0, "Explain the delivery time correction");
  } else assert(!reason, "Choose the corrected delivery time");
  return {
    id: uuid(x.id),
    site_id: uuid(x.site_id),
    material_id:
      customItem !== undefined && !x.material_id ? "" : uuid(x.material_id),
    marshal_id: uuid(x.marshal_id),
    supplier_name: text(x.supplier_name ?? "", 200, !smart),
    arrival_at: smart ? now() : new Date(x.arrival_at as string).toISOString(),
    intent: x.intent,
    version: x.version as number | undefined,
    ...(smart ? { capture_kind: "arrival" as const } : {}),
    ...(customItem !== undefined
      ? { custom_item_name: customItem as string }
      : {}),
    ...(customSupplier !== undefined
      ? { custom_supplier_name: customSupplier }
      : {}),
    ...(smart && x.supplier_id ? { supplier_id: uuid(x.supplier_id) } : {}),
    ...(selectedCategory !== undefined
      ? { selected_category: selectedCategory as string }
      : {}),
    ...(corrected !== undefined
      ? {
          corrected_arrival_at: new Date(corrected as string).toISOString(),
          correction_reason: reason,
        }
      : {}),
  };
}
export function parseReview(raw: unknown): ReviewInput {
  assert(raw && typeof raw === "object", "Invalid review");
  const x = raw as Record<string, unknown>;
  assert(
    [
      "Under Review",
      "Accepted",
      "Rejected",
      "Flagged",
      "Correction Requested",
    ].includes(String(x.decision)),
    "Invalid decision",
  );
  assert(
    Number.isInteger(x.version) && Number(x.version) > 0,
    "Version required",
  );
  const reason = text(x.reason, 2000);
  if (
    ["Rejected", "Flagged", "Correction Requested"].includes(String(x.decision))
  )
    assert(reason, "A reason is required");
  const q = quantity(x.accepted_quantity);
  const u =
    x.accepted_unit === null || x.accepted_unit === undefined
      ? null
      : (x.accepted_unit as Unit);
  assert(u === null || units.includes(u), "Invalid accepted unit");
  if (x.decision === "Accepted")
    assert(q !== null && u !== null, "Accepted quantity and unit required");
  return {
    decision: x.decision as ReviewInput["decision"],
    reason,
    accepted_quantity: x.decision === "Accepted" ? q : null,
    accepted_unit: x.decision === "Accepted" ? u : null,
    version: x.version as number,
  };
}
export function canSite(actor: Actor, siteId: string) {
  return (
    actor.role !== "platform_admin" &&
    (actor.role === "company_admin" || actor.site_ids.includes(siteId))
  );
}
export function capturePermission(actor: Actor) {
  assert(
    ["gate", "company_admin"].includes(actor.role),
    "You cannot record deliveries",
    403,
  );
}
export function canEdit(actor: Actor, d: Delivery) {
  return (
    d.created_by === actor.id &&
    ["Draft", "Arrived", "Correction Requested"].includes(d.status)
  );
}
export function canReview(actor: Actor, d: Delivery) {
  return (
    actor.role === "supervisor" &&
    canSite(actor, d.site_id) &&
    d.created_by !== actor.id
  );
}
export function validateAcceptance(d: Delivery, site: Site) {
  assert(
    d.supplier_id && d.vehicle && d.ticket_quantity !== null,
    "Supplier, vehicle and ticket quantity are required before acceptance",
  );
  if (site.require_ticket)
    assert(d.ticket_number, "Site policy requires a ticket number");
  if (site.require_photo)
    assert(
      d.evidence.some((e) => e.kind === "ticket"),
      "Site policy requires a ticket photograph",
    );
}
export function validateTransition(
  actor: Actor,
  d: Delivery,
  input: ReviewInput,
  site: Site,
) {
  assert(
    canReview(actor, d),
    "Only a different assigned supervisor may verify receipt",
    403,
  );
  assert(
    ["Submitted", "Under Review", "Flagged"].includes(d.status),
    "This delivery is not available for review",
    409,
  );
  assert(
    input.version === d.version,
    "Record changed. Reload before reviewing.",
    409,
  );
  if (input.decision === "Accepted") {
    validateAcceptance(d, site);
    assert(
      input.accepted_unit === d.ticket_unit,
      "Accepted unit must match the ticket unit; unit conversion is not supported",
    );
  }
}
export function sniffImage(bytes: Uint8Array): string {
  if (
    bytes.length > 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (
    bytes.length > 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  throw new AppError(400, "Use a JPEG, PNG or WebP photograph");
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^(\s*[=+\-@]|[\t\r\n])/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function dateAt(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
