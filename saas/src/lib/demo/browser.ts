import { openDB } from "idb";
import {
  createDemoState,
  dispatchDemo,
  migrateDemoState,
  resetDemoState,
  type DemoState,
} from "./engine";
import type { DemoProfileId } from "./profiles";

// A separate database keeps sample records/photos away from production drafts.
let dbPromise: ReturnType<typeof openDB> | undefined;
const database = () =>
  (dbPromise ??= openDB("djcu-fictional-browser-demo", 1, {
    upgrade(db) {
      db.createObjectStore("demo");
    },
  }));
let queue: Promise<unknown> = Promise.resolve();
function serialise<T>(work: () => Promise<T>): Promise<T> {
  // Share the lock across tabs where supported; each response follows persistence.
  const guarded = async (): Promise<T> => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request("djcu-fictional-demo-state", work);
    return await work();
  };
  const result = queue.then(guarded, guarded);
  queue = result.catch(() => undefined);
  return result;
}
async function readState(): Promise<DemoState> {
  const db = await database();
  const state = (await db.get("demo", "state")) as DemoState | undefined;
  return state?.schema === 1 ? migrateDemoState(state) : createDemoState();
}
export async function resetDemo(): Promise<void> {
  return serialise(async () => {
    const db = await database();
    const state = await readState();
    await db.put("demo", resetDemoState(state), "state");
  });
}

/** Browser-only API substitute; deliberately never calls fetch or real auth. */
export async function demoFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return serialise(async () => {
    try {
      const target = new URL(url, "https://demo.invalid");
      if (target.origin !== "https://demo.invalid") {
        return Response.json(
          { error: "External URLs are unavailable in the demonstration" },
          { status: 400 },
        );
      }
      let body: unknown = options.body;
      if (typeof body === "string") body = JSON.parse(body);
      const state = await readState();
      // Each demo page has its own role while sharing saved records. Changing
      // marshal in another tab must not change the supervisor's photo access.
      const savedRole = state.role;
      if (typeof window !== "undefined") {
        state.role = /^\/demo\/supervisor\/?$/.test(window.location.pathname)
          ? "supervisor"
          : "gate";
        const entry = window.location.pathname.match(
          /^\/demo\/delivery\/(b|olamilekan)\/?$/,
        );
        const profile =
          entry?.[1] ??
          (/^\/demo\/records\/?$/.test(window.location.pathname)
            ? new URLSearchParams(window.location.search).get("profile")
            : null);
        if (profile === "b" || profile === "olamilekan")
          state.gate_profile = profile;
      }
      const response = await dispatchDemo(state, url, {
        method: options.method,
        body,
      });
      state.role = savedRole;
      const db = await database();
      // Persist before reporting success so quota/private-mode errors remain visible.
      await db.put("demo", state, "state");
      return response;
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? "Invalid demo request"
          : "Browser demo storage is unavailable or full. Enable browser storage, remove large demo photos, or reset the demo.";
      return Response.json({ error: message }, { status: 503 });
    }
  });
}
/** Select a named sample marshal locally, with no real sign-in or API request. */
export async function selectDemoProfile(profile: DemoProfileId): Promise<void> {
  const response = await demoFetch("/api/demo/profile", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ??
        "Demo access is unavailable. Enable browser storage and try again.",
    );
  }
}
/** Caller owns the object URL and must revoke it on replacement/unmount. */
export async function demoEvidenceUrl(id: string): Promise<string> {
  const response = await demoFetch(`/api/evidence/${encodeURIComponent(id)}`);
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error ?? "Demo photograph unavailable");
  }
  return URL.createObjectURL(await response.blob());
}
