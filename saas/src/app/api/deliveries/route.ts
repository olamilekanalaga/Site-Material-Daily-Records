import { json, route } from "@/lib/server/http";
import { parseDelivery } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return route(
    request,
    async (c) => {
      const input = parseDelivery(await json(request));
      return c.client
        ? remote.save(c.client, input)
        : local.save(c.actor, input);
    },
    true,
  );
}
