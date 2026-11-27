import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Bootstrap,
  Delivery,
  DeliveryInput,
  Evidence,
  ReviewInput,
  SimpleDeliveryInput,
} from "../types";
import { AppError, assert, uuid } from "./core";
import { createHash } from "node:crypto";
import { supabaseConfig } from "./config";

export function supabase(token?: string): SupabaseClient {
  const { url, key } = supabaseConfig();
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
    if (/fetch failed|failed to fetch|network|timed? ?out/i.test(error.message))
      throw new AppError(
        503,
        "The database is temporarily unavailable. Please retry.",
      );
    if (["PGRST202", "PGRST205"].includes(error.code || ""))
      throw new AppError(
        503,
        "The staff database setup is incomplete. Contact your administrator.",
      );
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
  const { data, error } = await client.rpc(name, input).then(
    (response) => response,
    () => {
      throw new AppError(
        503,
        "The database is temporarily unavailable. Please retry.",
      );
    },
  );
  dbError(error);
  return data as T;
}

function unavailableAuth(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const value = error as { name?: string; status?: number; message?: string };
  return (
    value.name === "AuthRetryableFetchError" ||
    value.name === "AuthUnknownError" ||
    value.status === 0 ||
    (typeof value.status === "number" && value.status >= 500) ||
    /fetch failed|failed to fetch|network/i.test(value.message || "")
  );
}

function authFailure(error: unknown, message: string): never {
  if (error instanceof AppError) throw error;
  throw new AppError(
    unavailableAuth(error) ? 503 : 401,
    unavailableAuth(error)
      ? "The sign-in service is temporarily unavailable. Please try again."
      : message,
  );
}

export const remote = {
  async register(
    email: string,
    password: string,
    profile: Record<string, string>,
  ) {
    const { data, error } = await supabase().auth.signUp({
      email,
      password,
      options: { data: profile },
    });
    if (error?.code === "weak_password") throw new AppError(400, error.message);
    if (error?.status === 429)
      throw new AppError(429, "Too many attempts. Try again shortly.");
    if (error && unavailableAuth(error))
      throw new AppError(503, "Staff registration is temporarily unavailable.");
    assert(
      !error,
      "These details could not be registered. Check them or sign in if you already have an account.",
      403,
    );
    assert(
      data.session,
      "Immediate sign-up is unavailable. Contact your administrator.",
      503,
    );
    return {
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  },
  async saveProfilePhoto(
    client: SupabaseClient,
    userId: string,
    bytes: Uint8Array,
    mime: string,
  ) {
    const { error } = await client.storage
      .from("staff-portraits")
      .upload(`profiles/${uuid(userId)}`, bytes, {
        contentType: mime,
        upsert: true,
      });
    dbError(error);
  },
  async profilePhoto(client: SupabaseClient, path: string) {
    const { data, error } = await client.storage
      .from("staff-portraits")
      .download(path);
    assert(
      !error &&
        data &&
        ["image/jpeg", "image/png", "image/webp"].includes(data.type),
      "Staff photo not found",
      404,
    );
    return { data: new Uint8Array(await data.arrayBuffer()), mime: data.type };
  },
  async login(email: string, password: string) {
    const client = supabase();
    const result = await client.auth
      .signInWithPassword({ email, password })
      .catch((error: unknown) =>
        authFailure(error, "Invalid email or password"),
      );
    const { data, error } = result;
    if (error) authFailure(error, "Invalid email or password");
    assert(data.session, "Invalid email or password", 401);
    return {
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  },
  async refresh(refresh_token: string) {
    const { data, error } = await supabase()
      .auth.refreshSession({ refresh_token })
      .catch((problem: unknown) =>
        authFailure(problem, "Session expired. Sign in again."),
      );
    if (error) authFailure(error, "Session expired. Sign in again.");
    assert(data.session, "Session expired. Sign in again.", 401);
    return {
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  },
  async user(token: string) {
    const client = supabase(token);
    const { data, error } = await client.auth
      .getUser(token)
      .catch((problem: unknown) => authFailure(problem, "Sign in required"));
    if (error) authFailure(error, "Sign in required");
    assert(data.user, "Sign in required", 401);
    return client;
  },
  async logout(token: string) {
    const client = supabase(token);
    const { error } = await client.auth.admin.signOut(token, "local");
    if (error)
      throw new AppError(
        503,
        "The sign-in service could not confirm sign-out.",
      );
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
    replacesId?: string,
  ) {
    const [deliveryResult, evidenceResult] = await Promise.all([
      client
        .from("delivery_records")
        .select("company_id,site_id,submitted_at")
        .eq("id", deliveryId)
        .maybeSingle(),
      client.from("delivery_evidence").select("*").eq("id", id).maybeSingle(),
    ]);
    dbError(deliveryResult.error);
    const delivery = deliveryResult.data;
    assert(delivery, "Delivery not found", 404);
    dbError(evidenceResult.error);
    const existing = evidenceResult.data;
    const path = `${delivery.company_id}/${delivery.site_id}/${deliveryId}/${id}`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const registration = {
      p_delivery_id: deliveryId,
      p_input: {
        id,
        kind,
        name,
        mime,
        size: bytes.length,
        storage_path: path,
        sha256,
        ...(replacesId ? { replaces_id: replacesId } : {}),
      },
    };
    if (existing) {
      assert(
        existing.delivery_id === deliveryId &&
          existing.sha256 === sha256 &&
          existing.kind === kind &&
          (existing.replaces_id ?? undefined) === replacesId,
        "Evidence ID already used",
        409,
      );
      if (replacesId)
        return rpc<{ delivery: Delivery }>(
          client,
          "register_evidence",
          registration,
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
    if (replacesId) {
      const [permitted, previous, superseded] = await Promise.all([
        rpc<boolean>(client, "app_storage_insert", { p_name: path }),
        client
          .from("delivery_evidence")
          .select("id")
          .eq("delivery_id", deliveryId)
          .eq("id", replacesId)
          .eq("kind", kind)
          .maybeSingle(),
        client
          .from("delivery_evidence")
          .select("id")
          .eq("replaces_id", replacesId)
          .maybeSingle(),
      ]);
      assert(
        delivery.submitted_at && permitted,
        "You can only change photos on your own deliveries",
        403,
      );
      dbError(previous.error);
      dbError(superseded.error);
      assert(previous.data, "Photo does not belong to this delivery");
      assert(
        !superseded.data,
        "This photo has already been replaced. Open the latest photo and try again.",
        409,
      );
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
    return rpc<Evidence | { delivery: Delivery }>(
      client,
      "register_evidence",
      registration,
    );
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
  async marshalPhoto(client: SupabaseClient, id: string) {
    const { data: marshal, error } = await client
      .from("traffic_marshals")
      .select("id,photo_path,user_id")
      .eq("id", uuid(id))
      .maybeSingle();
    dbError(error);
    assert(marshal, "Staff photo not found", 404);
    if (marshal.user_id) {
      try {
        return await this.profilePhoto(client, `profiles/${marshal.user_id}`);
      } catch (problem) {
        if (
          !marshal.photo_path ||
          !(problem instanceof AppError) ||
          problem.status !== 404
        )
          throw problem;
      }
    }
    assert(marshal.photo_path, "Staff photo not found", 404);
    return this.profilePhoto(client, marshal.photo_path);
  },
  reportExport(client: SupabaseClient, input: Record<string, unknown>) {
    return rpc(client, "audit_report_export", { p_input: input });
  },
  admin(client: SupabaseClient, input: Record<string, unknown>) {
    return rpc(client, "app_admin", { p_input: input });
  },
};
