import { json, route } from "@/lib/server/http";
import { parseReview, uuid } from "@/lib/server/core";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  params: { params: Promise<{ id: string }> },
) {
  return route(
    request,
    async (c) => {
      const id = uuid((await params.params).id);
      const input = parseReview(await json(request));
      return c.client
        ? remote.review(c.client, id, input)
        : local.review(c.actor, id, input);
    },
    true,
  );
}
