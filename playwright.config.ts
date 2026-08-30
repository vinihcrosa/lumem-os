import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { E2E_FIXTURE_BIN } from "./e2e/support/fixtures.js";
import {
  E2E_PRODUCTION_PORT,
  E2E_PRODUCTION_STATE_DIR,
  E2E_SERVER_PORT,
  E2E_STATE_DIR,
  E2E_WEB_PORT,
  WEB_DIST_DIR,
} from "./ports.js";

/**
 * Where e2e sessions run.
 *
 * The repo root, because it is the one directory guaranteed to exist — the
 * state dir is wiped before every run, and spawning into a missing cwd is
 * refused.
 */
const E2E_SESSION_CWD = fileURLToPath(new URL(".", import.meta.url));

/**
 * Wipe the daemon's state before anything starts.
 *
 * This runs in the config module body on purpose, NOT in `globalSetup`:
 * playwright starts the `webServer` processes *before* running globalSetup, so
 * a cleanup there would delete the state directory out from under a daemon that
 * already holds an open SQLite handle. The daemon would keep writing to an
 * unlinked inode, the next run would find nothing to clean, and recreating the
 * -wal/-shm files in a directory that no longer exists fails with
 * SQLITE_CANTOPEN. The config body is evaluated before any of that.
 *
 * Without the wipe, run two inherits run one's workspaces and any test that
 * creates a named workspace starts failing on a unique constraint.
 */
// Guarded twice. TEST_WORKER_INDEX is set only in worker processes, where
// playwright re-evaluates this config ~2s after the daemon is already up — an
// unguarded wipe would delete the state directory a second time, mid-suite,
// with the SQLite handle open. `--list` is read-only and has no business
// destroying anything.
const isWorker = process.env["TEST_WORKER_INDEX"] !== undefined;
const isListing = process.argv.includes("--list");
if (!isWorker && !isListing) {
  rmSync(E2E_STATE_DIR, { recursive: true, force: true });
  rmSync(E2E_PRODUCTION_STATE_DIR, { recursive: true, force: true });
}

/** Specs that only make sense against the installed shape of the product. */
const PRODUCTION_SPECS = /production\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  // E2E runs against a single daemon on a single port with shared state.
  // Parallelism here corrupts state instead of saving time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  // Em CI, o anotador da PR mais um relatório em disco: sem o segundo, a falha
  // vira quatro linhas de log e o artefato sobe vazio.
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The suite proper runs against vite, as it always has.
      testIgnore: PRODUCTION_SPECS,
    },
    {
      /*
       * The product as installed: one daemon, one port, no vite.
       *
       * A handful of specs rather than the whole suite, because what changes in
       * production is how the assets travel — the SPA fallback, the MIME types,
       * and the route that must not swallow `/trpc`. None of that is exercised
       * by a run behind a dev proxy, and all of it breaks the product outright.
       */
      name: "production",
      testMatch: PRODUCTION_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${E2E_PRODUCTION_PORT}`,
      },
    },
  ],
  webServer: [
    {
      /*
       * The installed shape, built and started as one process.
       *
       * `pnpm build` rather than a hand-written pair of commands: turbo caches
       * it, so the cost after the first run is a cache lookup — and the thing
       * being tested is the artefact the release publishes, which is exactly
       * what `pnpm build` produces.
       */
      command: "pnpm build && node packages/server/dist/server/main.mjs",
      url: `http://127.0.0.1:${E2E_PRODUCTION_PORT}/trpc/health`,
      env: {
        LUMEM_PORT: String(E2E_PRODUCTION_PORT),
        LUMEM_STATE_DIR: E2E_PRODUCTION_STATE_DIR,
        // The daemon finds `dist/web` beside itself only once packaged; here it
        // is pointed at what vite just wrote, which is the same bytes.
        LUMEM_WEB_ROOT: WEB_DIST_DIR,
        LUMEM_DEFAULT_CWD: E2E_SESSION_CWD,
        SHELL: "/bin/sh",
        PATH: `${E2E_FIXTURE_BIN}:${process.env["PATH"] ?? ""}`,
      },
      reuseExistingServer: false,
      // Includes a cold build of both packages on a fresh runner.
      timeout: process.env["CI"] ? 300_000 : 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @lumem/server dev",
      url: `http://127.0.0.1:${E2E_SERVER_PORT}/trpc/health`,
      env: {
        LUMEM_PORT: String(E2E_SERVER_PORT),
        LUMEM_STATE_DIR: E2E_STATE_DIR,
        LUMEM_DEFAULT_CWD: E2E_SESSION_CWD,
        // Not the developer's shell: a login zsh sources their whole profile,
        // and the suite would then depend on whatever their prompt prints.
        SHELL: "/bin/sh",
        /*
         * The fixture bin directory first on the daemon's PATH.
         *
         * The first-access flow *detects* `claude-agent-acp` and then spawns what
         * it found — that detection is the subject of `00-onboarding.spec.ts`, so
         * it cannot be side-stepped by configuring a command by hand the way the
         * other specs do. The directory does not exist yet at this point: it is
         * created by `globalSetup`, which playwright runs after the servers, and
         * PATH is resolved per exec rather than now.
         */
        PATH: `${E2E_FIXTURE_BIN}:${process.env["PATH"] ?? ""}`,
      },
      // Never reuse: reuse skips the spawn, and skipping the spawn silently
      // drops the env above — including the throwaway state dir.
      reuseExistingServer: false,
      // O runner parte de um cache frio e paga a primeira compilação do tsx;
      // no laptop 60s sobram, e lá não bastavam.
      timeout: process.env["CI"] ? 180_000 : 60_000,
      // Só o stderr: o daemon loga cada requisição em stdout, e encanar isso em
      // CI afoga o relatório da suíte no log do próprio servidor.
      stdout: "ignore",
      stderr: "pipe",
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
      timeout: process.env["CI"] ? 180_000 : 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
