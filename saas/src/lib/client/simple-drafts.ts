import { openDB } from "idb";
import type { Actor, Delivery, SimpleDeliveryInput } from "../types";
import { isDemoPath, request } from "./offline";

export type CaptureDraft = {
  key: string;
  input: SimpleDeliveryInput;
  photo: File;
  photoId: string;
};
export function captureDraftKey(
  actor: Actor,
  siteId: string,
  marshalId: string,
) {
  return `${actor.company_id}:${actor.id}:${siteId}:${marshalId}`;
}

const database = () =>
  openDB(
    isDemoPath() ? "djcu-simple-demo-drafts" : "djcu-simple-team-drafts",
    1,
    {
      upgrade(db) {
        db.createObjectStore("drafts", { keyPath: "key" });
      },
    },
  );
export async function readCapture(
  key: string,
): Promise<CaptureDraft | undefined> {
  return (await database()).get("drafts", key);
}
export async function storeCapture(draft: CaptureDraft) {
  const transaction = (await database()).transaction("drafts", "readwrite");
  const saved = await transaction.store.get(draft.key);
  if (saved && saved.input.id !== draft.input.id) {
    await transaction.done;
    throw new Error(
      "Another record is still saving on this device. Open Records to resume it.",
    );
  }
  await transaction.store.put(draft);
  await transaction.done;
}

const inFlight = new Map<string, Promise<Delivery>>();

export function submitCapture(draft: CaptureDraft): Promise<Delivery> {
  const existing = inFlight.get(draft.input.id);
  if (existing) return existing;
  const saving = sendCapture(draft).finally(() =>
    inFlight.delete(draft.input.id),
  );
  inFlight.set(draft.input.id, saving);
  return saving;
}

export async function completeCapture(draft: CaptureDraft) {
  if (!navigator.onLine)
    throw new Error("You’re offline. Reconnect to finish saving this record.");
  const saved = await submitCapture(draft);
  if (!saved.submitted_at)
    throw new Error("The record is still a draft. Retry to finish saving it.");
  const transaction = (await database()).transaction("drafts", "readwrite");
  const current = await transaction.store.get(draft.key);
  if (current?.input.id === draft.input.id)
    await transaction.store.delete(draft.key);
  await transaction.done;
  return saved;
}

async function sendCapture(draft: CaptureDraft) {
  const { delivery } = await request<{ delivery: Delivery }>(
    "/api/log-deliveries",
    {
      method: "POST",
      keepalive: true,
      body: JSON.stringify(draft.input),
    },
  );
  if (delivery.submitted_at) return delivery;
  if (!delivery.evidence?.some((photo) => photo.id === draft.photoId)) {
    const form = new FormData();
    form.set("id", draft.photoId);
    form.set(
      "kind",
      draft.input.capture_kind === "arrival" ? "ticket" : "load",
    );
    form.set("file", draft.photo);
    await request(`/api/deliveries/${delivery.id}/evidence`, {
      method: "POST",
      body: form,
    });
  }
  const saved = await request<{ delivery: Delivery }>("/api/log-deliveries", {
    method: "POST",
    keepalive: true,
    body: JSON.stringify({
      ...draft.input,
      ...(draft.input.capture_kind === "arrival"
        ? {
            material_id: delivery.material_id,
            arrival_at: delivery.arrival_at,
            recorded_at: delivery.recorded_at,
          }
        : {}),
      intent: "submit",
      version: delivery.version,
    }),
  });
  return saved.delivery;
}
