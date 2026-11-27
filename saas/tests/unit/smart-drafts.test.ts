import { test } from "node:test";
import assert from "node:assert/strict";
import {
  submitCapture,
  type CaptureDraft,
} from "../../src/lib/client/simple-drafts";

function draft(): CaptureDraft {
  return {
    key: "gate:smart-arrival",
    input: {
      id: crypto.randomUUID(),
      site_id: crypto.randomUUID(),
      material_id: "",
      custom_item_name: "  Unknown panels  ",
      supplier_name: "",
      arrival_at: "2026-11-06T09:59:50.000Z",
      recorded_at: "2026-11-06T09:59:50.000Z",
      marshal_id: "b",
      capture_kind: "arrival",
      intent: "draft",
    },
    photoId: crypto.randomUUID(),
    photo: new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "ticket.png",
      { type: "image/png" },
    ),
  };
}

test("smart capture submits the allocated catalogue ID and authoritative save timestamp without changing the retry draft", async (t) => {
  const capture = draft();
  const original = structuredClone(capture.input);
  const materialId = crypto.randomUUID();
  const recordedAt = "2026-11-06T10:00:00.000Z";
  const calls: { url: string; options: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      return Response.json({
        delivery: {
          id: capture.input.id,
          material_id: materialId,
          arrival_at: recordedAt,
          recorded_at: recordedAt,
          version: 1,
          submitted_at: calls.length === 3 ? recordedAt : null,
        },
      });
    },
  );
  const saved = await submitCapture(capture);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, `/api/deliveries/${capture.input.id}/evidence`);
  assert.equal((calls[1].options.body as FormData).get("kind"), "ticket");
  assert.equal((calls[1].options.body as FormData).get("id"), capture.photoId);
  const submitted = JSON.parse(calls[2].options.body as string);
  assert.equal(submitted.material_id, materialId);
  assert.equal(submitted.arrival_at, recordedAt);
  assert.equal(submitted.recorded_at, recordedAt);
  assert.equal(submitted.custom_item_name, original.custom_item_name);
  assert.equal(submitted.intent, "submit");
  assert.equal(submitted.version, 1);
  assert.deepEqual(capture.input, original);
  assert.equal(saved.submitted_at, recordedAt);
});

test("a retry after a lost submit response does not upload evidence or submit twice", async (t) => {
  const capture = draft();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({
      delivery: {
        id: capture.input.id,
        submitted_at: "2026-11-06T10:00:00.000Z",
      },
    });
  });
  const result = await submitCapture(capture);
  assert.equal(calls, 1);
  assert.equal(result.id, capture.input.id);
  assert(result.submitted_at);
});

test("an OUT Hire draft resumes submission using the photo already attached on the server", async (t) => {
  const capture = draft();
  capture.input.direction = "OUT";
  capture.input.selected_category = "Hire";
  const calls: { url: string; options: RequestInit }[] = [];
  const recordedAt = "2026-11-06T10:00:00.000Z";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      return Response.json({
        delivery: {
          ...capture.input,
          material_id: capture.input.id,
          evidence: [{ id: capture.photoId }],
          version: 1,
          submitted_at: calls.length === 2 ? recordedAt : null,
        },
      });
    },
  );

  const saved = await submitCapture(capture);
  assert.deepEqual(
    calls.map(({ url }) => url),
    ["/api/log-deliveries", "/api/log-deliveries"],
  );
  const finish = JSON.parse(calls[1].options.body as string);
  assert.equal(finish.intent, "submit");
  assert.equal(finish.direction, "OUT");
  assert.equal(finish.selected_category, "Hire");
  assert.equal(calls[1].options.keepalive, true);
  assert.equal(saved.id, capture.input.id);
  assert.equal(saved.submitted_at, recordedAt);
});
