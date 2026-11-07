import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assert, uuid } from "@/lib/server/core";
import { route } from "@/lib/server/http";
import { remote } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(request, async (session) => {
    const id = uuid((await context.params).id);
    let data: Uint8Array;
    let mime: string;
    if (session.client) {
      ({ data, mime } = await remote.marshalPhoto(session.client, id));
    } else {
      const boot = await session.bootstrap();
      const marshal = boot.marshals?.find((person) => person.id === id);
      assert(marshal && marshal.photo_path, "Profile photo not found", 404);
      assert(
        /^\/marshals\/[a-z0-9-]+\.jpg$/.test(marshal.photo_path),
        "Profile photo not found",
        404,
      );
      data = await readFile(
        resolve(process.cwd(), "public", marshal.photo_path.slice(1)),
      );
      mime = "image/jpeg";
    }
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
