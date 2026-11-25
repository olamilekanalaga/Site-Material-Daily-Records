"use client";

import { useState } from "react";
import { request } from "@/lib/client/offline";
import type { SignInPortal } from "@/lib/access";
import { PasswordField } from "./password-field";
import styles from "./credentials.module.css";

export function Login({
  onLogin,
  workspaceEnabled,
  registrationEnabled = false,
  startupError,
  portal = null,
}: {
  onLogin?: () => Promise<void>;
  localDemo?: boolean;
  workspaceEnabled: boolean;
  registrationEnabled?: boolean;
  startupError: string;
  portal?: SignInPortal | null;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className={styles.screen}>
      <section className={`login-form ${styles.panel}`} aria-label="Sign in">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              const result = await request<{ destination: string }>(
                "/api/auth/login",
                {
                  method: "POST",
                  body: JSON.stringify({
                    email: form.get("email"),
                    password: form.get("password"),
                    remember: form.has("remember"),
                    portal,
                  }),
                },
              );
              await onLogin?.();
              window.location.assign(result.destination);
            } catch (problem) {
              setError((problem as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <PasswordField existing />
          <label className={styles.remember}>
            <input type="checkbox" name="remember" /> Remember me
          </label>
          {(error || startupError || !workspaceEnabled) && (
            <p role="alert" className="error-text">
              {error ||
                (workspaceEnabled
                  ? startupError
                  : "Staff sign-in is unavailable.")}
            </p>
          )}
          <button className="primary" disabled={busy || !workspaceEnabled}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {registrationEnabled && (
          <div className={styles.links}>
            <a href="/register">Create account</a>
          </div>
        )}
      </section>
    </main>
  );
}
