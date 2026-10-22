import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build with its own throwaway database.
const PORT = 3100;
const DB = "data/e2e/once.db";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH || require("node:fs").existsSync("/opt/pw-browsers/chromium")
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" }
      : {},
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } }],
  webServer: {
    command: `rm -rf data/e2e && ONCE_DB_PATH=${DB} npx tsx scripts/reset-db.ts && ONCE_DB_PATH=${DB} npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
