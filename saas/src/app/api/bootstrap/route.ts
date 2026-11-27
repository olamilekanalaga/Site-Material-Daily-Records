import { after } from "next/server";
import { route } from "@/lib/server/http";
import { AppError, assert } from "@/lib/server/core";
import { remote } from "@/lib/server/supabase";
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
      "This sign-in page is for a different staff role. Use the main sign-in page.",
      403,
    );
    assert(
      !portal ||
        c.actor.role === "company_admin" ||
        c.actor.site_ids.length > 0,
      "Your account needs an authorised site assignment. Ask your company administrator.",
      403,
    );
    const workspace = await c.bootstrap();
    const client = c.client;
    if (client) {
      const replacedPaths = workspace.deliveries
        .flatMap((record) =>
          (record.pending_photo_cleanup ?? []).map(
            (id) => `${record.company_id}/${record.site_id}/${record.id}/${id}`,
          ),
        )
        .slice(0, 50);
      if (replacedPaths.length) {
        after(async () => {
          await remote.removeReplacedPhotos(client, replacedPaths);
        });
      }
    }
    return workspace;
  });
}
