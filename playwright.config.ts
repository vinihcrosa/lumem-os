import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4318;

export default defineConfig({
  testDir: "./e2e",
  // E2E runs against a single server on a single port with shared state.
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
  webServer: {
    command: "pnpm --filter @lumem/web dev",
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
