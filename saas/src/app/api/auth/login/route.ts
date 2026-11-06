import {
  appMode,
  failure,
  json,
  requestSafety,
  setTokens,
} from "@/lib/server/http";
import { AppError, assert, text } from "@/lib/server/core";
import { canUsePortal, parseSignInPortal } from "@/lib/access";
import type { Bootstrap } from "@/lib/types";
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
    const password = text(input.password, 200, true);
    assert(email.includes("@"), "Valid email required");
    if (appMode() === "local") {
      const token = local.login(
        email,
        password,
        request.headers.get("x-forwarded-for") || "local",
      );
      try {
        const boot = local.bootstrap(local.actor(token));
        assertApprovedAccount(boot, portal);
      } catch (error) {
        local.logout(token);
        throw error;
      }
      await setTokens(token);
    } else {
      const tokens = await remote.login(email, password);
      try {
        const boot = await remote.bootstrap(await remote.user(tokens.access));
        assertApprovedAccount(boot, portal);
      } catch (error) {
        await remote.logout(tokens.access).catch(() => undefined);
        throw error;
      }
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

function assertApprovedAccount(
  boot: Bootstrap,
  portal: ReturnType<typeof parseSignInPortal>,
) {
  assert(
    boot?.actor?.company_id &&
      boot.company?.id === boot.actor.company_id &&
      canUsePortal(boot.actor.role, portal),
    "Your account is not approved for this sign-in entrance. Ask your company administrator.",
    403,
  );
  assert(
    boot.actor.role === "company_admin" || boot.sites.length > 0,
    "Your account needs an authorised site assignment. Ask your company administrator.",
    403,
  );
}
