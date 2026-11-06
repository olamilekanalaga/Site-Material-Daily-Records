"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { request } from "@/lib/client/offline";
import { Brand } from "../shared/brand";

export function Login({
  onLogin,
  localDemo,
  workspaceEnabled,
  startupError,
}: {
  onLogin: () => Promise<void>;
  localDemo: boolean;
  workspaceEnabled: boolean;
  startupError: string;
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
          <span className="eyebrow">DJCU DELIVERY CONTROL</span>
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
        <div className="demo-pill">DJCU SOFTWARE</div>
        <h2>Explore DJCU</h2>
        <p>Quick delivery entry. Clear saved records.</p>
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
          <small>
            Sample records. Demo changes and photos stay in your browser.
          </small>
        </div>
        {workspaceEnabled ? (
          <>
            <div className="login-divider">Team sign-in</div>
            <p>Use your assigned workspace account.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await request("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
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
              Private team sign-in will be available when your workspace is
              connected. The sample demo is ready to explore now.
            </p>
          </div>
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
