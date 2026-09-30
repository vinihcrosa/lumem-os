import { describe, expect, it, vi } from "vitest";

import type { DesktopConfig } from "@lumem/shared";

import { createCommands } from "./commands.js";

const CONFIG: DesktopConfig = {
  node: "/opt/node/bin/node",
  lumem: "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs",
  stateDir: "/Users/ana/.lumem",
  origin: "http://127.0.0.1:4317",
  path: "/opt/homebrew/bin:/usr/bin",
};

function setup(config: DesktopConfig = CONFIG, code = 0) {
  const exec = vi.fn(async (_command: string, _args: string[], _env: Record<string, string>) => code);
  return { exec, commands: createCommands({ config, home: "/Users/ana", exec }) };
}

describe("os comandos do menu", () => {
  it("runs the recorded lumem to start and stop", async () => {
    const { exec, commands } = setup();

    expect(await commands.start()).toBe(0);
    expect(await commands.stop()).toBe(0);

    // Os caminhos do `lumem-desktop.json`, absolutos: o app não tem o `PATH` do terminal.
    expect(exec.mock.calls.map(([command, args]) => [command, ...args])).toEqual([
      [CONFIG.node, CONFIG.lumem, "start"],
      [CONFIG.node, CONFIG.lumem, "stop"],
    ]);
  });

  it("hands the terminal's PATH to the service, not the one the app was opened with", async () => {
    // O `lumem start` grava o `PATH` de quem o chamou no arquivo de serviço, e é com ele
    // que o daemon acha `claude` e `git`. Um app aberto pelo Finder tem `/usr/bin:/bin`.
    const { exec, commands } = setup();

    await commands.start();

    expect(exec.mock.calls[0]?.[2]["PATH"]).toBe("/opt/homebrew/bin:/usr/bin");
  });

  it("leaves the PATH it was opened with when the config recorded none", async () => {
    // Sem `path` no arquivo não há o que sobrescrever: o ambiente do app segue como está, e
    // `PATH: undefined` o apagaria para o `lumem start`.
    const { path: _recorded, ...withoutPath } = CONFIG;
    const { exec, commands } = setup(withoutPath);

    await commands.start();

    expect(exec.mock.calls[0]?.[2]["PATH"]).toBe(process.env["PATH"]);
  });

  it("tells the CLI where the daemon is only when it is not the default", async () => {
    // Dizer o padrão explicitamente mudaria o arquivo de serviço, e o próximo `lumem`
    // sem verbo o veria como diferente e reiniciaria o daemon — derrubando as sessões.
    const standard = setup();
    await standard.commands.start();
    const env = standard.exec.mock.calls[0]?.[2] ?? {};
    expect(env["LUMEM_PORT"]).toBeUndefined();
    expect(env["LUMEM_HOST"]).toBeUndefined();
    expect(env["LUMEM_STATE_DIR"]).toBeUndefined();

    const elsewhere = setup({ ...CONFIG, origin: "http://0.0.0.0:5000", stateDir: "/data/lumem" });
    await elsewhere.commands.start();
    expect(elsewhere.exec.mock.calls[0]?.[2]).toMatchObject({
      LUMEM_PORT: "5000",
      LUMEM_HOST: "0.0.0.0",
      LUMEM_STATE_DIR: "/data/lumem",
    });
  });

  it("returns the exit code, so the menu knows whether it worked", async () => {
    expect(await setup(CONFIG, 1).commands.start()).toBe(1);
  });
});
