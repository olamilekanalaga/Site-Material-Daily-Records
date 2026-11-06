import { openDB } from "idb";
import type { SimpleDeliveryInput } from "../types";
import { isDemoPath, request } from "./offline";

export type CaptureDraft = {
  key: string;
  input: SimpleDeliveryInput;
  photo: File;
  photoId: string;
};
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
  await (await database()).put("drafts", draft);
}
export async function removeCapture(key: string) {
  await (await database()).delete("drafts", key);
}

export async function submitCapture(draft: CaptureDraft) {
  const { delivery } = await request<{ delivery: import("../types").Delivery }>(
    "/api/log-deliveries",
    {
      method: "POST",
      body: JSON.stringify(draft.input),
    },
  );
  if (delivery.submitted_at) return delivery;
  const form = new FormData();
  form.set("id", draft.photoId);
  form.set("kind", "load");
  form.set("file", draft.photo);
  await request(`/api/deliveries/${delivery.id}/evidence`, {
    method: "POST",
    body: form,
  });
  const saved = await request<{ delivery: import("../types").Delivery }>(
    "/api/log-deliveries",
    {
      method: "POST",
      body: JSON.stringify({
        ...draft.input,
        intent: "submit",
        version: delivery.version,
      }),
    },
  );
  return saved.delivery;
}
