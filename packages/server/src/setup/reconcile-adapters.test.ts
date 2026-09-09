import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_ADAPTER, CODEX_ADAPTER, type AdapterSpec } from "@lumem/shared";
import { afterEach, expect, it, vi } from "vitest";

import { adapterBinaryPath, adapterDir, type AdapterInstall } from "./install-adapter.js";
import { reconcileAdapters } from "./reconcile-adapters.js";

/**
 * A conferência de boot, que existe porque o pino não decidia nada.
 *
 * O que cada caso aqui guarda é a diferença entre *"o pino diz `0.75.1`"* e *"o
 * processo que responde `session/prompt` é o `0.75.1`"*. Elas foram a mesma frase
 * por nove dias nesta máquina e não eram o mesmo fato — [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-adapters-"));
  dirs.push(dir);
  return dir;
}

/** Uma instalação como o npm a deixa: o bin, e o `package.json` que diz a versão. */
function stage(dir: string, spec: AdapterSpec, version: string | null): void {
  const bin = adapterBinaryPath(dir, spec);
  mkdirSync(join(bin, ".."), { recursive: true });
  writeFileSync(bin, "");

  if (version === null) return;
  const pkg = join(adapterDir(dir, spec), "node_modules", ...(spec.package ?? "").split("/"));
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: spec.package, version }));
}

function installer(result?: Partial<AdapterInstall>) {
  return vi.fn(
    (options: { spec?: AdapterSpec }): Promise<AdapterInstall> =>
      Promise.resolve({
        path: "/installed",
        version: options.spec?.pinnedVersion ?? CLAUDE_ADAPTER.pinnedVersion,
        alreadyInstalled: false,
        ...result,
      }),
  ) as unknown as typeof import("./install-adapter.js").installAdapter;
}

it("upgrades a managed copy that is not on the pin", async () => {
  /*
   * O caso exato de 2026-09-08: o disco no `0.40.0`, o pino no `0.75.1`. O
   * `0.40.0` embute o Claude Code `2.1.160`, que não conhece Opus 5 nem Fable 5.1
   * e relatou uma janela de 200K num rótulo que dizia "1M context".
   */
  const dir = tempDir();
  stage(dir, CLAUDE_ADAPTER, "0.40.0");
  const install = installer();

  const [claude] = await reconcileAdapters({ dir, specs: [CLAUDE_ADAPTER], install });

  expect(claude).toMatchObject({ id: "claude", outcome: "upgraded", version: "0.75.1" });
  expect(install).toHaveBeenCalledOnce();
});

it("does not run npm for a copy already on the pin", async () => {
  const dir = tempDir();
  stage(dir, CLAUDE_ADAPTER, CLAUDE_ADAPTER.pinnedVersion);
  const install = installer();

  const [claude] = await reconcileAdapters({ dir, specs: [CLAUDE_ADAPTER], install });

  expect(claude?.outcome).toBe("already-pinned");
  expect(install).not.toHaveBeenCalled();
});

it("leaves a first install to the flow that has a screen", async () => {
  /*
   * Deliberado, e a razão é ordem de boot: baixar 243 MB aqui manteria o socket
   * fechado pelo tempo de um `npm install`, e a tela que existe para mostrar esse
   * progresso — o passo de instalação do primeiro acesso — não carrega antes do
   * socket abrir. Quem recusa a sessão nesse meio-tempo é o `adapterCommandFor`.
   */
  const dir = tempDir();
  const install = installer();

  const [claude] = await reconcileAdapters({ dir, specs: [CLAUDE_ADAPTER], install });

  expect(claude?.outcome).toBe("absent");
  expect(install).not.toHaveBeenCalled();
});

it("leaves a layout with no manifest alone instead of guessing", async () => {
  // A mesma regra que o `install-adapter.ts` já escreve: um diretório que este
  // daemon não escreveu, e rebaixar 243 MB por chute é pior que dizer "não sei o
  // que está aí".
  const dir = tempDir();
  stage(dir, CLAUDE_ADAPTER, null);
  const install = installer();

  const [claude] = await reconcileAdapters({ dir, specs: [CLAUDE_ADAPTER], install });

  expect(claude).toMatchObject({ outcome: "unreadable", version: null });
  expect(install).not.toHaveBeenCalled();
});

it("survives an install that failed, and says which version stayed", async () => {
  // Um upgrade que falhou não é um boot que falhou. O daemon sobe na cópia velha e
  // **diz** — o que é estritamente melhor que os nove dias, em que ele subiu na
  // cópia velha e não disse nada.
  const dir = tempDir();
  stage(dir, CLAUDE_ADAPTER, "0.40.0");
  const install = (() => Promise.reject(new Error("npm error code ENOTFOUND"))) as unknown as
    typeof import("./install-adapter.js").installAdapter;

  const [claude] = await reconcileAdapters({ dir, specs: [CLAUDE_ADAPTER], install });

  expect(claude).toMatchObject({ outcome: "failed", version: "0.40.0" });
  expect(claude?.detail).toContain("ENOTFOUND");
});

it("answers one entry per spec, so no adapter is silently skipped", async () => {
  const dir = tempDir();
  stage(dir, CLAUDE_ADAPTER, CLAUDE_ADAPTER.pinnedVersion);

  const results = await reconcileAdapters({
    dir,
    specs: [CLAUDE_ADAPTER, CODEX_ADAPTER],
    install: installer(),
  });

  expect(results.map((result) => result.id)).toEqual(["claude", "codex"]);
});
