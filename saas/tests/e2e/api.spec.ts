import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Bootstrap, Delivery, DeliveryInput } from "../../src/lib/types";

const origin = "http://127.0.0.1:3100";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWh8AAAAASUVORK5CYII=",
  "base64",
);
let gate: APIRequestContext;
let supervisor: APIRequestContext;
let manager: APIRequestContext;
let admin: APIRequestContext;
let initial: Bootstrap;

async function login(email: string) {
  const context = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const response = await context.post("/api/auth/login", {
    data: { email, password: "DemoPass123!" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return context;
}

async function bootstrap(context: APIRequestContext): Promise<Bootstrap> {
  const result = await context.get("/api/bootstrap");
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

function input(patch: Partial<DeliveryInput> = {}): DeliveryInput {
  return {
    id: randomUUID(),
    site_id: initial.sites[0].id,
    material_id: initial.materials[0].id,
    supplier_id: initial.suppliers[0].id,
    vehicle: "DEMO 101",
    ticket_number: `DEMO-${randomUUID().slice(0, 8)}`,
    ticket_quantity: 20,
    ticket_unit: "tonnes",
    arrival_at: new Date().toISOString(),
    notes: "Fictional automated test delivery",
    intent: "submit",
    ...patch,
  };
}

async function create(data = input()): Promise<Delivery> {
  const result = await gate.post("/api/deliveries", { data });
  expect([200, 201], await result.text()).toContain(result.status());
  return (await result.json()).delivery;
}

test.beforeAll(async () => {
  gate = await login("gate@demo.invalid");
  supervisor = await login("supervisor@demo.invalid");
  manager = await login("manager@demo.invalid");
  admin = await login("admin@demo.invalid");
  initial = await bootstrap(gate);
});

test.afterAll(async () => {
  await Promise.all(
    [gate, supervisor, manager, admin]
      .filter(Boolean)
      .map((context) => context.dispose()),
  );
});

test("authentication is required, bad passwords rejected, logout revokes session", async () => {
  const unauthenticated = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  expect((await unauthenticated.get("/api/bootstrap")).status()).toBe(401);
  expect(
    (
      await unauthenticated.post("/api/auth/login", {
        data: { email: "gate@demo.invalid", password: "wrong" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (await unauthenticated.post("/api/deliveries", { data: input() })).status(),
  ).toBe(401);
  await unauthenticated.dispose();
  const disposable = await login("manager@demo.invalid");
  expect((await disposable.post("/api/auth/logout")).ok()).toBeTruthy();
  expect((await disposable.get("/api/bootstrap")).status()).toBe(401);
  await disposable.dispose();
});

test("manual submission is persistent and retrying the same ID does not add an arrival", async () => {
  const data = input();
  const before = await bootstrap(gate);
  const delivery = await create(data);
  expect(delivery.status).toBe("Submitted");
  expect(delivery.created_by).toBe(initial.actor.id);
  expect(delivery.ticket_quantity).toBe(20);
  expect(delivery.accepted_quantity).toBeNull();
  expect(delivery.commercial_status).toBe("Not Linked");
  const repeated = await gate.post("/api/deliveries", { data });
  expect(repeated.ok(), await repeated.text()).toBeTruthy();
  const after = await bootstrap(gate);
  expect(after.deliveries.filter((row) => row.id === data.id)).toHaveLength(1);
  expect(after.deliveries.length).toBe(before.deliveries.length + 1);
});

test("photo evidence is private, immutable and upload retries are idempotent", async () => {
  const delivery = await create(input({ intent: "draft" }));
  const evidenceId = randomUUID();
  const upload = () =>
    gate.post(`/api/deliveries/${delivery.id}/evidence`, {
      multipart: {
        id: evidenceId,
        kind: "ticket",
        file: {
          name: "fictional-ticket.png",
          mimeType: "image/png",
          buffer: png,
        },
      },
    });
  const uploaded = await upload();
  expect([200, 201], await uploaded.text()).toContain(uploaded.status());
  expect((await upload()).ok()).toBeTruthy();
  // A connection loss between file upload and submission must be recoverable.
  const retryDraft = await gate.post("/api/deliveries", {
    data: input({ id: delivery.id, intent: "draft" }),
  });
  expect(retryDraft.ok(), await retryDraft.text()).toBeTruthy();
  const latest = (await bootstrap(gate)).deliveries.find(
    (row) => row.id === delivery.id,
  )!;
  expect(latest.evidence).toHaveLength(1);
  // Draft evidence stays with its recorder until submission.
  expect((await supervisor.get(`/api/evidence/${evidenceId}`)).status()).toBe(
    404,
  );
  const authorised = await gate.get(`/api/evidence/${evidenceId}`);
  expect(authorised.status()).toBe(200);
  expect(authorised.headers()["content-type"]).toContain("image/png");
  expect(await authorised.body()).toEqual(png);
  const outsider = await request.newContext({ baseURL: origin });
  expect((await outsider.get(`/api/evidence/${evidenceId}`)).status()).toBe(
    401,
  );
  await outsider.dispose();
  const invalid = await gate.post(`/api/deliveries/${delivery.id}/evidence`, {
    multipart: {
      id: randomUUID(),
      kind: "ticket",
      file: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("<script>bad()</script>"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  expect(
    (
      await gate.patch(`/api/deliveries/${delivery.id}`, {
        data: input({
          id: delivery.id,
          intent: "submit",
          version: latest.version,
        }),
      })
    ).ok(),
  ).toBeTruthy();
  expect((await supervisor.get(`/api/evidence/${evidenceId}`)).status()).toBe(
    200,
  );
});

test("duplicate supplier ticket warns without silently deleting a legitimate arrival", async () => {
  const ticket = `DUP-${randomUUID().slice(0, 8)}`;
  const first = await create(input({ ticket_number: ticket }));
  const second = await gate.post("/api/deliveries", {
    data: input({ ticket_number: ticket.toLowerCase() }),
  });
  expect(second.ok(), await second.text()).toBeTruthy();
  const result = await second.json();
  expect(result.delivery.id).not.toBe(first.id);
  expect(result.warnings.length).toBeGreaterThan(0);
});

test("gate cannot approve, supervisor accepts quantity separately and manager sees audited decision", async () => {
  const delivery = await create();
  const data = {
    decision: "Accepted",
    reason: "Physical receipt checked in fictional test",
    accepted_quantity: 18.5,
    accepted_unit: "tonnes",
    version: delivery.version,
  };
  expect(
    (
      await gate.post(`/api/deliveries/${delivery.id}/review`, { data })
    ).status(),
  ).toBe(403);
  expect(
    (
      await manager.post(`/api/deliveries/${delivery.id}/review`, { data })
    ).status(),
  ).toBe(403);
  const response = await supervisor.post(
    `/api/deliveries/${delivery.id}/review`,
    { data },
  );
  expect(response.status(), await response.text()).toBe(200);
  const accepted = (await response.json()).delivery as Delivery;
  expect(accepted.status).toBe("Accepted");
  expect(accepted.ticket_quantity).toBe(20);
  expect(accepted.accepted_quantity).toBe(18.5);
  expect(accepted.reviews.at(-1)?.reviewer_id).not.toBe(delivery.created_by);
  expect(accepted.commercial_status).toBe("Not Linked");
  const reportState = await bootstrap(manager);
  expect(
    reportState.deliveries.find((row) => row.id === delivery.id)?.status,
  ).toBe("Accepted");
  expect(
    reportState.audit.filter((event) => event.entity_id === delivery.id).length,
  ).toBeGreaterThanOrEqual(2);
  const rewrite = await gate.patch(`/api/deliveries/${delivery.id}`, {
    data: input({
      id: delivery.id,
      version: accepted.version,
      ticket_quantity: 900,
    }),
  });
  expect([403, 409], await rewrite.text()).toContain(rewrite.status());
});

test("rejection and flags require reasons and invalid stale transitions fail", async () => {
  for (const decision of ["Rejected", "Flagged"] as const) {
    const delivery = await create();
    const data = {
      decision,
      reason: "",
      accepted_quantity: null,
      accepted_unit: null,
      version: delivery.version,
    };
    const noReason = await supervisor.post(
      `/api/deliveries/${delivery.id}/review`,
      { data },
    );
    expect(noReason.status()).toBe(400);
    const response = await supervisor.post(
      `/api/deliveries/${delivery.id}/review`,
      { data: { ...data, reason: "Fictional delivery discrepancy" } },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    const changed = (await response.json()).delivery;
    expect(changed.status).toBe(decision);
    const stale = await supervisor.post(
      `/api/deliveries/${delivery.id}/review`,
      {
        data: {
          ...data,
          decision: "Accepted",
          reason: "Stale decision",
          accepted_quantity: 20,
          accepted_unit: "tonnes",
        },
      },
    );
    expect(stale.status()).toBe(409);
  }
});

test("correction preserves original entry and resubmission does not double count", async () => {
  const data = input({ ticket_number: "" });
  const delivery = await create(data);
  const correction = await supervisor.post(
    `/api/deliveries/${delivery.id}/review`,
    {
      data: {
        decision: "Correction Requested",
        reason: "Add missing ticket number",
        accepted_quantity: null,
        accepted_unit: null,
        version: delivery.version,
      },
    },
  );
  expect(correction.ok(), await correction.text()).toBeTruthy();
  const requested = (await correction.json()).delivery as Delivery;
  const update = await gate.patch(`/api/deliveries/${delivery.id}`, {
    data: {
      ...data,
      ticket_number: "DEMO-CORRECTED",
      version: requested.version,
      intent: "submit",
    },
  });
  expect(update.ok(), await update.text()).toBeTruthy();
  const state = await bootstrap(manager);
  expect(state.deliveries.filter((row) => row.id === delivery.id)).toHaveLength(
    1,
  );
  expect(state.deliveries.find((row) => row.id === delivery.id)?.status).toBe(
    "Submitted",
  );
  const events = state.audit.filter((event) => event.entity_id === delivery.id);
  expect(events.length).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(events)).toContain("DEMO-CORRECTED");
});

test("cross-site references and fabricated tenant/catalogue IDs cannot be used", async () => {
  for (const patch of [
    { site_id: randomUUID() },
    { material_id: randomUUID() },
    { supplier_id: randomUUID() },
    { site_id: "20000000-0000-4000-8000-000000000002" },
    { site_id: "20000000-0000-4000-8000-000000000003" },
    { material_id: "30000000-0000-4000-8000-000000000099" },
  ]) {
    const denied = await gate.post("/api/deliveries", { data: input(patch) });
    expect([400, 403, 404], await denied.text()).toContain(denied.status());
  }
  expect(
    (
      await supervisor.post(`/api/deliveries/${randomUUID()}/review`, {
        data: {
          decision: "Accepted",
          accepted_quantity: 1,
          accepted_unit: "loads",
          reason: "",
          version: 1,
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await gate.post("/api/admin", {
        data: { action: "site", name: "Unauthorised site" },
      })
    ).status(),
  ).toBe(403);
});

test("another company and an unassigned site cannot read, modify, review or download records", async () => {
  const record = await create(input({ intent: "draft" }));
  const evidenceId = randomUUID();
  expect(
    (
      await gate.post(`/api/deliveries/${record.id}/evidence`, {
        multipart: {
          id: evidenceId,
          kind: "ticket",
          file: { name: "fictional.png", mimeType: "image/png", buffer: png },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const otherCompany = await login("other@demo.invalid");
  const otherSite = await login("restricted@demo.invalid");
  for (const context of [otherCompany, otherSite]) {
    const state = await bootstrap(context);
    expect(state.deliveries.some((row) => row.id === record.id)).toBeFalsy();
    expect(
      state.audit.some((event) => event.entity_id === record.id),
    ).toBeFalsy();
    expect((await context.get(`/api/evidence/${evidenceId}`)).status()).toBe(
      404,
    );
    expect([403, 404]).toContain(
      (
        await context.patch(`/api/deliveries/${record.id}`, {
          data: input({ id: record.id, version: record.version }),
        })
      ).status(),
    );
    expect(
      (
        await context.post(`/api/deliveries/${record.id}/review`, {
          data: {
            decision: "Accepted",
            accepted_quantity: 20,
            accepted_unit: "tonnes",
            reason: "",
            version: record.version,
          },
        })
      ).status(),
    ).toBe(404);
    await context.dispose();
  }
});

test("supervisors cannot create gate captures and directors cannot bypass controls", async () => {
  const creation = await supervisor.post("/api/deliveries", { data: input() });
  expect(creation.status(), await creation.text()).toBe(403);
  const delivery = await create();
  const data = {
    decision: "Accepted",
    reason: "",
    accepted_quantity: 20,
    accepted_unit: "tonnes",
    version: delivery.version,
  };
  const director = await login("director@demo.invalid");
  expect(
    (
      await director.post(`/api/deliveries/${delivery.id}/review`, { data })
    ).status(),
  ).toBe(403);
  expect(
    (
      await director.patch(`/api/deliveries/${delivery.id}`, {
        data: input({ id: delivery.id, version: delivery.version }),
      })
    ).status(),
  ).toBe(403);
  await director.dispose();
});

test("changing a recorder to supervisor still cannot approve their own earlier arrival", async () => {
  const delivery = await create();
  try {
    const promote = await admin.post("/api/admin", {
      data: {
        action: "member",
        email: "gate@demo.invalid",
        role: "supervisor",
        site_ids: [delivery.site_id],
      },
    });
    expect(promote.ok(), await promote.text()).toBeTruthy();
    const decision = await gate.post(`/api/deliveries/${delivery.id}/review`, {
      data: {
        decision: "Accepted",
        reason: "Cannot approve own gate record",
        accepted_quantity: 20,
        accepted_unit: "tonnes",
        version: delivery.version,
      },
    });
    expect(decision.status()).toBe(403);
    expect(
      (await bootstrap(manager)).deliveries.find(
        (row) => row.id === delivery.id,
      )?.status,
    ).toBe("Submitted");
  } finally {
    const restore = await admin.post("/api/admin", {
      data: {
        action: "member",
        email: "gate@demo.invalid",
        role: "gate",
        site_ids: [delivery.site_id],
      },
    });
    expect(restore.ok(), await restore.text()).toBeTruthy();
  }
});

test("quantities keep units, negative values are rejected, CSV export is authorised", async () => {
  const delivery = await create(
    input({ ticket_quantity: 3.25, ticket_unit: "m³" }),
  );
  const invalid = await gate.post("/api/deliveries", {
    data: input({ ticket_quantity: -5 }),
  });
  expect(invalid.status()).toBe(400);
  const response = await supervisor.post(
    `/api/deliveries/${delivery.id}/review`,
    {
      data: {
        decision: "Accepted",
        reason: "Volume verified independently",
        accepted_quantity: 3,
        accepted_unit: "m³",
        version: delivery.version,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const csv = await manager.get(
    `/api/reports?site_id=${delivery.site_id}&date=${new Date().toISOString().slice(0, 10)}&format=csv`,
  );
  expect(csv.status(), await csv.text()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const contents = await csv.text();
  expect(contents).toContain(delivery.ticket_number);
  expect(contents).toContain("m³");
  expect(contents).toContain("3.25");
});

test("incomplete arrivals can be recorded but site policy blocks acceptance until correction", async () => {
  const data = input({
    supplier_id: null,
    ticket_number: "",
    ticket_quantity: null,
  });
  const delivery = await create(data);
  expect(delivery.status).toBe("Submitted");
  const decision = {
    decision: "Accepted",
    reason: "",
    accepted_quantity: 5,
    accepted_unit: "tonnes",
    version: delivery.version,
  };
  expect(
    (
      await supervisor.post(`/api/deliveries/${delivery.id}/review`, {
        data: decision,
      })
    ).status(),
  ).toBe(400);
  const policy = await admin.post("/api/admin", {
    data: {
      action: "settings",
      site_id: data.site_id,
      require_ticket: true,
      require_photo: true,
    },
  });
  expect(policy.ok(), await policy.text()).toBeTruthy();
  try {
    const complete = await create(input());
    const noPhoto = await supervisor.post(
      `/api/deliveries/${complete.id}/review`,
      { data: { ...decision, version: complete.version } },
    );
    expect(noPhoto.status()).toBe(400);
    expect(
      (await bootstrap(manager)).deliveries.find(
        (row) => row.id === complete.id,
      )?.status,
    ).toBe("Submitted");
  } finally {
    const restore = await admin.post("/api/admin", {
      data: {
        action: "settings",
        site_id: data.site_id,
        require_ticket: false,
        require_photo: false,
      },
    });
    expect(restore.ok(), await restore.text()).toBeTruthy();
  }
});

test("cross-origin mutations are rejected", async () => {
  const context = await request.newContext({
    baseURL: origin,
    storageState: await gate.storageState(),
    extraHTTPHeaders: { Origin: "https://hostile.invalid" },
  });
  expect(
    (await context.post("/api/deliveries", { data: input() })).status(),
  ).toBe(403);
  await context.dispose();
});

test("client cannot forge tenant, creator, receipt status or server timestamps", async () => {
  const data = input();
  const response = await gate.post("/api/deliveries", {
    data: {
      ...data,
      company_id: "10000000-0000-4000-8000-000000000002",
      created_by: randomUUID(),
      creator_name: "Forged reviewer",
      status: "Accepted",
      accepted_quantity: 999,
      created_at: "1990-01-01T00:00:00Z",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const record = (await response.json()).delivery as Delivery;
  expect(record.company_id).toBe(initial.actor.company_id);
  expect(record.created_by).toBe(initial.actor.id);
  expect(record.status).toBe("Submitted");
  expect(record.accepted_quantity).toBeNull();
  expect(Date.parse(record.created_at)).toBeGreaterThan(Date.now() - 60_000);
});
