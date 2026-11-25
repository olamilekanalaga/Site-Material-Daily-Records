"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LogOut, RefreshCw, WifiOff } from "lucide-react";
import type { Bootstrap, Marshal } from "@/lib/types";
import { request } from "@/lib/client/offline";
import { Brand } from "../shared/brand";
import { Login } from "../auth/login";
import { LiveForm } from "./live-form";
import {
  LiveRecords,
  marshalPhotoSource,
  onMarshalPhotoError,
} from "./live-records";
import liveStyles from "./live-delivery.module.css";
import { staffDashboard, type SignInPortal } from "@/lib/access";

export function SimpleApp({
  localDemo = false,
  workspaceEnabled = true,
  registrationEnabled = false,
  portal = null,
  initialPage,
}: {
  localDemo?: boolean;
  workspaceEnabled?: boolean;
  registrationEnabled?: boolean;
  portal?: SignInPortal | null;
  initialPage?: "home" | "records";
}) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState<"home" | "entry" | "records">(
    initialPage || "home",
  );
  const [marshalId, setMarshalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const hasWorkspace = useRef(false);

  const load = useCallback(async (): Promise<Bootstrap | null> => {
    if (!workspaceEnabled) {
      setLoaded(true);
      return null;
    }
    try {
      const next = await request<Bootstrap>(
        portal ? `/api/bootstrap?portal=${portal}` : "/api/bootstrap",
      );
      if (
        window.location.pathname === "/" ||
        window.location.pathname.startsWith("/sign-in/")
      ) {
        window.location.replace(staffDashboard(next.actor.role));
        return next;
      }
      hasWorkspace.current = true;
      setData(next);
      setSiteId((previous) =>
        next.sites.some((site) => site.id === previous)
          ? previous
          : next.sites[0]?.id || "",
      );
      setError("");
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
  }, [workspaceEnabled, portal]);

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

  function selectMarshal(marshal: Marshal) {
    if (marshal.can_record !== true) return;
    setError("");
    setMarshalId(marshal.id);
    setPage("entry");
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
    return (
      <Login
        localDemo={localDemo}
        workspaceEnabled={workspaceEnabled}
        registrationEnabled={registrationEnabled}
        startupError={error}
        portal={portal}
      />
    );
  }

  const canRecord =
    portal !== "supervisor" &&
    (data.actor.role === "gate" || data.actor.role === "company_admin");
  const site = data.sites.find((item) => item.id === siteId);
  const marshals = (data.marshals || []).filter(
    (item) =>
      item.active &&
      item.site_id === siteId &&
      item.company_id === data.actor.company_id,
  );
  const selected = marshals.find(
    (item) => item.id === marshalId && item.can_record === true,
  );
  const choosingProfile = page === "home" || (page === "entry" && !selected);
  const recordsPage = page === "records" || !canRecord;
  function showRecords() {
    window.location.assign("/records");
  }

  return (
    <div className="simple-app">
      <header className="simple-header">
        <a href={canRecord ? "/gate" : "/records"} aria-label="DJ Civils home">
          <Brand compact />
        </a>
        <div className="simple-identity">
          {data.mode === "supabase" && (
            <img
              className={liveStyles.accountPortrait}
              src="/api/profile/photo"
              alt="Profile picture"
              onError={onMarshalPhotoError}
            />
          )}
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
                  : choosingProfile
                    ? "Gate Delivery"
                    : "Record Delivery"}
              </h1>
              <p>
                {recordsPage
                  ? "Saved deliveries for your site."
                  : !choosingProfile
                    ? "Enter the delivery details below."
                    : "Choose your name to record a delivery."}
              </p>
            </div>
            <div className="simple-page-actions">
              {canRecord &&
                (recordsPage ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => window.location.assign("/gate")}
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
          ) : recordsPage ? (
            <LiveRecords key={site.id} data={data} siteId={site.id} />
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
                      className={`simple-marshal-card ${liveStyles.staffCard}`}
                      aria-label={marshal.name}
                      aria-pressed={selected?.id === marshal.id}
                      disabled={busy || marshal.can_record !== true}
                      onClick={() => selectMarshal(marshal)}
                    >
                      <img
                        src={marshalPhotoSource(marshal, data.mode)}
                        onError={onMarshalPhotoError}
                        alt=""
                      />
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
                marshals.length > 0 &&
                !marshals.some((item) => item.can_record) && (
                  <p className="simple-help">
                    No marshal profile is assigned to your account. Ask your
                    company administrator to link your staff account.
                  </p>
                )}
              {page === "entry" && selected && (
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
