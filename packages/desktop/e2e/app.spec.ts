import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";

import { DESKTOP_CONFIG_FILE, desktopDataDir } from "@lumem/shared";

import { E2E_DESKTOP_PORT } from "../../../ports.js";

/**
 * O app de verdade (`038`, C77): o Electron do repositório, subido pelo `_electron.launch`
 * contra o daemon de teste do `playwright.config.ts`.
 *
 * O que só o Electron de verdade responde, e nenhum dublê prova: que o bundle do
 * `dist/index.cjs` sobe, que a trava (`sandbox`, `contextIsolation`) não quebra o preload nem
 * o painel, e que o ícone existe na barra. O `HOME` é descartável, e é por ele que o app acha o
 * `lumem-desktop.json` — a mesma conta de pasta que o CLI faz —, então nada aqui toca o
 * `~/Library/Application Support/Lumem` de quem roda.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const DAEMON = `http://127.0.0.1:${String(E2E_DESKTOP_PORT)}`;
/** Uma porta em que ninguém escuta: o daemon "parado". */
const NOBODY = "http://127.0.0.1:4999";

let home: string | undefined;
let app: ElectronApplication | undefined;

test.afterEach(async () => {
  await app?.close().catch(() => {});
  app = undefined;
  if (home !== undefined) rmSync(home, { recursive: true, force: true });
  home = undefined;
});

async function launch(origin: string, extraArgs: string[] = []): Promise<ElectronApplication> {
  home = mkdtempSync(join(tmpdir(), "lumem-desktop-home-"));
  const dataDir = desktopDataDir({ platform: process.platform, home, env: {} });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, DESKTOP_CONFIG_FILE),
    JSON.stringify({
      node: process.execPath,
      lumem: join(home, "lumem-que-nao-existe.mjs"),
      stateDir: join(home, ".lumem"),
      origin,
      path: process.env["PATH"] ?? "",
    }),
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  // Sem `XDG_CONFIG_HOME` do ambiente de quem roda: o app tem de ler o `HOME` descartável.
  delete env["XDG_CONFIG_HOME"];
  app = await electron.launch({
    args: [APP_DIR, ...extraArgs],
    cwd: APP_DIR,
    env: { ...env, HOME: home, LUMEM_DESKTOP_HANDLE: "1" },
  });
  return app;
}

test("o app sobe e o painel carrega a página do daemon", async () => {
  const running = await launch(DAEMON);

  // O ícone: o `startApp` termina depois da primeira resposta do daemon, e só então o
  // `index.ts` deixa o ponto de acesso do teste.
  await expect
    .poll(() => running.evaluate(() => (globalThis as { lumemDesktop?: unknown }).lumemDesktop !== undefined), {
      timeout: 30_000,
    })
    .toBe(true);
  const tray = await running.evaluate(() => {
    const handle = (globalThis as unknown as { lumemDesktop: { tray: { isDestroyed(): boolean; getBounds(): { width: number } } } })
      .lumemDesktop;
    return { destroyed: handle.tray.isDestroyed(), width: handle.tray.getBounds().width };
  });
  expect(tray.destroyed).toBe(false);
  // No macOS o ícone tem largura na barra; no Linux sem bandeja (o xvfb) não há o que medir.
  if (process.platform === "darwin") expect(tray.width).toBeGreaterThan(0);

  // Clicar no ícone abre o painel: o `click` do `Tray` de verdade, que o Playwright não
  // alcança por fora, disparado pelo ponto de acesso.
  const opened = running.waitForEvent("window");
  await running.evaluate(() => {
    const handle = (globalThis as unknown as {
      lumemDesktop: { tray: { getBounds(): unknown; emit(event: string, ...args: unknown[]): void } };
    }).lumemDesktop;
    handle.tray.emit("click", {}, handle.tray.getBounds());
  });
  const panel = await opened;

  // O painel é a página do daemon, e ela **desenhou** — a trava não a quebrou.
  await expect(panel).toHaveURL(`${DAEMON}/menubar`);
  await expect(panel.getByRole("main", { name: "Painel do Lumem" })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("region", { name: "Recursos" })).toBeVisible();

  // Sem moldura, no tamanho do AC 61.
  const size = await running.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    return window === undefined ? null : window.getSize();
  });
  expect(size).toEqual([360, 520]);
});

test("o painel com o daemon parado mostra a página local, e a página não vê o Node", async () => {
  const stopped = await launch(NOBODY, ["--panel"]);
  const panel = await stopped.firstWindow();

  await expect(panel.getByRole("heading", { name: "Lumem parado" })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("button", { name: "Iniciar" })).toBeVisible();

  // `contextIsolation`, `nodeIntegration: false` e `sandbox` de verdade (AC 67): a página não
  // tem `require` nem `process`; o que ela tem é o único método que o preload expõe.
  const seen = await panel.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    start: typeof (globalThis as { lumemDesktop?: { start?: unknown } }).lumemDesktop?.start,
  }));
  expect(seen).toEqual({ require: "undefined", process: "undefined", start: "function" });
});

test("um segundo lançamento com --uninstall encerra o app que está rodando", async () => {
  // `lumem menubar uninstall` chama o binário com esta flag. O Electron entrega os argumentos
  // ao processo vivo (`second-instance`), e é ele — e não o recém-lançado — que tem de sair: um
  // `uninstall` que deixa o ícone na barra até o próximo logout é o defeito que o pedido evita.
  const running = await launch(DAEMON);
  await expect
    .poll(() => running.evaluate(() => (globalThis as { lumemDesktop?: unknown }).lumemDesktop !== undefined), {
      timeout: 30_000,
    })
    .toBe(true);

  const closed = new Promise<void>((resolve) => running.process().once("exit", () => resolve()));
  const executable = running.process().spawnfile;
  const second = spawn(executable, [APP_DIR, "--uninstall"], {
    env: { ...process.env, HOME: home ?? "" },
    stdio: "ignore",
  });
  await new Promise<void>((resolve) => second.once("exit", () => resolve()));

  await Promise.race([
    closed,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("o app vivo não saiu em 20 s")), 20_000)),
  ]);
});
