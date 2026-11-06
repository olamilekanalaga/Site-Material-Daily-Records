"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, LogOut, RefreshCw, WifiOff } from "lucide-react";
import type { Bootstrap, Marshal } from "@/lib/types";
import { demoProfiles } from "@/lib/demo/profiles";
import { request } from "@/lib/client/offline";
import { Brand } from "../shared/brand";
import { Login } from "../auth/login";
import { SimpleForm } from "./simple-form";
import { SimpleRecords } from "./simple-records";
import type { DemoView } from "../demo/demo-access";
import type { SignInPortal } from "@/lib/access";

export function SimpleApp({
  demo = false,
  demoView = "marshal",
  localDemo = false,
  workspaceEnabled = true,
  portal = null,
}: {
  demo?: boolean;
  demoView?: DemoView;
  localDemo?: boolean;
  workspaceEnabled?: boolean;
  portal?: SignInPortal | null;
}) {
  const supervisorDemo = demo && demoView === "supervisor";
  const entryDemo = demo && demoView === "entry";
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState<"home" | "entry" | "records">(
    entryDemo ? "entry" : demo && demoView !== "marshal" ? "records" : "home",
  );
  const [marshalId, setMarshalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const acting = useRef(false);
  const hasWorkspace = useRef(false);

  const load = useCallback(async (): Promise<Bootstrap | null> => {
    if (!demo && !workspaceEnabled) {
      setLoaded(true);
      return null;
    }
    try {
      const next = await request<Bootstrap>(
        !demo && portal ? `/api/bootstrap?portal=${portal}` : "/api/bootstrap",
      );
      hasWorkspace.current = true;
      setData(next);
      setSiteId((previous) =>
        next.sites.some((site) => site.id === previous)
          ? previous
          : next.sites[0]?.id || "",
      );
      setError("");
      if (entryDemo && next.actor.role === "gate") setMarshalId(next.actor.id);
      if (!["gate", "company_admin"].includes(next.actor.role)) {
        setPage("records");
        setMarshalId("");
      }
      return next;
    } catch (problem) {
      setError(
        !hasWorkspace.current &&
          problem instanceof Error &&
          problem.message === "Sign in required"
          ? ""
          : "Could not refresh the workspace. Your saved deliveries are unchanged. Try again when connected.",
      );
      return null;
    } finally {
      setLoaded(true);
    }
  }, [demo, entryDemo, workspaceEnabled, portal]);

  useEffect(() => {
    void load();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [load]);

  async function selectMarshal(marshal: Marshal) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setMarshalId("");
    try {
      if (demo) {
        const { demoProfiles } = await import("@/lib/demo/profiles");
        const profile = demoProfiles.find((item) => item.name === marshal.name);
        if (!profile)
          throw new Error(
            "This sample marshal is unavailable. Refresh and select again.",
          );
        const { selectDemoProfile } = await import("@/lib/demo/browser");
        await selectDemoProfile(profile.id);
        window.location.assign(`/demo/records?profile=${profile.id}`);
        return;
      }
      setMarshalId(marshal.id);
      setPage("records");
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await request("/api/auth/logout", { method: "POST" });
      hasWorkspace.current = false;
      setData(null);
      setMarshalId("");
      setSiteId("");
      setPage("home");
      setError("");
      if (demo) window.location.assign("/");
    } catch {
      setError("Sign out could not be completed. Reconnect and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <main className="simple-loading">
        <Brand />
        <p role="status">Opening DJ Civils…</p>
      </main>
    );
  }
  if (!data) {
    if (demo)
      return (
        <main className="simple-loading">
          <Brand />
          <h1>Open the delivery log</h1>
          <p role="alert">
            {error || "The sample workspace could not be opened."}
          </p>
          <button className="primary" onClick={() => void load()}>
            Try again
          </button>
          <a className="secondary" href="/">
            Back to sign-in
          </a>
        </main>
      );
    return (
      <Login
        onLogin={async () => {
          await load();
        }}
        localDemo={localDemo}
        workspaceEnabled={workspaceEnabled}
        startupError={error}
        portal={portal}
      />
    );
  }

  const canRecord =
    !supervisorDemo &&
    portal !== "supervisor" &&
    (data.actor.role === "gate" || data.actor.role === "company_admin");
  const site = data.sites.find((item) => item.id === siteId);
  const marshals = (data.marshals || []).filter(
    (item) =>
      item.active &&
      item.site_id === siteId &&
      item.company_id === data.actor.company_id,
  );
  const selected = marshals.find((item) => item.id === marshalId);
  const recordsPage = page === "records" || !canRecord;
  const demoProfile = demoProfiles.find(
    (item) => item.name === data.actor.name,
  );
  const demoRecordsHref = `/demo/records?profile=${demoProfile?.id || "b"}`;

  function showRecords() {
    if (demo) window.location.assign(demoRecordsHref);
    else setPage("records");
  }

  function recordNewDelivery() {
    if (demo && demoProfile) {
      window.location.assign(`/demo/delivery/${demoProfile.id}`);
    } else if (selected) {
      setPage("entry");
    } else {
      setPage("home");
    }
  }

  return (
    <div className="simple-app">
      <header className="simple-header">
        <a
          href={demo ? (supervisorDemo ? "/demo/supervisor" : "/demo") : "/"}
          aria-label="DJ Civils home"
        >
          <Brand compact />
        </a>
        <div className="simple-identity">
          <span>
            Signed in as <strong>{data.actor.name}</strong>
          </span>
          <button
            className="simple-signout"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </header>
      <div className="simple-main">
        <main>
          <div className="simple-page-title">
            <div>
              <h1>
                {recordsPage
                  ? "Delivery Records"
                  : page === "entry"
                    ? "Record Delivery"
                    : "Sign in as"}
              </h1>
              <p>
                {recordsPage
                  ? "Saved deliveries for your site."
                  : page === "entry"
                    ? "Enter the delivery details below."
                    : "Choose your name to view delivery records."}
              </p>
            </div>
            {page !== "home" || !canRecord ? (
              <div className="simple-page-actions">
                {canRecord &&
                  (recordsPage ? (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={recordNewDelivery}
                    >
                      Record New Delivery
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={showRecords}
                    >
                      Back to Records
                    </button>
                  ))}
                {recordsPage && (
                  <button
                    className="secondary simple-refresh"
                    disabled={busy}
                    aria-label="Refresh deliveries"
                    onClick={async () => {
                      setBusy(true);
                      await load();
                      setBusy(false);
                    }}
                  >
                    <RefreshCw size={18} />
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            ) : null}
            {data.sites.length > 1 && (
              <label className="simple-site-select">
                Site
                <select
                  aria-label="Current site"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                    setMarshalId("");
                  }}
                >
                  {data.sites.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {!online && page === "entry" && (
            <p className="simple-offline-note" role="status">
              <WifiOff size={16} aria-hidden="true" /> Offline
            </p>
          )}
          {error && (
            <div className="simple-error" role="alert">
              <p>{error}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void load()}
              >
                Try refresh again
              </button>
            </div>
          )}
          {!site ? (
            <section className="simple-panel simple-empty">
              No site is assigned to this account. Ask your company
              administrator to assign a site.
            </section>
          ) : recordsPage ? (
            <SimpleRecords
              key={site.id}
              data={data}
              siteId={site.id}
              onRefresh={load}
            />
          ) : (
            <>
              {page === "home" && (
                <div
                  className="simple-marshal-grid"
                  aria-label="Select traffic marshal"
                >
                  {marshals.map((marshal) => (
                    <button
                      key={marshal.id}
                      type="button"
                      className="simple-marshal-card"
                      aria-label={marshal.name}
                      aria-pressed={selected?.id === marshal.id}
                      disabled={busy}
                      onClick={() => void selectMarshal(marshal)}
                    >
                      {(demo || data.mode === "local") &&
                      (marshal.name === "Olamilekan Alaga" ||
                        marshal.name === "Bemigho Estano") ? (
                        <Image
                          src={
                            marshal.name === "Bemigho Estano"
                              ? "/marshals/bemigho-estano.jpg"
                              : "/marshals/olamilekan-alaga.jpg"
                          }
                          alt=""
                          fill
                          sizes="(max-width: 650px) 45vw, 230px"
                          style={
                            marshal.name === "Bemigho Estano"
                              ? {
                                  objectFit: "contain",
                                  objectPosition: "center top",
                                  backgroundColor: "#0b0b0b",
                                }
                              : { objectPosition: "50% 65%" }
                          }
                        />
                      ) : (
                        <img src="/marshal-placeholder.svg" alt="" />
                      )}
                      <span>
                        {marshal.name}
                        {selected?.id === marshal.id && (
                          <Check size={20} aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {page === "home" && !marshals.length && (
                <section className="simple-panel simple-empty">
                  No traffic marshals are configured for this site. Ask your
                  company administrator to add them.
                </section>
              )}
              {page === "entry" && selected && (
                <SimpleForm
                  key={`${data.actor.id}:${selected.id}`}
                  data={data}
                  site={site}
                  marshal={selected}
                  onSaved={async () => {
                    await load();
                  }}
                  onViewRecords={showRecords}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
