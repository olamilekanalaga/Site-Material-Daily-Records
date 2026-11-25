"use client";

import { useState } from "react";
import { request } from "@/lib/client/offline";
import { PasswordField } from "./password-field";
import styles from "./credentials.module.css";

export function StaffRegistration() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{
    file: File;
    destination: string;
  } | null>(null);

  async function retryPhoto() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", pending.file);
      await request("/api/profile/photo", { method: "POST", body });
      window.location.assign(pending.destination);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.screen}>
      <section className={`login-form ${styles.panel}`}>
        <h1>Create account</h1>
        {pending ? (
          <>
            <p role="status">
              Your account is ready. Try uploading the picture again.
            </p>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button
              type="button"
              className="primary"
              onClick={() => void retryPhoto()}
              disabled={busy}
            >
              Retry photo upload
            </button>
            <a href={pending.destination}>Go to dashboard</a>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const body = new FormData(event.currentTarget);
              if (body.get("password") !== body.get("confirmPassword")) {
                setError("Passwords do not match.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                const { destination, photoPending } = await request<{
                  destination: string;
                  photoPending: boolean;
                }>("/api/auth/register", { method: "POST", body });
                const file = body.get("file");
                if (photoPending && file instanceof File)
                  setPending({ file, destination });
                else window.location.assign(destination);
              } catch (problem) {
                setError((problem as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              First name
              <input
                name="firstName"
                autoComplete="given-name"
                maxLength={59}
                required
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                autoComplete="family-name"
                maxLength={60}
                required
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                maxLength={200}
                required
              />
            </label>
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                required
              />
            </label>
            <label>
              Profile picture
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <label>
              Role
              <select name="role" defaultValue="" required>
                <option value="">Select your role</option>
                <option value="gate">Traffic marshal</option>
                <option value="supervisor">Supervisor</option>
                <option value="site_manager">Site manager</option>
              </select>
            </label>
            <PasswordField />
            <PasswordField label="Confirm password" name="confirmPassword" />
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
        {!pending && (
          <div className={styles.links}>
            <a href="/">Sign in</a>
          </div>
        )}
      </section>
    </main>
  );
}
