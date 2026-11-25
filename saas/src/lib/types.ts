export const physicalStatuses = [
  "Draft",
  "Arrived",
  "Submitted",
  "Under Review",
  "Accepted",
  "Rejected",
  "Flagged",
  "Correction Requested",
] as const;
export type PhysicalStatus = (typeof physicalStatuses)[number];
export type Role =
  | "company_admin"
  | "gate"
  | "supervisor"
  | "site_manager"
  | "project_manager"
  | "commercial"
  | "director"
  | "platform_admin";
export type Unit = "tonnes" | "m³" | "loads" | "kg";
export type EntryType = "Delivery" | "Service visit" | "Pending review";
export type ApprovalStatus = "Approved" | "Pending";
export type Actor = {
  id: string;
  name: string;
  email: string;
  company_id: string;
  role: Role;
  site_ids: string[];
};
export type Site = {
  id: string;
  company_id: string;
  name: string;
  timezone: string;
  require_ticket: boolean;
  require_photo: boolean;
};
export type CatalogueItem = {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  normalised_name?: string;
  category?: string;
  entry_type?: EntryType;
  approval_status?: ApprovalStatus;
  synonyms?: string[];
  capture_hidden?: boolean;
};
export type Marshal = {
  id: string;
  company_id: string;
  site_id: string;
  name: string;
  active: boolean;
  user_id?: string | null;
  photo_path?: string | null;
  can_record?: boolean;
};
export type Evidence = {
  id: string;
  delivery_id: string;
  kind: "ticket" | "vehicle" | "load";
  name: string;
  mime: string;
  size: number;
  created_at: string;
};
export type Review = {
  id: string;
  delivery_id: string;
  reviewer_id: string;
  reviewer_name: string;
  decision: PhysicalStatus;
  reason: string;
  accepted_quantity: number | null;
  accepted_unit: Unit | null;
  created_at: string;
};
export type MovementDirection = "IN" | "OUT";
export type Delivery = {
  direction?: MovementDirection;
  id: string;
  company_id: string;
  site_id: string;
  material_id: string;
  supplier_id: string | null;
  supplier_name?: string;
  marshal_id?: string;
  marshal_name?: string;
  capture_mode?: "simple" | "legacy";
  item_name?: string;
  category?: string;
  selected_category?: string;
  entry_type?: EntryType;
  recorded_at?: string;
  correction_reason?: string;
  capture_input?: Record<string, unknown>;
  catalogue_status?: ApprovalStatus;
  vehicle: string;
  ticket_number: string;
  ticket_quantity: number | null;
  ticket_unit: Unit;
  arrival_at: string;
  created_by: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  status: PhysicalStatus;
  commercial_status: string;
  notes: string;
  accepted_quantity: number | null;
  accepted_unit: Unit | null;
  version: number;
  evidence: Evidence[];
  reviews: Review[];
};
export type SimpleDeliveryInput = {
  direction?: MovementDirection;
  id: string;
  site_id: string;
  material_id: string;
  marshal_id: string;
  supplier_name: string;
  supplier_id?: string | null;
  custom_supplier_name?: string;
  arrival_at: string;
  intent: "draft" | "submit";
  version?: number;
  custom_item_name?: string;
  selected_category?: string;
  recorded_at?: string;
  capture_kind?: "arrival";
  corrected_arrival_at?: string;
  correction_reason?: string;
};
export type DeliveryInput = {
  id: string;
  site_id: string;
  material_id: string;
  supplier_id: string | null;
  vehicle: string;
  ticket_number: string;
  ticket_quantity: number | null;
  ticket_unit: Unit;
  arrival_at: string;
  notes: string;
  intent: "draft" | "arrived" | "submit";
  version?: number;
};
export type AuditEvent = {
  id: string;
  company_id: string;
  site_id: string | null;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_id: string;
  created_at: string;
  before: unknown;
  after: unknown;
};
export type HistoricalSummary = {
  id: string;
  company_id: string;
  site_id: string;
  date: string;
  material_id: string;
  reported_count: number;
  source_reference: string;
  confidence: string;
  notes: string;
};
export type Bootstrap = {
  actor: Actor;
  company: { id: string; name: string };
  sites: Site[];
  materials: CatalogueItem[];
  suppliers: CatalogueItem[];
  marshals?: Marshal[];
  deliveries: Delivery[];
  audit: AuditEvent[];
  historical: HistoricalSummary[];
  members: Actor[];
  mode: "local" | "supabase" | "demo";
};
export type ReviewInput = {
  decision:
    | "Under Review"
    | "Accepted"
    | "Rejected"
    | "Flagged"
    | "Correction Requested";
  reason: string;
  accepted_quantity: number | null;
  accepted_unit: Unit | null;
  version: number;
};
