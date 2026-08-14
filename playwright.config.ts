import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4318;
const SERVER_PORT = 4317;

// E2E must never touch the developer's real ~/.lumem state.
const E2E_STATE_DIR = new URL(".lumem-e2e/", import.meta.url).pathname;

const reuseExistingServer = !process.env["CI"];

export default defineConfig({
  testDir: "./e2e",
  // E2E runs against a single daemon on a single port with shared state.
  // Parallelism here corrupts state instead of saving time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @lumem/server dev",
      url: `http://127.0.0.1:${SERVER_PORT}/trpc/health`,
      env: {
        LUMEM_PORT: String(SERVER_PORT),
        LUMEM_STATE_DIR: E2E_STATE_DIR,
      },
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @lumem/web dev",
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
