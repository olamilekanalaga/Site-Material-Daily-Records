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
import { SupervisorWorkspace } from "./supervisor-workspace";
import { LiveForm } from "./live-form";
import {
  LiveRecords,
  marshalPhotoSource,
  onMarshalPhotoError,
} from "./live-records";
import liveStyles from "./live-delivery.module.css";
import type { DemoView } from "../demo/demo-access";
import type { SignInPortal } from "@/lib/access";

export function SimpleApp({
  demo = false,
  demoView = "marshal",
  localDemo = false,
  workspaceEnabled = true,
  portal = null,
  initialPage,
}: {
  demo?: boolean;
  demoView?: DemoView;
  localDemo?: boolean;
  workspaceEnabled?: boolean;
  portal?: SignInPortal | null;
  initialPage?: "home" | "records";
}) {
  const supervisorDemo = demo && demoView === "supervisor";
  const entryDemo = demo && demoView === "entry";
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState<"home" | "entry" | "records">(
    initialPage ||
      (entryDemo
        ? "entry"
        : demo && demoView !== "marshal"
          ? "records"
          : "home"),
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
    if (!demo && marshal.can_record !== true) {
      setError(
        "This profile is not assigned to your account. Choose your authorised marshal profile.",
      );
      return;
    }
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
        window.location.assign(`/demo/delivery/${profile.id}`);
        return;
      }
      setMarshalId(marshal.id);
      setPage("entry");
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
      window.location.assign("/");
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
          const next = await load();
          if (next && !demo)
            window.location.assign(
              ["gate", "company_admin"].includes(next.actor.role)
                ? "/gate"
                : "/records",
            );
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
  if (supervisorDemo)
    return (
      <SupervisorWorkspace
        data={data}
        siteId={siteId}
        onSiteChange={setSiteId}
        onRefresh={load}
        onSignOut={logout}
        busy={busy}
        error={error}
      />
    );
  const marshals = (data.marshals || []).filter(
    (item) =>
      item.active &&
      item.site_id === siteId &&
      item.company_id === data.actor.company_id,
  );
  const selected = marshals.find(
    (item) => item.id === marshalId && (demo || item.can_record === true),
  );
  const choosingProfile = page === "home" || (page === "entry" && !selected);
  const recordsPage = page === "records" || !canRecord;
  const demoProfile = demoProfiles.find(
    (item) => item.name === data.actor.name,
  );
  const demoRecordsHref = `/demo/records?profile=${demoProfile?.id || "b"}`;
  const homeHref = demo
    ? supervisorDemo
      ? "/demo/supervisor"
      : page === "home"
        ? "/demo"
        : `/demo/delivery/${demoProfile?.id || "b"}`
    : canRecord
      ? "/gate"
      : "/records";

  function showRecords() {
    if (demo) window.location.assign(demoRecordsHref);
    else window.location.assign("/records");
  }

  function recordNewDelivery() {
    if (!demo) {
      window.location.assign("/gate");
    } else if (demoProfile) {
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
          href={homeHref}
          aria-label="DJ Civils home"
          onClick={(event) => {
            if (
              demo &&
              canRecord &&
              selected &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey &&
              event.button === 0
            ) {
              event.preventDefault();
              setPage("entry");
            }
          }}
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
                  ? demo
                    ? "Daily Records"
                    : "Delivery Records"
                  : !choosingProfile
                    ? "Record Delivery"
                    : demo
                      ? "Sign in as"
                      : "Gate Delivery"}
              </h1>
              <p>
                {recordsPage
                  ? "Saved deliveries for your site."
                  : !choosingProfile
                    ? "Enter the delivery details below."
                    : "Choose your name to record a delivery."}
              </p>
            </div>
            {page !== "home" || !canRecord || !demo ? (
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
                      {page === "home" ? "View Records" : "Back to Records"}
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
                    setPage(recordsPage ? "records" : "home");
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
          ) : recordsPage && !demo ? (
            <LiveRecords key={site.id} data={data} siteId={site.id} />
          ) : recordsPage ? (
            <SimpleRecords
              key={site.id}
              data={data}
              siteId={site.id}
              onRefresh={load}
            />
          ) : (
            <>
              {choosingProfile && (
                <div
                  className="simple-marshal-grid"
                  aria-label="Select traffic marshal"
                >
                  {marshals.map((marshal) => (
                    <button
                      key={marshal.id}
                      type="button"
                      className={`simple-marshal-card ${demo ? "" : liveStyles.staffCard}`}
                      aria-label={marshal.name}
                      aria-pressed={selected?.id === marshal.id}
                      disabled={busy || (!demo && marshal.can_record !== true)}
                      onClick={() => void selectMarshal(marshal)}
                    >
                      {!demo ? (
                        <img
                          src={marshalPhotoSource(marshal, data.mode)}
                          onError={onMarshalPhotoError}
                          alt=""
                        />
                      ) : demo &&
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
              {choosingProfile && !marshals.length && (
                <section className="simple-panel simple-empty">
                  No traffic marshals are configured for this site. Ask your
                  company administrator to add them.
                </section>
              )}
              {choosingProfile &&
                !demo &&
                marshals.length > 0 &&
                !marshals.some((item) => item.can_record) && (
                  <p className="simple-help">
                    No marshal profile is assigned to your account. Ask your
                    company administrator to link your staff account.
                  </p>
                )}
              {page === "entry" && selected && !demo && (
                <LiveForm
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
              {page === "entry" && selected && demo && (
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
