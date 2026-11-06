"use client";

import { useCallback, useEffect, useState } from "react";
import { demoProfiles, type DemoProfileId } from "@/lib/demo/profiles";
import { selectDemoProfile } from "@/lib/demo/browser";
import { LedgerApp, Login } from "./ledger-app";
import { Brand } from "./brand";

const entryKey = "djcu-demo-entered";

export function DemoAccess() {
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState("");
  const enter = useCallback(async (profile: DemoProfileId) => {
    setOpening(true);
    setError("");
    try {
      await selectDemoProfile(profile);
      // This flag only remembers the sample picker, never a real auth session.
      try {
        sessionStorage.setItem(entryKey, "1");
      } catch {
        // The demo can still open if session storage is disabled.
      }
      history.replaceState(null, "", window.location.pathname);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const profile = demoProfiles.find((p) => p.id === query.get("marshal"));
    if (profile) {
      void enter(profile.id);
      return;
    }
    try {
      if (query.has("choose")) sessionStorage.removeItem(entryKey);
      else if (sessionStorage.getItem(entryKey) === "1") setReady(true);
    } catch {
      // Show the picker when this browser cannot remember the selection.
    }
    history.replaceState(null, "", window.location.pathname);
    setOpening(false);
  }, [enter]);

  if (ready) return <LedgerApp demo workspaceEnabled={false} />;
  if (opening)
    return (
      <main className="loading" role="status">
        <Brand />
        <p>Opening DJCU…</p>
      </main>
    );
  return (
    <Login
      onLogin={async () => {}}
      localDemo={false}
      workspaceEnabled={false}
      startupError=""
      onDemoSelect={(profile) => void enter(profile)}
      demoError={error}
    />
  );
}
