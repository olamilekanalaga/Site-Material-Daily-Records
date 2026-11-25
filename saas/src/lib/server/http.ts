import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor, Bootstrap } from "../types";
import { AppError, assert } from "./core";
import { local } from "./local";
import { remote } from "./supabase";

export type Context = {
  actor: Actor;
  client: SupabaseClient | null;
  bootstrap: () => Promise<Bootstrap>;
};
export function appMode() {
  assert(
    ["local", "supabase"].includes(process.env.APP_MODE || ""),
    "Staff workspace is unavailable. Contact your administrator.",
    503,
  );
  assert(
    !(process.env.APP_MODE === "local" && process.env.VERCEL),
    "Local demo storage cannot run on Vercel",
    503,
  );
  return process.env.APP_MODE as "local" | "supabase";
}
export function requestSafety(request: Request, write = false) {
  const mode = appMode();
  const url = new URL(request.url);
  if (mode === "local")
    assert(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "Local demo is available only on localhost",
      403,
    );
  if (write) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    assert(
      !fetchSite || ["same-origin", "none"].includes(fetchSite),
      "Cross-site request rejected",
      403,
    );
    assert(
      !origin || origin === (process.env.APP_ORIGIN || url.origin),
      "Cross-origin request rejected",
      403,
    );
  }
}
export async function readBytes(request: Request, max = 256 * 1024) {
  const length = request.headers.get("content-length");
  assert(!length || Number(length) <= max, "Request too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let total = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new AppError(413, "Request too large");
    }
    parts.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function json(request: Request): Promise<Record<string, unknown>> {
  assert(
    request.headers.get("content-type")?.includes("application/json"),
    "JSON content type required",
    415,
  );
  try {
    const value = JSON.parse(Buffer.from(await readBytes(request)).toString());
    assert(
      value && typeof value === "object" && !Array.isArray(value),
      "JSON object required",
    );
    return value;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(400, "Invalid JSON");
  }
}
export async function session(request: Request): Promise<Context> {
  requestSafety(request);
  const jar = await cookies();
  const token = jar.get("delivery_session")?.value || "";
  assert(token, "Sign in required", 401);
  if (appMode() === "local") {
    const actor = local.actor(token);
    return {
      actor,
      client: null,
      bootstrap: async () => local.bootstrap(actor),
    };
  }
  let client: SupabaseClient;
  try {
    client = await remote.user(token);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) throw error;
    const refresh = jar.get("delivery_refresh")?.value;
    assert(refresh, "Session expired. Sign in again.", 401);
    const renewed = await remote.refresh(refresh);
    await setTokens(renewed.access, renewed.refresh);
    client = await remote.user(renewed.access);
  }
  const boot = await remote.bootstrap(client);
  return {
    actor: boot.actor,
    client,
    bootstrap: async () => remote.bootstrap(client),
  };
}
export async function setTokens(access: string, refresh?: string) {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: appMode() === "supabase",
    sameSite: "strict" as const,
    path: "/api",
    maxAge: 8 * 3600,
  };
  jar.set("delivery_session", access, opts);
  if (refresh) jar.set("delivery_refresh", refresh, opts);
}
export async function clearTokens() {
  const jar = await cookies();
  jar.set("delivery_session", "", {
    httpOnly: true,
    path: "/api",
    maxAge: 0,
    sameSite: "strict",
    secure: appMode() === "supabase",
  });
  jar.set("delivery_refresh", "", {
    httpOnly: true,
    path: "/api",
    maxAge: 0,
    sameSite: "strict",
    secure: appMode() === "supabase",
  });
}
export async function route(
  request: Request,
  fn: (context: Context) => Promise<Response | unknown>,
  write = false,
): Promise<Response> {
  try {
    requestSafety(request, write);
    const context = await session(request);
    const result = await fn(context);
    const response =
      result instanceof Response ? result : Response.json(result);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    return failure(error);
  }
}
export function failure(error: unknown) {
  const status = error instanceof AppError ? error.status : 500;
  console.error(
    status === 500 ? "API request failed" : `API request refused (${status})`,
    status === 500
      ? error instanceof Error
        ? error.message
        : "Unknown error"
      : "",
  );
  return Response.json(
    {
      error:
        error instanceof AppError
          ? error.message
          : "Server error. Please retry.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
