"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { request } from "@/lib/client/offline";
import { Brand } from "../shared/brand";
import type { SignInPortal } from "@/lib/access";

export function Login({
  onLogin,
  localDemo,
  workspaceEnabled,
  startupError,
  portal = null,
}: {
  onLogin: () => Promise<void>;
  localDemo: boolean;
  workspaceEnabled: boolean;
  startupError: string;
  portal?: SignInPortal | null;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">DJ CIVILS DELIVERY CONTROL</span>
          <h1>
            Every arrival.
            <br />A clearer record.
          </h1>
          <p>
            Built for the gate. Connected to your site team.
            <br />
            Record deliveries, save photos and keep a clear site record.
          </p>
          <div className="login-steps">
            <span>01 / Capture</span>
            <span>02 / Save</span>
            <span>03 / View</span>
          </div>
        </div>
        <small>Enabling · Groundworks · Civil Engineering</small>
      </section>
      <section className="login-form">
        <div className="demo-pill">DJ CIVILS SOFTWARE</div>
        <h2>
          {portal === "marshal"
            ? "Traffic Marshal sign-in"
            : portal === "supervisor"
              ? "Supervisor / Site Manager sign-in"
              : "Explore DJ Civils"}
        </h2>
        <p>
          {portal
            ? "Use your approved staff account."
            : "Quick delivery entry. Clear saved records."}
        </p>
        {!portal && (
          <div
            className="staff-sign-in-choices"
            aria-label="Staff sign-in entrances"
          >
            <a className="secondary" href="/sign-in/marshal">
              Traffic Marshal sign-in
            </a>
            <a className="secondary" href="/sign-in/supervisor">
              Supervisor / Site Manager sign-in
            </a>
          </div>
        )}
        {!portal && (
          <div className="demo-entry">
            <span className="eyebrow">INTERACTIVE SAMPLE WORKSPACE</span>
            <h3>Try the delivery log</h3>
            <p>
              Record a sample delivery and view the saved records. No email or
              password needed.
            </p>
            <a className="primary" href="/demo">
              Explore demo <ArrowRight size={18} />
            </a>
            <a className="secondary" href="/demo/supervisor">
              Supervisor demo
            </a>
            <small>
              Sample records. Demo changes and photos stay in your browser.
            </small>
          </div>
        )}
        {workspaceEnabled ? (
          <>
            <div className="login-divider">
              {portal ? "Approved accounts" : "Team sign-in"}
            </div>
            <p>
              {portal
                ? "Your administrator assigns your access. Contact them if you need an account."
                : "Use your assigned workspace account."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await request("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                      email,
                      password,
                      ...(portal ? { portal } : {}),
                    }),
                  });
                  await onLogin();
                } catch (e) {
                  const message = (e as Error).message;
                  setError(
                    /APP_MODE|Supabase|Local demo storage|Configure/.test(
                      message,
                    )
                      ? "Team sign-in is not available yet. You can explore the demo above."
                      : message,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {(error || startupError) && (
                <p role="alert" className="error-text">
                  {error ||
                    "Your team session is unavailable. Sign in again or explore the demo."}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                <ArrowRight size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="workspace-note">
            <ShieldCheck size={19} />
            <p>
              Private sign-in will be available when your team workspace is
              connected.
            </p>
          </div>
        )}
        {portal && (
          <a className="text-button" href="/">
            Choose another sign-in
          </a>
        )}
        {localDemo && (
          <details className="demo-logins">
            <summary>Local development accounts</summary>
            <p>Sample accounts for this local environment only.</p>
            <p>
              gate@demo.invalid · supervisor@demo.invalid · manager@demo.invalid
              · admin@demo.invalid
            </p>
            <p>
              Password: <code>DemoPass123!</code>
            </p>
          </details>
        )}
      </section>
    </main>
  );
}
