import { json, route } from "@/lib/server/http";
import { assert, parseDelivery, uuid } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  params: { params: Promise<{ id: string }> },
) {
  return route(
    request,
    async (c) => {
      const id = uuid((await params.params).id);
      const input = parseDelivery(await json(request));
      assert(input.id === id, "Delivery ID does not match path");
      assert(input.version !== undefined, "Version required for updates");
      return c.client
        ? remote.save(c.client, input)
        : local.save(c.actor, input, true);
    },
    true,
  );
}
