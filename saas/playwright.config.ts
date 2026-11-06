import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
  },
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/bootstrap",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      APP_MODE: "local",
      APP_ORIGIN: "http://127.0.0.1:3100",
      // Runtime SQLite/WAL writes must stay outside Turbopack's source watcher.
      LOCAL_DATA_DIR: "/tmp/djcu-simple-e2e",
    },
  },
  projects: [
    { name: "api", testMatch: /api\.spec\.ts/ },
    {
      name: "mobile",
      testMatch: /ui\.spec\.ts/,
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "tablet",
      testMatch: /ui\.spec\.ts/,
      use: { ...devices["iPad Mini"], browserName: "chromium" },
    },
    {
      name: "desktop",
      testMatch: /ui\.spec\.ts/,
      use: { viewport: { width: 1440, height: 1000 }, browserName: "chromium" },
    },
  ],
});
