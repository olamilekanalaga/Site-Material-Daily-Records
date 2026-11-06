import { route } from "@/lib/server/http";
import { AppError, assert } from "@/lib/server/core";
import { canUsePortal, parseSignInPortal } from "@/lib/access";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(request, async (c) => {
    let portal;
    try {
      portal = parseSignInPortal(
        new URL(request.url).searchParams.get("portal"),
      );
    } catch {
      throw new AppError(400, "Choose a valid sign-in entrance.");
    }
    assert(
      canUsePortal(c.actor.role, portal),
      "Your account is not approved for this sign-in entrance. Ask your company administrator.",
      403,
    );
    assert(
      !portal ||
        c.actor.role === "company_admin" ||
        c.actor.site_ids.length > 0,
      "Your account needs an authorised site assignment. Ask your company administrator.",
      403,
    );
    return c.bootstrap();
  });
}
