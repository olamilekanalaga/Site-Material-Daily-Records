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
    if (token) {
      if (appMode() === "local") local.logout(token);
      else await remote.logout(token);
    }
    await clearTokens();
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
