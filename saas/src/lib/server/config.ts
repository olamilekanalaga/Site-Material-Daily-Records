import { AppError } from "./core";

type Environment = Record<string, string | undefined>;
export type SupabaseConfig = { url: string; key: string };

const unavailable = () =>
  new AppError(
    503,
    "Staff workspace is unavailable. Contact your administrator.",
  );

/** Runtime clients use only a public API key plus the employee's access token. */
export function supabaseConfig(env: Environment = process.env): SupabaseConfig {
  const configuredUrl = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)?.trim();
  if (!configuredUrl || !key) throw unavailable();

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw unavailable();
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && local && !env.VERCEL)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw unavailable();

  // A service-role/secret key bypasses RLS and must never be a runtime API key.
  // Legacy anon keys are JWTs; only their role claim is inspected here. The
  // provider validates the actual key when handling a request.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const parts = key.split(".");
      if (parts.length !== 3) throw unavailable();
      const payload: unknown = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      if (
        !payload ||
        typeof payload !== "object" ||
        !("role" in payload) ||
        payload.role !== "anon"
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
  }

  return { url: url.origin, key };
}

export function localWorkspaceEnabled(env: Environment = process.env): boolean {
  return env.APP_MODE === "local" && !env.VERCEL;
}

/** Used by server-rendered entrances; invalid/missing config never enables staff. */
export function workspaceEnabled(env: Environment = process.env): boolean {
  if (localWorkspaceEnabled(env)) return true;
  if (env.APP_MODE !== "supabase") return false;
  try {
    supabaseConfig(env);
    return true;
  } catch {
    return false;
  }
}
