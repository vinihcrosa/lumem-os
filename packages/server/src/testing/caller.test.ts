import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "./caller.js";

/**
 * A guarda que faltava.
 *
 * Sem ela, `loadConfig({})` resolvia para o `~/.lumem` **de verdade** e tudo que
 * corre por cima gravava lá: nove diretórios `lumem-git-*` no estado real da
 * máquina de quem escreveu isto, deixados por suítes que passaram.
 *
 * A regra que o banco já seguia agora vale para o diretório, e este arquivo é o
 * que impede a próxima pessoa de desfazê-la sem notar.
 */

let context: TestCaller | undefined;

afterEach(async () => {
  await context?.cleanup();
  context = undefined;
});

describe("createTestCaller", () => {
  it("nunca aponta para o estado real da máquina", () => {
    context = createTestCaller();

    expect(context.config.stateDir).not.toBe(join(homedir(), ".lumem"));
    expect(context.config.stateDir).not.toContain(join(homedir(), ".lumem"));
  });

  it("respeita um stateDir que o teste escolheu", () => {
    // O override existe para o teste que precisa preparar o diretório antes.
    context = createTestCaller({ LUMEM_STATE_DIR: "/tmp/lumem-escolhido" });

    expect(context.config.stateDir).toBe("/tmp/lumem-escolhido");
  });

  it("deriva o banco e as worktrees do mesmo diretório descartável", () => {
    // É o que fecha o buraco: `worktreesDir` é o que `worktree.create` usa, e era
    // por ele que a suíte escrevia no `~/.lumem` real.
    context = createTestCaller();
    const { stateDir, worktreesDir, transcriptsDir } = context.config;

    expect(worktreesDir.startsWith(stateDir)).toBe(true);
    expect(transcriptsDir.startsWith(stateDir)).toBe(true);
  });
});
