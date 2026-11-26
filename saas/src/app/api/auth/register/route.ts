import { staffDashboard } from "@/lib/access";
import { assertApprovedAccount } from "@/lib/server/approved-account";
import {
  newPassword,
  photoForm,
  profilePhoto,
  staffEmail,
} from "@/lib/server/auth-input";
import { staffRegistrationEnabled } from "@/lib/server/config";
import { assert, text } from "@/lib/server/core";
import { failure, requestSafety, setTokens } from "@/lib/server/http";
import { remote } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requestSafety(request, true);
    assert(
      staffRegistrationEnabled(),
      "Staff registration is unavailable.",
      503,
    );
    const form = await photoForm(request);
    const email = staffEmail(form.get("email"));
    const password = newPassword(
      form.get("password"),
      form.get("confirmPassword"),
    );
    const first_name = text(form.get("firstName"), 59, true);
    const last_name = text(form.get("lastName"), 60, true);
    const phone = text(form.get("phone"), 40, true).replace(/[\s().-]/g, "");
    assert(/^\+?\d{7,15}$/.test(phone), "Enter a valid phone number.");
    const requested_role = String(form.get("role"));
    assert(
      ["gate", "supervisor", "site_manager"].includes(requested_role),
      "Choose your approved role.",
    );
    const picture = await profilePhoto(form);

    const tokens = await remote.register(email, password, {
      first_name,
      last_name,
      phone,
      requested_role,
    });
    let destination;
    let photoPending = false;
    try {
      const client = await remote.user(tokens.access);
      const boot = await remote.bootstrap(client);
      assertApprovedAccount(boot);
      destination = staffDashboard(boot.actor.role);
      try {
        await remote.saveProfilePhoto(
          client,
          boot.actor.id,
          picture.bytes,
          picture.mime,
        );
      } catch {
        photoPending = true;
      }
      await setTokens(tokens.access, tokens.refresh, true);
    } catch (problem) {
      await remote.logout(tokens.access).catch(() => undefined);
      throw problem;
    }
    return Response.json(
      { destination, photoPending },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (problem) {
    return failure(problem);
  }
}
