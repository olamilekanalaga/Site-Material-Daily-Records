import { uuid } from "@/lib/server/core";
import { route } from "@/lib/server/http";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  params: { params: Promise<{ id: string }> },
) {
  return route(request, async (c) => {
    const id = uuid((await params.params).id);
    const { evidence, data } = c.client
      ? await remote.file(c.client, id)
      : local.file(c.actor, id);
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": evidence.mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(evidence.name)}`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
