import { cookies } from "next/headers";
import {
  appMode,
  clearTokens,
  failure,
  requestSafety,
} from "@/lib/server/http";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requestSafety(request, true);
    const token = (await cookies()).get("delivery_session")?.value;
    let remoteRevoked = true;
    try {
      if (token) {
        if (appMode() === "local") local.logout(token);
        else await remote.logout(token);
      }
    } catch {
      remoteRevoked = false;
      // Provider tokens can remain valid until expiry. Do not log the token or
      // describe this as an all-device sign-out; the browser still signs out.
      console.warn("Remote sign-out unavailable; browser session cleared");
    } finally {
      // A provider outage must not trap staff in a browser session.
      await clearTokens();
    }
    return Response.json(
      { ok: true, remote_revoked: remoteRevoked },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
