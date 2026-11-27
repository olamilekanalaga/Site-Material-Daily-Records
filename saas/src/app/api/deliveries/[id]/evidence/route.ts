import type { Evidence } from "@/lib/types";
import { deliveryPhotoLimit } from "@/lib/delivery-photo";
import { assert, sniffImage, text, uuid } from "@/lib/server/core";
import { readBytes, captureRoute } from "@/lib/server/http";
import { local } from "@/lib/server/local";
import { remote } from "@/lib/server/supabase";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  params: { params: Promise<{ id: string }> },
) {
  return captureRoute(request, async (c) => {
    const deliveryId = uuid((await params.params).id);
    assert(
      request.headers.get("content-type")?.startsWith("multipart/form-data"),
      "Photograph form required",
      415,
    );
    const bytes = await readBytes(request, 3 * 1024 * 1024 + 16384);
    const bounded = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type")! },
      body: bytes,
    });
    const form = await bounded.formData();
    const replacesId = form.has("replaces_id")
      ? uuid(form.get("replaces_id"))
      : undefined;
    const file = form.get("file");
    assert(file instanceof File && file.size > 0, "Choose a photograph");
    assert(file.size <= 3 * 1024 * 1024, "Photograph exceeds 3 MiB", 413);
    if (replacesId)
      assert(
        file.size <= deliveryPhotoLimit,
        "Replacement photos must be 500 KB or less",
        413,
      );
    const image = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(image);
    assert(file.type === mime, "Photograph content does not match file type");
    const kind = form.get("kind");
    assert(
      ["ticket", "vehicle", "load"].includes(String(kind)),
      "Invalid photograph kind",
    );
    const id = uuid(form.get("id"));
    const name = text(file.name.replace(/[\r\n/\\]/g, "_"), 200, true);
    return c.client
      ? remote.evidence(
          c.client,
          deliveryId,
          id,
          kind as Evidence["kind"],
          name,
          mime,
          image,
          replacesId,
        )
      : local.evidence(
          c.actor,
          deliveryId,
          id,
          kind as Evidence["kind"],
          name,
          mime,
          image,
          replacesId,
        );
  });
}
