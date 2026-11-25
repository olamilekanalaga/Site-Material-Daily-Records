import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const enabled = process.env.RUN_HOSTED_SMOKE === "1";
const required = [
  "HOSTED_SMOKE_BASE_URL",
  "HOSTED_SMOKE_SITE_ID",
  "HOSTED_SMOKE_GATE_EMAIL",
  "HOSTED_SMOKE_GATE_PASSWORD",
  "HOSTED_SMOKE_SUPERVISOR_EMAIL",
  "HOSTED_SMOKE_SUPERVISOR_PASSWORD",
] as const;
if (enabled || process.env.RUN_OPEN_SIGNUP_SMOKE === "1") {
  const missing = (
    enabled ? required : (["HOSTED_SMOKE_BASE_URL"] as const)
  ).filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(
      `Hosted smoke configuration missing: ${missing.join(", ")}`,
    );
  const origin = new URL(process.env.HOSTED_SMOKE_BASE_URL!);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "HOSTED_SMOKE_BASE_URL must be an HTTPS application origin without credentials or a path.",
    );
}

export default defineConfig({
  testDir: "./tests/hosted",
  testMatch: /(live-supabase|open-registration)\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "/tmp/djcu-hosted-smoke-results",
  use: {
    baseURL: process.env.HOSTED_SMOKE_BASE_URL || "https://example.invalid",
    // Hosted staff credentials and photos must never be written into a trace.
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
  },
});
