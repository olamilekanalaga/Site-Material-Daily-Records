"use client";

import { useEffect, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { request } from "@/lib/client/offline";
import { PasswordField } from "./password-field";
import styles from "./credentials.module.css";

export function StaffRegistration() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
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
      <section className={styles.panel} aria-labelledby="registration-title">
        <header className={styles.header}>
          <h1 id="registration-title">Create your account</h1>
          <p>Site Material Daily Records</p>
        </header>
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
              className={styles.submit}
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
            <label className={styles.upload}>
              <span className={styles.avatar}>
                {preview ? (
                  <img src={preview} alt="" />
                ) : (
                  <UserRound size={36} aria-hidden="true" />
                )}
              </span>
              <span>
                {preview ? "Change profile picture" : "Upload profile picture"}
              </span>
              <input
                aria-label="Profile picture"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setPreview(file ? URL.createObjectURL(file) : "");
                }}
                required
              />
            </label>
            <div className={styles.names}>
              <label>
                First name
                <input
                  name="firstName"
                  placeholder="First name"
                  autoComplete="given-name"
                  maxLength={59}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  placeholder="Last name"
                  autoComplete="family-name"
                  maxLength={60}
                  required
                />
              </label>
            </div>
            <label>
              Email address
              <input
                name="email"
                placeholder="Enter email address"
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
                placeholder="+44"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                required
              />
            </label>
            <label>
              What is your role?
              <span className={styles.select}>
                <select name="role" defaultValue="" required>
                  <option value="" disabled>
                    Select your role
                  </option>
                  <option value="gate">Traffic Marshal</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="site_manager">Site Manager</option>
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </label>
            <PasswordField />
            <PasswordField label="Confirm password" name="confirmPassword" />
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className={styles.submit} disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
        {!pending && (
          <div className={styles.links}>
            Already have an account? <a href="/">Sign in</a>
          </div>
        )}
      </section>
    </main>
  );
}
