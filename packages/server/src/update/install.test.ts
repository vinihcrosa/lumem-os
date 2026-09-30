import { PACKAGE_NAME, type InstallCommand } from "@lumem/shared";
import { describe, expect, it, vi } from "vitest";

import { createShutdownHandler } from "../shutdown.js";
import { createInstaller, type InstallerOptions } from "./install.js";

/**
 * A instalação por cima (`038`, Parte 2): rodar o gerenciador dono da cópia e, dando
 * certo, sair com 0 para o supervisor subir a versão nova.
 *
 * O gerenciador de pacote é de mentira e o desligamento é o **de verdade**
 * (`createShutdownHandler`), sobre um alvo que só conta o `close`: a pergunta do
 * C28 é *por onde* o daemon sai, e o que decide isso é o handler — sair por um
 * `process.exit` direto deixaria as sessões e o banco sem fechar.
 */

function shutdownTarget() {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const close = vi.fn(async () => {});
  const exit = vi.fn();
  return { close, exit, log, shutdown: createShutdownHandler({ target: { close, log }, exit }) };
}

function build(overrides: Partial<InstallerOptions> = {}) {
  const held: boolean[] = [];
  const { shutdown, ...spies } = shutdownTarget();
  const install = vi.fn(async (_command: InstallCommand) => 0);
  const installer = createInstaller({
    manager: "npm",
    install,
    shutdown,
    holdPrompts: (value) => held.push(value),
    ...overrides,
  });
  return { installer, install, held, shutdown, ...spies };
}

describe("the install", () => {
  it("exits 0 through the shutdown handler after a good install", async () => {
    const { installer, install, held, close, exit, log } = build();

    installer.start("0.7.0");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    // O gerenciador de pacote certo, com a versão que o `latest` disse — e não
    // `@latest`, que poderia ser outra quando o `npm` chegasse ao registry.
    expect(install).toHaveBeenCalledWith({
      command: "npm",
      args: ["install", "--global", `${PACKAGE_NAME}@0.7.0`],
    });
    // Saiu **pelo** handler: o `close` do daemon rodou antes do `exit(0)`.
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]!);
    expect(exit).toHaveBeenCalledTimes(1);
    // E o handler soube por quê: a razão do desligamento é a atualização.
    expect(log.info).toHaveBeenCalledWith({ signal: "update" }, "shutting down");
    // E a porta de prompt continua fechada: o processo está indo embora.
    expect(held).toEqual([true]);
    expect(installer.installing()).toBe(true);
  });

  it("uses the package manager that owns the running copy", async () => {
    const { installer, install, exit } = build({ manager: "pnpm" });

    installer.start("0.7.0");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(install).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["add", "--global", `${PACKAGE_NAME}@0.7.0`],
    });
  });

  it("stays up and reports the error when the install fails", async () => {
    // Saída não zero: o código está na mensagem.
    const failing = build({ install: vi.fn(async () => 1) });
    failing.installer.start("0.7.0");
    await vi.waitFor(() => expect(failing.installer.installing()).toBe(false));

    expect(failing.installer.lastError()).toContain("1");
    // A porta de prompt fechou e **reabriu**, e o daemon não saiu nem tentou sair.
    expect(failing.held).toEqual([true, false]);
    expect(failing.exit).not.toHaveBeenCalled();
    expect(failing.close).not.toHaveBeenCalled();

    // Falha ao nascer: o gerenciador nem existe no PATH.
    const missing = build({
      install: vi.fn(async () => {
        throw Object.assign(new Error("spawn npm ENOENT"), { code: "ENOENT" });
      }),
    });
    missing.installer.start("0.7.0");
    await vi.waitFor(() => expect(missing.installer.installing()).toBe(false));

    expect(missing.installer.lastError()).toContain("spawn npm ENOENT");
    expect(missing.held).toEqual([true, false]);
    expect(missing.exit).not.toHaveBeenCalled();
  });

  it("stays up and says so when the shutdown itself throws after a good install", async () => {
    // O handler de desligamento existe para não lançar, e se lançar o daemon está de
    // pé na versão velha com a nova em disco: prompt reaberto, e a razão à vista.
    const { installer, held } = build({
      shutdown: async () => {
        throw new Error("close travou");
      },
    });

    installer.start("0.7.0");
    await vi.waitFor(() => expect(installer.installing()).toBe(false));

    expect(installer.lastError()).toContain("close travou");
    expect(held).toEqual([true, false]);
  });

  it("forgets the last error when a new install starts", async () => {
    // Um `lastError` de ontem, mostrado enquanto uma instalação de hoje roda, diria
    // que ela já falhou.
    const { installer } = build({ install: vi.fn(async () => 1) });

    installer.start("0.7.0");
    await vi.waitFor(() => expect(installer.installing()).toBe(false));
    expect(installer.lastError()).not.toBeNull();

    installer.start("0.7.0");
    expect(installer.lastError()).toBeNull();
    expect(installer.installing()).toBe(true);
    await vi.waitFor(() => expect(installer.installing()).toBe(false));
  });
});
