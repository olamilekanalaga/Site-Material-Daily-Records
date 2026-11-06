"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Truck,
  ClipboardCheck,
  ChartNoAxesCombined,
  Settings,
  History,
  LogOut,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  CloudUpload,
  Wifi,
  WifiOff,
  HardHat,
  Search,
  FileText,
  ShieldCheck,
  Menu,
  RefreshCw,
  X,
  Archive,
  Clock,
} from "lucide-react";
import type {
  Bootstrap,
  Delivery,
  DeliveryInput,
  PhysicalStatus,
} from "@/lib/types";
import {
  readDrafts,
  removeDraft,
  request,
  saveDraft,
  synchroniseDraft,
  downloadReport,
  clearDemoDrafts,
  type LocalDraft,
} from "@/lib/client/offline";
import { localDate, quantity, summarise } from "@/lib/reporting";
import { DeliveryForm } from "./delivery-form";
import { DeliveryDetail } from "./delivery-detail";
import { SettingsPanel } from "./settings-panel";
import { HistoricalPanel } from "./historical-panel";
import { Brand } from "../shared/brand";
import { Login } from "../auth/login";
export { Login } from "../auth/login";
import type { DemoProfileId } from "@/lib/demo/profiles";

type View =
  | "overview"
  | "deliveries"
  | "new"
  | "reviews"
  | "reports"
  | "audit"
  | "settings"
  | "historical"
  | "uploads";
