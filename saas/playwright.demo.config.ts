import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Intentionally run without a backend. Public demos must work on an otherwise
// unconfigured Vercel deployment and must never establish a real user session.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /demo\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results-demo",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-demo", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3301",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
  },
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3301",
    url: "http://127.0.0.1:3301",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      APP_MODE: "",
      APP_ORIGIN: "http://127.0.0.1:3301",
    },
  },
  projects: [
    {
      name: "demo-mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "demo-tablet",
      use: { ...devices["iPad Mini"], browserName: "chromium" },
    },
    {
      name: "demo-desktop",
      use: { viewport: { width: 1440, height: 1000 }, browserName: "chromium" },
    },
  ],
});
