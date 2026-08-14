import { defineConfig, devices } from "@playwright/test";

import { E2E_SERVER_PORT, E2E_STATE_DIR, E2E_WEB_PORT } from "./ports.js";

export default defineConfig({
  testDir: "./e2e",
  // Wipes the daemon's state dir; without it the suite inherits the previous
  // run's database and starts failing on unique constraints.
  globalSetup: "./e2e/global-setup.ts",
  // E2E runs against a single daemon on a single port with shared state.
  // Parallelism here corrupts state instead of saving time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @lumem/server dev",
      url: `http://127.0.0.1:${E2E_SERVER_PORT}/trpc/health`,
      env: {
        LUMEM_PORT: String(E2E_SERVER_PORT),
        LUMEM_STATE_DIR: E2E_STATE_DIR,
      },
      // Never reuse: reuse skips the spawn, and skipping the spawn silently
      // drops the env above — including the throwaway state dir.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @lumem/web dev",
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      // The web server needs the daemon port too, otherwise its proxy keeps
      // pointing at the dev default while the daemon listens elsewhere.
      env: {
        LUMEM_PORT: String(E2E_SERVER_PORT),
        LUMEM_WEB_PORT: String(E2E_WEB_PORT),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
