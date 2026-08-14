import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const ports = JSON.parse(
  readFileSync(fileURLToPath(new URL("./ports.json", import.meta.url)), "utf8"),
) as Record<string, number>;

// Dedicated ports, deliberately not the dev defaults. E2E owns a daemon with
// throwaway state; if it could attach to the developer's running daemon it
// would create and delete worktrees in the real ~/.lumem.
const SERVER_PORT = ports["e2eServer"];
const WEB_PORT = ports["e2eWeb"];

// fileURLToPath, not URL.pathname: pathname is percent-encoded, so a checkout
// under a path with a space produces a literal "Meus%20Projetos" directory.
const STATE_DIR = fileURLToPath(new URL(".lumem-e2e/", import.meta.url));

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
        LUMEM_STATE_DIR: STATE_DIR,
      },
      // Never reuse: reuse skips the spawn, and skipping the spawn silently
      // drops the env above — including the throwaway state dir.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @lumem/web dev",
      url: `http://127.0.0.1:${WEB_PORT}`,
      // The web server needs the daemon port too, otherwise its proxy keeps
      // pointing at the dev default while the daemon listens elsewhere.
      env: {
        LUMEM_PORT: String(SERVER_PORT),
        LUMEM_WEB_PORT: String(WEB_PORT),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
