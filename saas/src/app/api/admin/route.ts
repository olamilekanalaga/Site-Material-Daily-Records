import { json, route } from "@/lib/server/http";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
import { assert } from "@/lib/server/core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return route(
    request,
    async (c) => {
      const input = await json(request);
      for (const flag of ["require_ticket", "require_photo", "active"])
        if (input[flag] !== undefined)
          assert(
            typeof input[flag] === "boolean",
            `${flag} must be true or false`,
          );
      return c.client
        ? remote.admin(c.client, input)
        : local.admin(c.actor, input);
    },
    true,
  );
}
