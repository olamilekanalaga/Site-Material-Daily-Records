import { test } from "node:test";
import assert from "node:assert/strict";
import { canUsePortal, parseSignInPortal } from "../../src/lib/access";
import type { Role } from "../../src/lib/types";

test("sign-in entrances reject unknown values rather than falling back to generic access", () => {
  for (const empty of [undefined, null, ""])
    assert.equal(parseSignInPortal(empty), null);
  assert.equal(parseSignInPortal("marshal"), "marshal");
  assert.equal(parseSignInPortal("supervisor"), "supervisor");
  for (const invalid of ["admin", "Supervisor", true, {}, ["marshal"]])
    assert.throws(() => parseSignInPortal(invalid), /valid sign-in entrance/);
});

test("stored roles control each entrance and platform administration grants no company access", () => {
  const roles: Role[] = [
    "gate",
    "supervisor",
    "site_manager",
    "project_manager",
    "commercial",
    "director",
    "company_admin",
    "platform_admin",
  ];
  assert.deepEqual(
    roles.filter((role) => canUsePortal(role, "marshal")),
    ["gate", "company_admin"],
  );
  assert.deepEqual(
    roles.filter((role) => canUsePortal(role, "supervisor")),
    ["supervisor", "site_manager", "company_admin"],
  );
  assert.deepEqual(
    roles.filter((role) => canUsePortal(role, null)),
    roles.slice(0, -1),
  );
  assert.equal(canUsePortal("unknown" as Role, null), false);
});
