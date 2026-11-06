"use client";
import { useState } from "react";
import type { Bootstrap } from "@/lib/types";
import { request } from "@/lib/offline";
export function SettingsPanel({
  data,
  onUpdate,
}: {
  data: Bootstrap;
  onUpdate: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const send = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await request("/api/admin", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-grid">
      {error && (
        <div className="notice danger full-width" role="alert">
          {error}
        </div>
      )}
      {(["material", "supplier"] as const).map((kind) => (
        <section className="panel form-panel" key={kind}>
          <h2>{kind === "material" ? "Material catalogue" : "Suppliers"}</h2>
          <ul className="catalogue-list">
            {(kind === "material" ? data.materials : data.suppliers).map(
              (x) => (
                <li key={x.id}>
                  <form
                    className="catalogue-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void send({
                        action: kind,
                        id: x.id,
                        name: f.get("name"),
                        active: f.has("active"),
                      });
                    }}
                  >
                    <input
                      name="name"
                      aria-label={`Edit ${x.name}`}
                      defaultValue={x.name}
                      maxLength={100}
                      required
                    />
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={x.active}
                      />
                      Active
                    </label>
                    <button className="text-button" disabled={busy}>
                      Save
                    </button>
                  </form>
                </li>
              ),
            )}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void send({ action: kind, name: f.get("name") }).then(() =>
                form.reset(),
              );
            }}
          >
            <label>
              {kind === "material" ? "Material name" : "Supplier name"}
              <input name="name" required maxLength={100} />
            </label>
            <button className="secondary" disabled={busy}>
              Add {kind}
            </button>
          </form>
        </section>
      ))}
      <section className="panel form-panel">
        <h2>Sites & acceptance rules</h2>
        {data.sites.map((s) => (
          <form
            className="site-policy"
            key={s.id}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({
                action: "settings",
                site_id: s.id,
                require_ticket: f.has("ticket"),
                require_photo: f.has("photo"),
              });
            }}
          >
            <h3>{s.name}</h3>
            <p>{s.timezone}</p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="ticket"
                defaultChecked={s.require_ticket}
              />
              Ticket number required for acceptance
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="photo"
                defaultChecked={s.require_photo}
              />
              Ticket photograph required for acceptance
            </label>
            <button className="secondary" disabled={busy}>
              Save rules
            </button>
          </form>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send({
              action: "site",
              name: f.get("name"),
              timezone: f.get("timezone"),
            });
          }}
        >
          <h3>Add a site</h3>
          <label>
            Site name
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Site timezone
            <input name="timezone" defaultValue="Europe/London" required />
          </label>
          <button className="secondary" disabled={busy}>
            Create site
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <h2>Team access</h2>
        <div className="team-list">
          {data.members.map((m) => (
            <div key={m.id}>
              <strong>{m.name}</strong>
              <small>
                {m.email} · {m.role.replaceAll("_", " ")}
              </small>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send({
              action: "member",
              name: f.get("name"),
              email: f.get("email"),
              password: f.get("password"),
              user_id: f.get("user_id"),
              role: f.get("role"),
              site_ids: f.getAll("site_ids"),
            });
          }}
        >
          <h3>
            {data.mode !== "supabase"
              ? "Add fictional employee"
              : "Assign an existing Auth user"}
          </h3>
          <p className="muted">
            {data.mode !== "supabase"
              ? "Local accounts are for fictional demonstration only."
              : "Create or invite the Auth user with the operator provisioning script first. Their verified user ID is required."}
          </p>
          <label>
            Employee name
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Employee email
            <input name="email" type="email" required />
          </label>
          {data.mode === "demo" ? (
            <p className="muted">
              Sample team members do not receive invitations or passwords.
            </p>
          ) : data.mode === "local" ? (
            <label>
              Initial password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
          ) : (
            <label>
              Auth user ID
              <input name="user_id" required />
            </label>
          )}
          <label>
            Role
            <select name="role">
              {[
                "gate",
                "supervisor",
                "site_manager",
                "project_manager",
                "commercial",
                "director",
                "company_admin",
              ].map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Assigned sites</legend>
            {data.sites.map((s) => (
              <label className="checkbox-label" key={s.id}>
                <input name="site_ids" type="checkbox" value={s.id} />
                {s.name}
              </label>
            ))}
          </fieldset>
          <button className="secondary" disabled={busy}>
            Assign employee
          </button>
        </form>
      </section>
    </div>
  );
}
