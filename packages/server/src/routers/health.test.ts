import { LUMEM_VERSION } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * `health` (`038` Parte 1): o que a casca e o CLI leem antes de qualquer outra
 * coisa. `supervised` sai do ambiente do daemon, e o teste monta o daemon pelo
 * mesmo `loadConfig(env)` que o `main.ts` usa — o caller é a outra montagem da
 * `LUMEM_SUPERVISOR`, ao lado do serviço de verdade.
 */

let context: TestCaller | undefined;

afterEach(async () => {
  await context?.cleanup();
  context = undefined;
});

async function healthWith(env: Record<string, string>) {
  context = createTestCaller(env);
  return await context.api.health();
}

describe("health", () => {
  it("answers supervised from LUMEM_SUPERVISOR", async () => {
    expect((await healthWith({ LUMEM_SUPERVISOR: "launchd" })).supervised).toBe(true);
    await context?.cleanup();
    expect((await healthWith({ LUMEM_SUPERVISOR: "systemd" })).supervised).toBe(true);
    await context?.cleanup();
    expect((await healthWith({})).supervised).toBe(false);
    await context?.cleanup();
    // Um valor que ninguém reconhece é um valor que alguém digitou errado; o
    // botão de atualizar não pode ligar por isso.
    expect((await healthWith({ LUMEM_SUPERVISOR: "supervisord" })).supervised).toBe(false);
    await context?.cleanup();
    expect((await healthWith({ LUMEM_SUPERVISOR: "" })).supervised).toBe(false);
  });

  it("answers protocolVersion 1", async () => {
    expect(await healthWith({})).toEqual({
      ok: true,
      version: LUMEM_VERSION,
      supervised: false,
      protocolVersion: 1,
    });
  });
});
