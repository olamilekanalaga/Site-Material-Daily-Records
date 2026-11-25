import { canUsePortal, type SignInPortal } from "@/lib/access";
import type { Bootstrap } from "@/lib/types";
import { assert } from "./core";

export function assertApprovedAccount(
  boot: Bootstrap,
  portal: SignInPortal | null = null,
) {
  assert(
    boot?.actor?.company_id &&
      boot.company?.id === boot.actor.company_id &&
      canUsePortal(boot.actor.role, portal),
    "Your account is not approved for this sign-in entrance. Ask your company administrator.",
    403,
  );
  assert(
    boot.actor.role === "company_admin" || boot.sites.length > 0,
    "Your account needs an authorised site assignment. Ask your company administrator.",
    403,
  );
}
