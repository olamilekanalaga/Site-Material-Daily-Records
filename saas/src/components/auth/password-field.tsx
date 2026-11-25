"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import styles from "./credentials.module.css";

export function PasswordField({
  label = "Password",
  name = "password",
  existing = false,
}: {
  label?: string;
  name?: string;
  existing?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordField}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordControl}>
        <input
          id={id}
          name={name}
          placeholder={
            existing
              ? "Enter password"
              : name === "password"
                ? "Create password"
                : "Confirm password"
          }
          type={visible ? "text" : "password"}
          autoComplete={existing ? "current-password" : "new-password"}
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
