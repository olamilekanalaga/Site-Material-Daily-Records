import { openDB } from "idb";
import type { DeliveryInput } from "./types";
export type LocalPhoto = {
  id: string;
  kind: "ticket" | "vehicle" | "load";
  file: File;
};
export type LocalDraft = {
  id: string;
  owner: string;
  input: DeliveryInput;
  photos: LocalPhoto[];
  state: "saved" | "pending";
  updated_at: string;
  error?: string;
};
const database = () =>
  openDB("site-ledger-offline", 1, {
    upgrade(db) {
      db.createObjectStore("drafts", { keyPath: "id" });
    },
  });
export async function saveDraft(draft: LocalDraft) {
  const db = await database();
  await db.put("drafts", draft);
}
export async function readDrafts(owner: string): Promise<LocalDraft[]> {
  const db = await database();
  return (await db.getAll("drafts"))
    .filter((d) => d.owner === owner)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export async function removeDraft(id: string, owner: string) {
  const db = await database();
  const item = await db.get("drafts", id);
  if (item?.owner === owner) await db.delete("drafts", id);
}
export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}
const inFlight = new Map<string, Promise<string[]>>();
export function synchroniseDraft(draft: LocalDraft): Promise<string[]> {
  const key = `${draft.owner}:${draft.id}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const work = uploadDraft(draft).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
async function uploadDraft(draft: LocalDraft) {
  // Stable IDs survive a lost response. Server idempotency prevents a second arrival.
  const { delivery, warnings = [] } = await request<{
    delivery: { version: number; status: string; evidence: { id: string }[] };
    warnings: string[];
  }>("/api/deliveries", {
    method: "POST",
    body: JSON.stringify({
      ...draft.input,
      version: undefined,
      intent: "draft",
    }),
  });
  if (!["Draft", "Arrived", "Correction Requested"].includes(delivery.status))
    return warnings;
  for (const photo of draft.photos) {
    if (delivery.evidence.some((e) => e.id === photo.id)) continue;
    const form = new FormData();
    form.set("file", photo.file);
    form.set("kind", photo.kind);
    form.set("id", photo.id);
    await request(`/api/deliveries/${draft.id}/evidence`, {
      method: "POST",
      body: form,
    });
  }
  const submitted = await request<{ warnings?: string[] }>(
    `/api/deliveries/${draft.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...draft.input,
        version: draft.input.version ?? delivery.version,
        intent: "submit",
      }),
    },
  );
  return [...new Set([...warnings, ...(submitted.warnings || [])])];
}
