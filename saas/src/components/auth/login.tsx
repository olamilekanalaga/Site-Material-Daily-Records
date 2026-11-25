"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { request } from "@/lib/client/offline";
import { Brand } from "../shared/brand";
import type { SignInPortal } from "@/lib/access";
import styles from "./sign-in-options.module.css";

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

  if (!portal || !workspaceEnabled) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <header className={styles.brand}>
            <Brand />
          </header>
          <div
            className={styles.options}
            role="group"
            aria-label="Sign-in options"
          >
            {workspaceEnabled ? (
              <>
                <a
                  className={`${styles.option} ${styles.active}`}
                  href="/sign-in/marshal"
                >
                  Traffic Marshal sign-in
                </a>
                <a
                  className={`${styles.option} ${styles.active}`}
                  href="/sign-in/supervisor"
                >
                  Supervisor / Site Manager sign-in
                </a>
              </>
            ) : (
              <>
                <button className={styles.option} type="button" disabled>
                  Traffic Marshal sign-in
                </button>
                <button className={styles.option} type="button" disabled>
                  Supervisor / Site Manager sign-in
                </button>
              </>
            )}
            {(!workspaceEnabled || localDemo) && (
              <>
                <a className={`${styles.option} ${styles.active}`} href="/demo">
                  Traffic Marshal demo
                </a>
                <a
                  className={`${styles.option} ${styles.active}`}
                  href="/demo/supervisor"
                >
                  Supervisor demo
                </a>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }
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
        <h2>
          {portal === "marshal"
            ? "Traffic Marshal sign-in"
            : "Supervisor / Site Manager sign-in"}
        </h2>
        <p>Use your approved staff account.</p>
        <div className="login-divider">Approved accounts</div>
        <p>
          Your administrator assigns your access. Contact them if you need an
          account.
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
                  portal,
                }),
              });
              await onLogin();
            } catch (e) {
              const message = (e as Error).message;
              setError(
                /APP_MODE|Supabase|Local demo storage|Configure/.test(message)
                  ? "Staff sign-in is unavailable. Contact your administrator."
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
              {error || "Your team session is unavailable. Sign in again."}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        <a className="text-button" href="/">
          Choose another sign-in
        </a>
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