export function Badge({ status }: { status: PhysicalStatus | string }) {
  return (
    <span
      className={`badge status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <i />
      {status}
    </span>
  );
}
export function LedgerApp({
  localDemo = false,
  demo = false,
  workspaceEnabled = true,
}: {
  localDemo?: boolean;
  demo?: boolean;
  workspaceEnabled?: boolean;
}) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<View>("overview"),
    [site, setSite] = useState(""),
    [online, setOnline] = useState(true),
    [drafts, setDrafts] = useState<LocalDraft[]>([]),
    [editing, setEditing] = useState<LocalDraft | null>(null),
    [detail, setDetail] = useState<Delivery | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [syncing, setSyncing] = useState(false),
    [menu, setMenu] = useState(false);
  const owner = data ? `${data.actor.company_id}:${data.actor.id}` : "";
  const load = useCallback(async () => {
    if (!demo && !workspaceEnabled) {
      setLoaded(true);
      return;
    }
    try {
      const d = await request<Bootstrap>("/api/bootstrap");
      setData(d);
      setSite((s) =>
        d.sites.some((x) => x.id === s) ? s : d.sites[0]?.id || "",
      );
      setError("");
    } catch (e) {
      if (!data) setData(null);
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [data, demo, workspaceEnabled]);
  useEffect(() => {
    void load();
    setOnline(navigator.onLine);
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []); // Load once; no authenticated response is cached.
  const refreshDrafts = useCallback(async () => {
    if (owner) setDrafts(await readDrafts(owner));
  }, [owner]);
  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);
  useEffect(() => {
    if (!data || !online) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [online, data?.actor.id]);
  const navigate = (next: View) => {
    setView(next);
    setMenu(false);
    setDetail(null);
    setEditing(null);
    setError("");
  };
  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 8000);
  };
  const sync = useCallback(async () => {
    if (!owner || syncing || !navigator.onLine) return;
    setSyncing(true);
    let count = 0;
    try {
      for (const draft of await readDrafts(owner)) {
        if (draft.state !== "pending") continue;
        try {
          await synchroniseDraft(draft);
          await removeDraft(draft.id, owner);
          count++;
        } catch (e) {
          await saveDraft({ ...draft, error: (e as Error).message });
        }
      }
      await refreshDrafts();
      if (count) {
        await load();
        notify(
          demo
            ? `${count} sample delivery ${count === 1 ? "record saved" : "records saved"}. Switch to Supervisor to review.`
            : `${count} delivery ${count === 1 ? "submitted" : "records submitted"} to server. Awaiting verification.`,
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [owner, syncing, refreshDrafts, load]);
  useEffect(() => {
    if (online && owner) void sync();
  }, [online, owner]);
  if (!loaded)
    return (
      <div className="loading">
        <HardHat size={36} />
        <p>Opening DJ Civils…</p>
      </div>
    );
  if (!data)
    return demo ? (
      <main className="loading">
        <Brand />
        <p role="alert">{error || "Opening the sample workspace…"}</p>
        <button className="primary" onClick={() => void load()}>
          Retry demo
        </button>
        <a href="/">Back to DJ Civils</a>
      </main>
    ) : (
      <Login
        onLogin={load}
        localDemo={localDemo}
        workspaceEnabled={workspaceEnabled}
        startupError={error}
      />
    );
  const currentSite = data.sites.find((s) => s.id === site),
    records = data.deliveries.filter((d) => d.site_id === site),
    today = localDate(new Date().toISOString(), currentSite?.timezone || "UTC");
  const todayRecords = records.filter(
      (d) => localDate(d.arrival_at, currentSite?.timezone || "UTC") === today,
    ),
    stats = summarise(todayRecords),
    queue = records.filter((d) =>
      ["Submitted", "Under Review", "Flagged"].includes(d.status),
    );
  const canCapture = ["gate", "company_admin"].includes(data.actor.role),
    canReview = data.actor.role === "supervisor";
  const items: {
    id: View;
    label: string;
    icon: typeof Truck;
    count?: number;
  }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "deliveries", label: "Delivery register", icon: Truck },
    {
      id: "reviews",
      label: "Verification queue",
      icon: ClipboardCheck,
      count: queue.length,
    },
    { id: "reports", label: "Daily reports", icon: ChartNoAxesCombined },
    {
      id: "uploads",
      label: "Drafts & uploads",
      icon: CloudUpload,
      count: drafts.length,
    },
    { id: "historical", label: "Historical summaries", icon: Archive },
    { id: "audit", label: "Activity & audit", icon: History },
    ...(data.actor.role === "company_admin"
      ? [
          {
            id: "settings" as View,
            label: "Workspace settings",
            icon: Settings,
          },
        ]
      : []),
  ];
  const titles: Record<View, [string, string]> = {
    overview: [
      "Your site, at a glance",
      "A clear record of every arrival. A separate check for every receipt.",
    ],
    deliveries: [
      "Delivery register",
      "Follow each arrival from gate entry to supervisor decision.",
    ],
    new: [
      "Record a delivery",
      "Capture the arrival now. A supervisor verifies physical receipt.",
    ],
    reviews: [
      "Verification queue",
      "Review the evidence and confirm what physically arrived.",
    ],
    reports: [
      "Daily site report",
      "Recorded arrivals, supervisor decisions and accepted quantities.",
    ],
    audit: [
      "Activity & audit",
      "A traceable history of changes and decisions.",
    ],
    settings: [
      "Workspace settings",
      "Manage your sites, team and delivery catalogues.",
    ],
    historical: [
      "Historical summaries",
      "Aggregate tallies remain separate from individual deliveries.",
    ],
    uploads: [
      "Drafts & uploads",
      "Saved on this device. Pending items are not yet server-confirmed.",
    ],
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a href={demo ? "/demo" : "/"} aria-label="DJ Civils home">
          <Brand compact />
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <span className="company-avatar">{data.company.name[0]}</span>
          <div>
            <strong>{data.company.name}</strong>
            <small>
              {data.mode !== "supabase"
                ? "Sample workspace"
                : "Private workspace"}
            </small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <nav aria-label="Main navigation">
          {items.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {!!item.count && <b>{item.count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-note">
            <ShieldCheck size={19} />
            <p>
              Capture once.
              <br />
              <strong>Keep the trail clear.</strong>
            </p>
          </div>
          <button
            className="profile"
            onClick={async () => {
              await request("/api/auth/logout", { method: "POST" });
              if (demo) {
                window.location.assign("/");
                return;
              }
              setData(null);
              setDrafts([]);
              setDetail(null);
              setView("overview");
            }}
          >
            <span className="avatar">
              {data.actor.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{data.actor.name}</strong>
              <small>{data.actor.role.replaceAll("_", " ")}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <a
            className="mobile-brand"
            href={demo ? "/demo" : "/"}
            aria-label="DJ Civils home"
          >
            <img src="/djcu-logo.jpg" alt="DJ Civils Ltd" />
          </a>
          <div className="site-switch">
            <span className="site-dot" />
            <select
              aria-label="Current site"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              {data.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Refresh records"
              onClick={() => void load()}
              disabled={!online}
            >
              <RefreshCw size={17} />
            </button>
            <span className={`connectivity ${online ? "" : "offline"}`}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{online ? "Online" : "Offline · local saves only"}</span>
            </span>
            <span className="today">
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: currentSite?.timezone || "UTC",
              }).format(new Date())}
            </span>
          </div>
        </header>
        <div className="demo-banner">
          <span className="demo-pill">
            {data.mode !== "supabase" ? "DEMO" : "WORKSPACE"}
          </span>
          <span>
            {data.mode === "demo"
              ? "DJ Civils interactive demo · Fictional sample records. Changes and photos stay in this browser."
              : data.mode === "local"
                ? "DJ Civils sample workspace. All records are fictional. No company approval implied."
                : `${data.company.name} · Private workspace.`}
          </span>
        </div>
        {demo && (
          <div className="demo-toolbar">
            <div>
              <strong>
                {data.actor.role === "gate"
                  ? data.actor.name
                  : "Explore DJ Civils"}
              </strong>
              <small>
                Try each role to follow a delivery from gate to report.
              </small>
            </div>
            <div className="demo-actions">
              <label className="demo-role-switch">
                Demo role
                <select
                  aria-label="Demo role"
                  value={data.actor.role}
                  onChange={async (e) => {
                    try {
                      await request("/api/demo/role", {
                        method: "POST",
                        body: JSON.stringify({ role: e.target.value }),
                      });
                      await load();
                      navigate("overview");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <option value="gate">Gate staff</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="site_manager">Site manager</option>
                  <option value="company_admin">Administrator</option>
                </select>
              </label>
              <button
                className="secondary"
                onClick={async () => {
                  if (
                    !confirm(
                      "Reset all sample records and demo photos in this browser?",
                    )
                  )
                    return;
                  try {
                    await request("/api/demo/reset", { method: "POST" });
                    await clearDemoDrafts();
                    setDrafts([]);
                    await load();
                    navigate("overview");
                    notify("Demo reset. Fresh fictional records are ready.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Reset demo
              </button>
              <a className="text-button" href="/demo?choose=1">
                Switch marshal
              </a>
              <a className="text-button" href="/">
                Exit demo
              </a>
            </div>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "SITE OPERATIONS"
                  : "DELIVERY MANAGEMENT"}
              </div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            {canCapture && view !== "new" && (
              <button className="primary" onClick={() => navigate("new")}>
                <Plus size={18} />
                Record delivery
              </button>
            )}
          </div>
          {message && (
            <div className="notice success" role="status">
              <Check size={19} />
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="notice danger" role="alert">
              {error}
            </div>
          )}
          {view === "overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Recorded arrivals"
                  value={stats.arrivals}
                  icon={Truck}
                  note="Today · individual submissions"
                />
                <Stat
                  label="Accepted deliveries"
                  value={stats.accepted}
                  icon={ShieldCheck}
                  note="Physical receipt confirmed"
                />
                <Stat
                  label="Awaiting resolution"
                  value={stats.pending}
                  icon={Clock}
                  note="Pending, flagged or correction"
                />
                <Stat
                  label="Rejected deliveries"
                  value={stats.rejected}
                  icon={FileText}
                  note="Reasons kept in the record"
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Today’s material tally</h2>
                      <p>Every submitted arrival counts once.</p>
                    </div>
                    <span className="soft-tag">{today}</span>
                  </div>
                  <div className="tally-list">
                    {data.materials
                      .filter((m) => m.active)
                      .map((m) => {
                        const rows = todayRecords.filter(
                            (d) => d.material_id === m.id,
                          ),
                          s = summarise(rows);
                        return (
                          <div className="tally-row" key={m.id}>
                            <span className="material-symbol">
                              {m.name === "Sand" ? "◒" : "▰"}
                            </span>
                            <strong>{m.name}</strong>
                            <span className="tally-track">
                              <i
                                style={{
                                  width: `${stats.arrivals ? Math.max(3, (s.arrivals / stats.arrivals) * 100) : 0}%`,
                                }}
                              />
                            </span>
                            <span className="tally-count">
                              {s.arrivals}
                              <small> arrivals</small>
                            </span>
                            <span className="accepted-small">
                              {s.accepted} accepted
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="panel-footer">
                    <span>Delivery count ≠ material quantity</span>
                    <button
                      className="text-button"
                      onClick={() => navigate("reports")}
                    >
                      Open daily report <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
                <section className="action-panel">
                  <div className="eyebrow">NEXT UP</div>
                  <div className="action-icon">
                    <ClipboardCheck size={30} />
                  </div>
                  <h2>
                    {queue.length} deliveries
                    <br />
                    awaiting a decision
                  </h2>
                  <p>
                    A ticket photograph documents the ticket. Supervisor review
                    confirms physical receipt.
                  </p>
                  <button onClick={() => navigate("reviews")}>
                    Open verification queue <ArrowUpRight size={19} />
                  </button>
                  <div className="action-bottom">
                    <ShieldCheck size={16} /> Supervisor verification required
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent deliveries</h2>
                    <p>The latest activity at {currentSite?.name}.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("deliveries")}
                  >
                    View register <ArrowRight size={15} />
                  </button>
                </div>
                <DeliveryList
                  data={data}
                  records={records
                    .slice()
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .slice(0, 5)}
                  onSelect={setDetail}
                />
              </section>
              <div className="evidence-note">
                <ShieldCheck size={20} />
                <p>
                  <strong>
                    A stronger record. A clearer chain of responsibility.
                  </strong>{" "}
                  Arrival records, receipt decisions and commercial matching are
                  kept separate. Photographs alone do not prove that a load
                  arrived.
                </p>
              </div>
            </>
          )}
          {view === "new" && (
            <DeliveryForm
              key={editing?.id || site}
              data={data}
              site={site}
              draft={editing}
              online={online}
              onSaved={async (text) => {
                await refreshDrafts();
                notify(text);
              }}
              onSubmitted={async (text) => {
                await load();
                await refreshDrafts();
                navigate("deliveries");
                notify(text);
              }}
            />
          )}
          {view === "deliveries" && (
            <Register data={data} records={records} onSelect={setDetail} />
          )}
          {view === "reviews" && (
            <>
              <div className="notice">
                {canReview
                  ? "Confirm physical receipt independently. You cannot verify your own arrivals."
                  : "Only assigned supervisors can make receipt decisions. You can inspect the queue."}
              </div>
              <Register data={data} records={queue} onSelect={setDetail} />
            </>
          )}
          {view === "reports" && (
            <Report data={data} site={site} onSelect={setDetail} />
          )}
          {view === "audit" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Audited activity</h2>
                <span className="soft-tag">Latest authorised events</span>
              </div>
              {data.audit
                .filter((a) => a.site_id === null || a.site_id === site)
                .map((a) => (
                  <details className="audit-row" key={a.id}>
                    <summary>
                      <span className="audit-icon">
                        <History size={17} />
                      </span>
                      <span>
                        <strong>{a.action.replaceAll("_", " ")}</strong>
                        <small>
                          {a.actor_name} · {a.entity_id.slice(0, 8)}
                        </small>
                      </span>
                      <time>
                        {new Date(a.created_at).toLocaleString("en-GB")}
                      </time>
                    </summary>
                    <div className="audit-diff">
                      <div>
                        <h3>Before</h3>
                        <pre>{JSON.stringify(a.before, null, 2)}</pre>
                      </div>
                      <div>
                        <h3>After</h3>
                        <pre>{JSON.stringify(a.after, null, 2)}</pre>
                      </div>
                    </div>
                  </details>
                ))}
              {!data.audit.length && <Empty text="No activity to show yet." />}
            </section>
          )}
          {view === "settings" && (
            <SettingsPanel
              data={data}
              onUpdate={async () => {
                await load();
                notify("Workspace updated.");
              }}
            />
          )}
          {view === "historical" && (
            <HistoricalPanel data={data} site={site} onUpdate={load} />
          )}
          {view === "uploads" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>On this device</h2>
                  <p>
                    Private to this browser profile. Keep the device secure.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={sync}
                  disabled={!online || syncing}
                >
                  <RefreshCw size={16} />
                  {syncing ? "Retrying…" : "Retry pending"}
                </button>
              </div>
              {drafts.map((d) => (
                <div className="draft-item" key={d.id}>
                  <div>
                    <strong>
                      {data.materials.find((m) => m.id === d.input.material_id)
                        ?.name || "New delivery"}{" "}
                      · {d.input.vehicle || "Vehicle missing"}
                    </strong>
                    <p>
                      {d.state === "pending"
                        ? "Upload pending — not submitted to server"
                        : "Saved locally — not submitted"}{" "}
                      · {d.photos.length} photos
                    </p>
                    {d.error && <p className="error-text">{d.error}</p>}
                  </div>
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditing(d);
                        setView("new");
                      }}
                    >
                      Resume
                    </button>
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (
                          confirm(
                            "Remove this device-only draft and its photos?",
                          )
                        ) {
                          await removeDraft(d.id, owner);
                          await refreshDrafts();
                        }
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ))}
              {!drafts.length && (
                <Empty text="No local drafts or pending uploads. You're up to date." />
              )}
            </section>
          )}
          <footer className="footer">
            <span>
              DJ Civils <span> / </span> Delivery accountability, from gate to
              report.
            </span>
            <span>
              {data.mode === "demo"
                ? "Interactive demo · saved in this browser"
                : data.mode === "local"
                  ? "Local demo · persistent on this server"
                  : "Supabase · private workspace"}
            </span>
          </footer>
        </main>
      </div>
      {detail && (
        <DeliveryDetail
          delivery={detail}
          data={data}
          onClose={() => setDetail(null)}
          onReviewed={async () => {
            await load();
            setDetail(null);
            notify(
              demo
                ? "Sample supervisor decision saved in this browser."
                : "Supervisor decision saved to server.",
            );
          }}
          onCorrect={(d) => {
            setEditing({
              id: d.id,
              owner,
              input: {
                id: d.id,
                site_id: d.site_id,
                material_id: d.material_id,
                supplier_id: d.supplier_id,
                vehicle: d.vehicle,
                ticket_number: d.ticket_number,
                ticket_quantity: d.ticket_quantity,
                ticket_unit: d.ticket_unit,
                arrival_at: d.arrival_at,
                notes: d.notes,
                intent: "submit",
                version: d.version,
              },
              photos: [],
              state: "saved",
              updated_at: new Date().toISOString(),
            });
            setView("new");
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Truck;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{note}</small>
    </section>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Truck size={30} />
      <p>{text}</p>
    </div>
  );
}
export function DeliveryList({
  data,
  records,
  onSelect,
}: {
  data: Bootstrap;
  records: Delivery[];
  onSelect: (d: Delivery) => void;
}) {
  if (!records.length) return <Empty text="No deliveries match this view." />;
  return (
    <div className="delivery-table-wrap">
      <table className="delivery-table">
        <thead>
          <tr>
            <th>Delivery / arrival</th>
            <th>Material & supplier</th>
            <th>Vehicle / ticket</th>
            <th>Ticket quantity</th>
            <th>Receipt status</th>
            <th aria-label="Open record" />
          </tr>
        </thead>
        <tbody>
          {records.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="record-link" onClick={() => onSelect(d)}>
                  DL-{d.id.slice(0, 8).toUpperCase()}
                </button>
                <small>
                  {new Date(d.arrival_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone:
                      data.sites.find((s) => s.id === d.site_id)?.timezone ||
                      "UTC",
                  })}
                </small>
              </td>
              <td>
                <strong>
                  {data.materials.find((m) => m.id === d.material_id)?.name}
                </strong>
                <small>
                  {data.suppliers.find((s) => s.id === d.supplier_id)?.name ||
                    "Supplier missing"}
                </small>
              </td>
              <td>
                <strong>{d.vehicle || "Not recorded"}</strong>
                <small>{d.ticket_number || "Ticket missing"}</small>
              </td>
              <td>{quantity(d.ticket_quantity, d.ticket_unit)}</td>
              <td>
                <Badge status={d.status} />
                <small>
                  {d.evidence.length} evidence{" "}
                  {d.evidence.length === 1 ? "file" : "files"}
                </small>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open delivery ${d.ticket_number || d.id}`}
                  onClick={() => onSelect(d)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Register({
  data,
  records,
  onSelect,
}: {
  data: Bootstrap;
  records: Delivery[];
  onSelect: (d: Delivery) => void;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const filtered = records.filter(
    (d) =>
      (!status || d.status === status) &&
      `${d.vehicle} ${d.ticket_number} ${data.materials.find((m) => m.id === d.material_id)?.name} ${data.suppliers.find((s) => s.id === d.supplier_id)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="register-tools">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search deliveries"
            placeholder="Search vehicle, ticket, material…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter receipt status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All receipt statuses</option>
          {[
            "Draft",
            "Arrived",
            "Submitted",
            "Under Review",
            "Accepted",
            "Rejected",
            "Flagged",
            "Correction Requested",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <span className="muted">{filtered.length} records</span>
      </div>
      <DeliveryList
        data={data}
        records={filtered
          .slice()
          .sort((a, b) => b.arrival_at.localeCompare(a.arrival_at))}
        onSelect={onSelect}
      />
    </section>
  );
}
function Report({
  data,
  site,
  onSelect,
}: {
  data: Bootstrap;
  site: string;
  onSelect: (d: Delivery) => void;
}) {
  const tz = data.sites.find((s) => s.id === site)?.timezone || "UTC";
  const [date, setDate] = useState(localDate(new Date().toISOString(), tz)),
    [supplier, setSupplier] = useState(""),
    [material, setMaterial] = useState("");
  const rows = data.deliveries.filter(
      (d) =>
        d.site_id === site &&
        d.submitted_at &&
        localDate(d.arrival_at, tz) === date &&
        (!supplier || d.supplier_id === supplier) &&
        (!material || d.material_id === material),
    ),
    s = summarise(rows);
  return (
    <>
      <section className="panel report-controls">
        <label>
          Report date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Supplier
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">All suppliers</option>
            {data.suppliers.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Material
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          >
            <option value="">All materials</option>
            {data.materials.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <a
          className="secondary"
          href={
            data.mode === "demo"
              ? "#"
              : `/api/reports?${new URLSearchParams({ date, site_id: site, supplier_id: supplier, material_id: material, format: "csv" })}`
          }
          onClick={(e) => {
            if (data.mode === "demo") {
              e.preventDefault();
              void downloadReport(
                `/api/reports?${new URLSearchParams({ date, site_id: site, supplier_id: supplier, material_id: material, format: "csv" })}`,
              ).catch((error) => window.alert(error.message));
            }
          }}
        >
          <FileText size={17} />
          Export CSV
        </a>
        <button className="secondary" onClick={() => window.print()}>
          Print report
        </button>
      </section>
      <div className="print-title">
        <h2>Daily delivery report · {date}</h2>
        <p>
          {data.company.name} · {data.sites.find((x) => x.id === site)?.name} ·{" "}
          {tz}
        </p>
      </div>
      <div className="stats-grid">
        <Stat
          label="Recorded arrivals"
          value={s.arrivals}
          note="Distinct submitted records"
          icon={Truck}
        />
        <Stat
          label="Accepted"
          value={s.accepted}
          note="Supervisor confirmed"
          icon={ShieldCheck}
        />
        <Stat
          label="Pending resolution"
          value={s.pending}
          note={`${s.flagged} flagged`}
          icon={Clock}
        />
        <Stat
          label="Rejected"
          value={s.rejected}
          note="Excluded from accepted quantities"
          icon={FileText}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Accepted quantities by unit</h2>
            <p>Different units are never combined or converted.</p>
          </div>
        </div>
        <div className="quantity-summary">
          {Object.entries(s.quantities).map(([u, n]) => (
            <span key={u}>{quantity(n, u)}</span>
          ))}
          {!Object.keys(s.quantities).length && (
            <p>No accepted quantities for this selection.</p>
          )}
        </div>
        <div className="summary-grid">
          {data.materials.map((m) => {
            const subset = rows.filter((d) => d.material_id === m.id),
              ms = summarise(subset);
            return ms.arrivals ? (
              <div key={m.id}>
                <strong>{m.name}</strong>
                <p>
                  {ms.arrivals} arrivals · {ms.accepted} accepted ·{" "}
                  {ms.rejected} rejected · {ms.flagged} flagged · {ms.pending}{" "}
                  pending
                </p>
                {Object.entries(ms.quantities).map(([u, n]) => (
                  <small key={u}>{quantity(n, u)} accepted </small>
                ))}
              </div>
            ) : null;
          })}
        </div>
        <div className="summary-grid">
          {data.suppliers.map((x) => {
            const sub = rows.filter((d) => d.supplier_id === x.id);
            return sub.length ? (
              <div key={x.id}>
                <strong>{x.name}</strong>
                <p>
                  {sub.length} arrivals · {summarise(sub).accepted} accepted
                </p>
              </div>
            ) : null;
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Delivery references & exceptions</h2>
        </div>
        <DeliveryList data={data} records={rows} onSelect={onSelect} />
        <div className="report-exceptions">
          {rows
            .filter((d) =>
              ["Rejected", "Flagged", "Correction Requested"].includes(
                d.status,
              ),
            )
            .map((d) => (
              <p key={d.id}>
                <strong>
                  {d.ticket_number || d.id.slice(0, 8)} · {d.status}:
                </strong>{" "}
                {d.reviews.at(-1)?.reason || "Review required"}
              </p>
            ))}
        </div>
      </section>
    </>
  );
}
