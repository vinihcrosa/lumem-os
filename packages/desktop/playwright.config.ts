import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { E2E_DESKTOP_PORT, WEB_DIST_DIR } from "../../ports.js";

/**
 * O e2e do app de desktop (`038`, C77): o Electron de verdade, subido pelo `_electron.launch`
 * do Playwright contra um daemon de teste.
 *
 * Config à parte da do repositório, e não um projeto dela, porque o que ele lança é o app e
 * não uma página: não usa `baseURL` nem navegador, e precisa do Electron baixado — que o
 * `pnpm test:e2e` da raiz não tem por que exigir.
 */
const STATE_DIR = join(tmpdir(), "lumem-e2e-desktop-state");
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Só no processo principal: o worker reavalia este arquivo com o daemon já de pé, e apagar o
// diretório de estado de um daemon com o SQLite aberto é o defeito que o config da raiz explica.
if (process.env["TEST_WORKER_INDEX"] === undefined && !process.argv.includes("--list")) {
  rmSync(STATE_DIR, { recursive: true, force: true });
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Um Electron por vez: o app é de instância única, e o ícone é um só.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { trace: "retain-on-failure" },
  webServer: {
    // A web construída, servida pelo próprio daemon: o app carrega `/menubar` de lá, e é isso
    // que o painel do usuário faz.
    command: "pnpm --filter @lumem/web exec vite build --logLevel error && pnpm --filter @lumem/server start",
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${String(E2E_DESKTOP_PORT)}/trpc/health`,
    env: {
      LUMEM_PORT: String(E2E_DESKTOP_PORT),
      LUMEM_STATE_DIR: STATE_DIR,
      LUMEM_WEB_ROOT: WEB_DIST_DIR,
      LUMEM_DEFAULT_CWD: REPO_ROOT,
      SHELL: "/bin/sh",
    },
    reuseExistingServer: false,
    timeout: process.env["CI"] ? 300_000 : 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
