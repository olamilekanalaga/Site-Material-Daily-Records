import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Bootstrap,
  DeliveryInput,
  Evidence,
  ReviewInput,
  SimpleDeliveryInput,
} from "../types";
import { AppError, assert, uuid } from "./core";
import { createHash } from "node:crypto";

export function supabase(token?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  assert(url && key, "Configure Supabase before starting production mode", 503);
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}
function dbError(error: { message: string; code?: string } | null) {
  if (error) {
    const status =
      error.code === "42501"
        ? 403
        : error.code === "PGRST301"
          ? 401
          : error.code === "23505" || error.code === "40001"
            ? 409
            : 400;
    throw new AppError(status, error.message);
  }
}
async function rpc<T>(
  client: SupabaseClient,
  name: string,
  input?: object,
): Promise<T> {
  const { data, error } = await client.rpc(name, input);
  dbError(error);
  return data as T;
}
export const remote = {
  async login(email: string, password: string) {
    const client = supabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session)
      throw new AppError(401, "Invalid email or password");
    return {
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  },
  async refresh(refresh_token: string) {
    const { data, error } = await supabase().auth.refreshSession({
      refresh_token,
    });
    if (error || !data.session)
      throw new AppError(401, "Session expired. Sign in again.");
    return {
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  },
  async user(token: string) {
    const client = supabase(token);
    const { data, error } = await client.auth.getUser(token);
    assert(!error && data.user, "Sign in required", 401);
    return client;
  },
  async logout(token: string) {
    const client = supabase(token);
    await client.auth.admin.signOut(token, "local");
  },
  bootstrap(client: SupabaseClient) {
    return rpc<Bootstrap>(client, "app_bootstrap");
  },
  save(client: SupabaseClient, input: DeliveryInput) {
    return rpc(client, "save_delivery", { p_input: input });
  },
  log(client: SupabaseClient, input: SimpleDeliveryInput) {
    return rpc(client, "log_delivery", { p_input: input });
  },
  review(client: SupabaseClient, id: string, input: ReviewInput) {
    return rpc(client, "review_delivery", { p_id: uuid(id), p_input: input });
  },
  async evidence(
    client: SupabaseClient,
    deliveryId: string,
    id: string,
    kind: Evidence["kind"],
    name: string,
    mime: string,
    bytes: Uint8Array,
  ) {
    const boot = await this.bootstrap(client);
    const delivery = boot.deliveries.find((d) => d.id === deliveryId);
    assert(delivery, "Delivery not found", 404);
    const path = `${boot.actor.company_id}/${delivery.site_id}/${deliveryId}/${id}`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { data: existing, error: lookupError } = await client
      .from("delivery_evidence")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    dbError(lookupError);
    if (existing) {
      assert(
        existing.delivery_id === deliveryId &&
          existing.sha256 === sha256 &&
          existing.kind === kind,
        "Evidence ID already used",
        409,
      );
      return {
        id: existing.id,
        delivery_id: existing.delivery_id,
        kind: existing.kind,
        name: existing.name,
        mime: existing.mime,
        size: existing.size,
        created_at: existing.created_at,
      } as Evidence;
    }
    const { error } = await client.storage
      .from("delivery-evidence")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) {
      if (
        error.message !== "The resource already exists" &&
        !error.message.includes("already exists")
      )
        throw new AppError(
          400,
          "Private upload failed. Retry the pending photograph.",
        );
      const { data: stored, error: readError } = await client.storage
        .from("delivery-evidence")
        .download(path);
      assert(
        !readError && stored,
        "Pending upload cannot be recovered. Retry again.",
      );
      const storedHash = createHash("sha256")
        .update(new Uint8Array(await stored.arrayBuffer()))
        .digest("hex");
      assert(
        storedHash === sha256,
        "Evidence ID already contains a different photograph",
        409,
      );
    }
    return rpc<Evidence>(client, "register_evidence", {
      p_delivery_id: deliveryId,
      p_input: {
        id,
        kind,
        name,
        mime,
        size: bytes.length,
        storage_path: path,
        sha256,
      },
    });
  },
  async file(client: SupabaseClient, id: string) {
    const { data: e, error } = await client
      .from("delivery_evidence")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    dbError(error);
    assert(e, "Evidence not found", 404);
    const { data, error: downloadError } = await client.storage
      .from("delivery-evidence")
      .download(e.storage_path);
    assert(!downloadError && data, "Evidence not found", 404);
    await rpc(client, "audit_evidence_view", { p_id: id });
    return { evidence: e, data: new Uint8Array(await data.arrayBuffer()) };
  },
  reportExport(client: SupabaseClient, input: Record<string, unknown>) {
    return rpc(client, "audit_report_export", { p_input: input });
  },
  admin(client: SupabaseClient, input: Record<string, unknown>) {
    return rpc(client, "app_admin", { p_input: input });
  },
};
