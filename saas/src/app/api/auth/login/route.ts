import {
  appMode,
  failure,
  json,
  requestSafety,
  setTokens,
} from "@/lib/server/http";
import { AppError, assert, text } from "@/lib/server/core";
import { parseSignInPortal, staffDashboard } from "@/lib/access";
import { assertApprovedAccount } from "@/lib/server/approved-account";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requestSafety(request, true);
    const input = await json(request);
    let portal;
    try {
      portal = parseSignInPortal(input.portal);
    } catch {
      throw new AppError(400, "Choose a valid sign-in entrance.");
    }
    const email = text(input.email, 200, true).toLowerCase();
    const password = input.password;
    assert(
      typeof password === "string" &&
        password.length > 0 &&
        email.includes("@"),
      "Invalid email or password",
      401,
    );
    const remember = input.remember === true;
    let destination;
    if (appMode() === "local") {
      const token = local.login(
        email,
        password,
        request.headers.get("x-forwarded-for") || "local",
        remember,
      );
      try {
        const boot = local.bootstrap(local.actor(token));
        assertApprovedAccount(boot, portal);
        destination = staffDashboard(boot.actor.role);
      } catch (error) {
        local.logout(token);
        throw error;
      }
      await setTokens(token, undefined, remember);
    } else {
      const tokens = await remote.login(email, password);
      try {
        const boot = await remote.bootstrap(await remote.user(tokens.access));
        assertApprovedAccount(boot, portal);
        destination = staffDashboard(boot.actor.role);
      } catch (error) {
        await remote.logout(tokens.access).catch(() => undefined);
        throw error;
      }
      await setTokens(tokens.access, tokens.refresh, remember);
    }
    return Response.json(
      { ok: true, destination },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
