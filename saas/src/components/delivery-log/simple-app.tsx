"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ClipboardList,
  House,
  LogOut,
  RefreshCw,
  UserRound,
  WifiOff,
} from "lucide-react";
import type { Bootstrap, Delivery, Marshal } from "@/lib/types";
import { movementViews, type MovementView } from "@/lib/delivery-records";
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
import {
  canReadReports,
  staffDashboard,
  type SignInPortal,
} from "@/lib/access";

type DeliveryActivity = { delivery: Delivery; added: boolean };

const previewMarshalName = /^Preview GATE(?: \([0-9a-f-]{36}\))?$/i;

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
  const [page, setPage] = useState<"home" | "entry" | "records" | "profile">(
    initialPage || "home",
  );
  const [marshalId, setMarshalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const lastWorkspace = useRef<Bootstrap | null>(null);
  const refreshing = useRef(false);
  const signingOut = useRef(false);
  const [activity, setActivity] = useState<DeliveryActivity[]>([]);
  const [movementView, setMovementView] = useState<MovementView>("Overview");
  const role = data?.actor.role;
  const canRecord =
    portal !== "supervisor" && (role === "gate" || role === "company_admin");
  const recordsPage = page === "records" || !canRecord;
  const marshalNavigation = canRecord && role === "gate";
  const profilePage = marshalNavigation && page === "profile";

  const load = useCallback(async (): Promise<Bootstrap | null> => {
    if (!workspaceEnabled) {
      setLoaded(true);
      return null;
    }
    if (refreshing.current || signingOut.current) return null;
    refreshing.current = true;
    try {
      const next = await request<Bootstrap>(
        portal ? `/api/bootstrap?portal=${portal}` : "/api/bootstrap",
      );
      if (signingOut.current) return null;
      const pathname = window.location.pathname;
      const destination = staffDashboard(next.actor.role);
      if (
        pathname === "/" ||
        pathname.startsWith("/sign-in/") ||
        (pathname === "/gate" && destination === "/records")
      ) {
        window.location.replace(destination);
        return next;
      }
      const previous = lastWorkspace.current;
      if (
        previous?.actor.id === next.actor.id &&
        previous.actor.company_id === next.actor.company_id &&
        canReadReports(next.actor.role)
      ) {
        const submitted = new Map(
          previous.deliveries
            .filter((delivery) => delivery.submitted_at)
            .map((delivery) => [delivery.id, delivery.version]),
        );
        const changes: DeliveryActivity[] = [];
        for (const delivery of next.deliveries) {
          if (!delivery.submitted_at) continue;
          const version = submitted.get(delivery.id);
          if (version !== delivery.version)
            changes.push({ delivery, added: version === undefined });
        }
        if (changes.length) setActivity(changes);
      } else {
        setActivity([]);
      }
      lastWorkspace.current = next;
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
      if (signingOut.current) return null;
      if (
        lastWorkspace.current &&
        problem instanceof Error &&
        ["Sign in required", "Session expired. Sign in again."].includes(
          problem.message,
        )
      ) {
        lastWorkspace.current = null;
        setData(null);
        setActivity([]);
      }
      setError(
        !lastWorkspace.current &&
          problem instanceof Error &&
          problem.message === "Sign in required"
          ? ""
          : "Could not refresh the workspace. Your saved deliveries are unchanged. Try again when connected.",
      );
      return null;
    } finally {
      refreshing.current = false;
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

  useEffect(() => {
    if (!recordsPage || !role) return;
    const refreshVisibleRecords = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void load();
    };
    const timer = window.setInterval(refreshVisibleRecords, 5000);
    document.addEventListener("visibilitychange", refreshVisibleRecords);
    window.addEventListener("online", refreshVisibleRecords);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleRecords);
      window.removeEventListener("online", refreshVisibleRecords);
    };
  }, [load, recordsPage, role]);

  function selectMarshal(marshal: Marshal) {
    if (marshal.can_record !== true) return;
    setError("");
    setMarshalId(marshal.id);
    setPage("entry");
  }

  async function logout() {
    signingOut.current = true;
    setBusy(true);
    try {
      await request("/api/auth/logout", { method: "POST" });
      lastWorkspace.current = null;
      setActivity([]);
      setData(null);
      setMarshalId("");
      setSiteId("");
      setPage("home");
      setError("");
      window.location.assign("/");
    } catch {
      signingOut.current = false;
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

  const site = data.sites.find((item) => item.id === siteId);
  const marshals = (data.marshals || []).filter(
    (item) =>
      item.active &&
      Boolean(item.user_id) &&
      !previewMarshalName.test(item.name.trim()) &&
      item.site_id === siteId &&
      item.company_id === data.actor.company_id,
  );
  const selected = marshals.find(
    (item) => item.id === marshalId && item.can_record === true,
  );
  const choosingProfile = page === "home" || (page === "entry" && !selected);
  const siteActivity = activity.filter(
    ({ delivery }) => delivery.site_id === siteId,
  );
  const [latestActivity] = siteActivity;
  let notice = "";
  if (latestActivity && canReadReports(data.actor.role)) {
    const { delivery, added } = latestActivity;
    if (siteActivity.length > 1) {
      notice = `${siteActivity.length} deliveries changed.`;
    } else if (added) {
      notice = `${delivery.marshal_name || delivery.creator_name} just added a delivery.`;
    } else {
      notice = "A delivery was just updated.";
    }
  }
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
            <small className={liveStyles.staffRole}>
              {data.actor.role === "gate"
                ? "Traffic Marshal"
                : data.actor.role.replaceAll("_", " ")}
            </small>
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
        {marshalNavigation && (
          <nav
            className={liveStyles.marshalNav}
            aria-label="Traffic marshal navigation"
          >
            <a
              href="/gate"
              aria-current={
                page === "home" || page === "entry" ? "page" : undefined
              }
            >
              <House size={18} aria-hidden="true" />
              Home
            </a>
            <a href="/records" aria-current={recordsPage ? "page" : undefined}>
              <ClipboardList size={18} aria-hidden="true" />
              Records
            </a>
            <button
              type="button"
              aria-current={profilePage ? "page" : undefined}
              onClick={() => setPage("profile")}
            >
              <UserRound size={18} aria-hidden="true" />
              Profile
            </button>
          </nav>
        )}
        {recordsPage &&
          (role === "gate" ||
            role === "supervisor" ||
            role === "site_manager") && (
            <nav className={liveStyles.marshalNav} aria-label="Movement views">
              {movementViews.map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={movementView === view}
                  onClick={() => setMovementView(view)}
                >
                  {view}
                </button>
              ))}
            </nav>
          )}
        <main>
          {profilePage ? (
            <section
              className={`simple-panel ${liveStyles.profilePanel}`}
              aria-labelledby="profile-heading"
            >
              <h1 id="profile-heading">Profile</h1>
              <img
                src={
                  data.mode === "supabase"
                    ? "/api/profile/photo"
                    : "/marshal-placeholder.svg"
                }
                onError={onMarshalPhotoError}
                alt=""
                width={80}
                height={80}
              />
              <h2>{data.actor.name}</h2>
              <p className={liveStyles.staffRole}>Traffic Marshal</p>
              <p>{data.actor.email}</p>
            </section>
          ) : (
            <>
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
                      !marshalNavigation && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={showRecords}
                        >
                          {page === "home" ? "View Records" : "Back to Records"}
                        </button>
                      )
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
              {recordsPage && notice && (
                <div className={liveStyles.activityNotice}>
                  <Bell size={18} aria-hidden="true" />
                  <p role="status">{notice}</p>
                  <button type="button" onClick={() => setActivity([])}>
                    Dismiss
                  </button>
                </div>
              )}
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
                <LiveRecords
                  key={site.id}
                  data={data}
                  siteId={site.id}
                  view={movementView}
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
                            <span>
                              {marshal.name}
                              <small className={liveStyles.staffRole}>
                                Traffic Marshal
                              </small>
                            </span>
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
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
