import { json, captureRoute } from "@/lib/server/http";
import { parseSimpleDelivery } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return captureRoute(request, async (context) => {
    const input = parseSimpleDelivery(await json(request));
    return context.client
      ? remote.log(context.client, input)
      : local.log(context.actor, input);
  });
}
