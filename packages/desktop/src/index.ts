import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import * as electron from "electron";

import { startApp } from "./main.js";

/**
 * O único arquivo que carrega o Electron de verdade. O que ele faz é passar o Electron e o
 * sistema ao `startApp`; o compilador confere que o Electron cabe em `ElectronApi`.
 */
void startApp({
  electron,
  platform: process.platform,
  argv: process.argv,
  home: homedir(),
  env: process.env,
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  exec: (command, args, env) =>
    new Promise((resolve) => {
      // `lumem start` espera o `/trpc/health`, até 15 s: o teto aqui é o dobro.
      execFile(command, args, { env, timeout: 30_000 }, (error) => {
        if (error === null) return resolve(0);
        resolve(typeof error.code === "number" ? error.code : 1);
      });
    }),
  now: () => Date.now(),
}).then((handle) => {
  // Só o e2e pede: ele dispara o `click` do ícone, que o Playwright não alcança por fora.
  if (handle !== null && process.env["LUMEM_DESKTOP_HANDLE"] === "1") {
    (globalThis as { lumemDesktop?: unknown }).lumemDesktop = handle;
  }
});
