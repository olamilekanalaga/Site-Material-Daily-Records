import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Bootstrap } from "../../src/lib/types";

const baseURL = "http://127.0.0.1:3100";
const password = "DemoPass123!";
const createContext = () =>
  request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });

function signIn(
  context: APIRequestContext,
  email: string,
  portal?: unknown,
  extra = {},
) {
  return context.post("/api/auth/login", {
    data: {
      email,
      password,
      ...(portal === undefined ? {} : { portal }),
      ...extra,
    },
  });
}

for (const [email, portal, role] of [
  ["gate@demo.invalid", "marshal", "gate"],
  ["supervisor@demo.invalid", "supervisor", "supervisor"],
  ["manager@demo.invalid", "supervisor", "site_manager"],
  ["admin@demo.invalid", "marshal", "company_admin"],
  ["admin@demo.invalid", "supervisor", "company_admin"],
] as const) {
  test(`approved ${role} can sign in through the ${portal} entrance`, async () => {
    const context = await createContext();
    try {
      const response = await signIn(context, email, portal);
      expect(response.status(), await response.text()).toBe(200);
      const boot = await context.get(`/api/bootstrap?portal=${portal}`);
      expect(boot.status(), await boot.text()).toBe(200);
      expect(((await boot.json()) as Bootstrap).actor.role).toBe(role);
      const cookie = (await context.storageState()).cookies.find(
        (item) => item.name === "delivery_session",
      );
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("Strict");
    } finally {
      await context.dispose();
    }
  });
}

for (const [email, portal] of [
  ["gate@demo.invalid", "supervisor"],
  ["supervisor@demo.invalid", "marshal"],
  ["manager@demo.invalid", "marshal"],
] as const) {
  test(`wrong entrance ${portal} denies ${email} before issuing a session`, async () => {
    const context = await createContext();
    try {
      const response = await signIn(context, email, portal, {
        role: "company_admin",
        approved: true,
      });
      expect(response.status(), await response.text()).toBe(403);
      expect(response.headers()["set-cookie"]).toBeUndefined();
      expect((await context.storageState()).cookies).toHaveLength(0);
      expect((await context.get("/api/bootstrap")).status()).toBe(401);
    } finally {
      await context.dispose();
    }
  });
}

test("existing marshal sessions cannot read the supervisor portal bootstrap or assign roles", async () => {
  const context = await createContext();
  try {
    expect(
      (await signIn(context, "gate@demo.invalid", "marshal")).status(),
    ).toBe(200);
    expect(
      (await context.get("/api/bootstrap?portal=supervisor")).status(),
    ).toBe(403);
    const denied = await context.post("/api/admin", {
      data: {
        action: "member",
        email: "stranger@demo.invalid",
        name: "Unapproved",
        role: "supervisor",
        site_ids: [],
      },
    });
    expect(denied.status()).toBe(403);
    const own = (await (
      await context.get("/api/bootstrap")
    ).json()) as Bootstrap;
    expect(own.actor.role).toBe("gate");
  } finally {
    await context.dispose();
  }
});

test("unknown entrance values reject login and bootstrap rather than granting generic access", async () => {
  const context = await createContext();
  try {
    for (const invalid of ["admin", true, { role: "supervisor" }]) {
      const response = await signIn(context, "gate@demo.invalid", invalid);
      expect(response.status(), await response.text()).toBe(400);
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
    expect(
      (await signIn(context, "gate@demo.invalid", "marshal")).status(),
    ).toBe(200);
    expect((await context.get("/api/bootstrap?portal=admin")).status()).toBe(
      400,
    );
  } finally {
    await context.dispose();
  }
});

test("an owner must assign a supervisor to an authorised site before sign-in is allowed", async () => {
  const admin = await createContext();
  const applicant = await createContext();
  const email = `pending-${randomUUID().slice(0, 8)}@demo.invalid`;
  try {
    expect(
      (await signIn(admin, "admin@demo.invalid", "supervisor")).status(),
    ).toBe(200);
    const boot = (await (
      await admin.get("/api/bootstrap")
    ).json()) as Bootstrap;
    const created = await admin.post("/api/admin", {
      data: {
        action: "member",
        email,
        name: "Pending supervisor",
        password,
        role: "supervisor",
        site_ids: [],
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const refused = await signIn(applicant, email, "supervisor");
    expect(refused.status(), await refused.text()).toBe(403);
    expect(refused.headers()["set-cookie"]).toBeUndefined();
    expect(
      (await applicant.get("/api/bootstrap?portal=supervisor")).status(),
    ).toBe(401);
    const assigned = await admin.post("/api/admin", {
      data: {
        action: "member",
        email,
        role: "supervisor",
        site_ids: [boot.sites[0].id],
      },
    });
    expect(assigned.status(), await assigned.text()).toBe(200);
    expect((await signIn(applicant, email, "supervisor")).status()).toBe(200);
    expect(
      (await applicant.get("/api/bootstrap?portal=supervisor")).status(),
    ).toBe(200);
  } finally {
    await Promise.all([admin.dispose(), applicant.dispose()]);
  }
});
