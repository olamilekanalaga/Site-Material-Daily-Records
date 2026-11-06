import { test } from "node:test";
import assert from "node:assert/strict";
import { synchroniseDraft, type LocalDraft } from "../../src/lib/client/offline";
const draft: LocalDraft = {
  id: "30000000-0000-4000-8000-000000000001",
  owner: "company:gate",
  state: "pending",
  updated_at: new Date().toISOString(),
  photos: [],
  input: {
    id: "30000000-0000-4000-8000-000000000001",
    site_id: "site",
    material_id: "mat",
    supplier_id: null,
    vehicle: "DEMO",
    ticket_number: "F01",
    ticket_quantity: 10,
    ticket_unit: "tonnes",
    arrival_at: "2026-10-20T07:00:00Z",
    notes: "Fictional",
    intent: "submit",
  },
};
test("simultaneous offline retries share one in-flight submission", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json(
      String(url) === "/api/deliveries"
        ? {
            delivery: { status: "Draft", version: 1, evidence: [] },
            warnings: [],
          }
        : { warnings: ["Possible duplicate ticket"] },
    );
  };
  try {
    const a = synchroniseDraft(draft),
      b = synchroniseDraft(draft);
    assert.equal(a, b);
    assert.deepEqual(await a, ["Possible duplicate ticket"]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.intent, "submit");
  } finally {
    globalThis.fetch = original;
  }
});
test("resuming a correction preserves original optimistic version and idempotent lookup omits version", async () => {
  const original = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json(
      bodies.length === 1
        ? {
            delivery: {
              status: "Correction Requested",
              version: 7,
              evidence: [],
            },
            warnings: [],
          }
        : { warnings: [] },
    );
  };
  try {
    await synchroniseDraft({ ...draft, input: { ...draft.input, version: 4 } });
    assert.equal("version" in bodies[0], false);
    assert.equal(bodies[1].version, 4);
  } finally {
    globalThis.fetch = original;
  }
});
test("lost successful response retry does not resubmit or regress a verified delivery", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      delivery: { status: "Accepted", version: 3, evidence: [] },
      warnings: [],
    });
  };
  try {
    await synchroniseDraft(draft);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("recovered upload skips persisted evidence IDs and uploads only missing files", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    return Response.json(
      String(url) === "/api/deliveries"
        ? {
            delivery: {
              status: "Draft",
              version: 1,
              evidence: [{ id: "existing" }],
            },
            warnings: [],
          }
        : {},
    );
  };
  try {
    const photo = new File(["fictional"], "demo.jpg", { type: "image/jpeg" });
    await synchroniseDraft({
      ...draft,
      photos: [
        { id: "existing", kind: "ticket", file: photo },
        { id: "new", kind: "load", file: photo },
      ],
    });
    assert.equal(calls.length, 3);
    assert(calls[1].body instanceof FormData);
    assert.equal(calls[1].body.get("id"), "new");
  } finally {
    globalThis.fetch = original;
  }
});
