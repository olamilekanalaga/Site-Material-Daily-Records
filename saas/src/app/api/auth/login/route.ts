import {
  appMode,
  failure,
  json,
  requestSafety,
  setTokens,
} from "@/lib/server/http";
import { assert, text } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requestSafety(request, true);
    const input = await json(request);
    const email = text(input.email, 200, true).toLowerCase();
    const password = text(input.password, 200, true);
    assert(email.includes("@"), "Valid email required");
    if (appMode() === "local") {
      const token = local.login(
        email,
        password,
        request.headers.get("x-forwarded-for") || "local",
      );
      await setTokens(token);
    } else {
      const tokens = await remote.login(email, password);
      await setTokens(tokens.access, tokens.refresh);
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
