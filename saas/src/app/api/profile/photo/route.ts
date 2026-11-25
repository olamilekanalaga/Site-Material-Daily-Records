import { assertApprovedAccount } from "@/lib/server/approved-account";
import { photoForm, profilePhoto } from "@/lib/server/auth-input";
import { assert } from "@/lib/server/core";
import { route } from "@/lib/server/http";
import { remote } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return route(request, async ({ client, actor }) => {
    assert(client && actor, "Staff photo not found", 404);
    const { data, mime } = await remote.profilePhoto(
      client,
      `profiles/${actor.id}`,
    );
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": mime,
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}

export async function POST(request: Request) {
  return route(
    request,
    async ({ client, bootstrap }) => {
      assert(client, "Staff profile storage is unavailable.", 503);
      const boot = await bootstrap();
      assertApprovedAccount(boot);
      const { bytes, mime } = await profilePhoto(await photoForm(request));
      await remote.saveProfilePhoto(client, boot.actor.id, bytes, mime);
      return { ok: true };
    },
    true,
  );
}
