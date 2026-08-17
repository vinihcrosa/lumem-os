import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ensureMemoryHome } from "../memory/home.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * A paridade da PR 03: o router e a CLI chamam o **mesmo** núcleo.
 *
 * O que estes testes protegem não é o roteamento — é a ausência de uma segunda
 * semântica. Uma superfície que valida diferente, ou que grava sem passar pelo
 * portão, é a forma como um sistema com duas portas passa a ter duas verdades.
 */

const callers: TestCaller[] = [];

afterEach(async () => {
  await Promise.all(callers.splice(0).map((caller) => caller.cleanup()));
  cleanupGitFixtures();
});

async function api() {
  const stateDir = join(tempDir("lumem-router-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  // O state dir é o do teste: o router escreve no disco, e a suíte não pode
  // escrever no `~/.lumem` de quem roda ela.
  const created = createTestCaller({ LUMEM_STATE_DIR: stateDir, LUMEM_DB_PATH: join(stateDir, "lumem.db") });
  callers.push(created);
  return { caller: created.api, stateDir };
}

const base = {
  name: "Estilo de revisão",
  description: "Achado com arquivo e linha antes do texto",
  type: "user" as const,
  body: "Achado primeiro.",
};

describe("memory router", () => {
  it("escreve e lê pela mesma identidade", async () => {
    const { caller } = await api();

    const written = await caller.memory.write(base);
    expect(written.outcome).toBe("applied");

    const read = await caller.memory.read({ type: "user", name: "Estilo de revisão" });
    expect(read.body).toBe("Achado primeiro.");
  });

  it("recusa segredo com CONFLICT, e a decisão fica registrada", async () => {
    const { caller } = await api();

    await expect(
      caller.memory.write({ ...base, body: "AKIAIOSFODNN7EXAMPLE" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const decisions = await caller.memory.decisions();
    expect(decisions[0]?.outcome).toBe("rejected");
    expect(decisions[0]?.ruleTrace).toContain("aws_access_key");
  });

  it("list devolve o visível e o que foi sombreado", async () => {
    const { caller } = await api();
    await caller.memory.write({ ...base, scope: "workspace", workspaceId: "ws1" });
    await caller.memory.write({
      ...base,
      body: "No back é diferente.",
      scope: "project",
      workspaceId: "ws1",
      projectId: "p1",
    });

    const view = await caller.memory.list({ workspaceId: "ws1", projectId: "p1" });

    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]?.scope).toBe("project");
    expect(view.shadowed).toHaveLength(1);
    expect(view.shadowed[0]?.identity).toBe("user/estilo-de-revisao");
  });

  it("ler o que não existe é NOT_FOUND, e não erro cru", async () => {
    const { caller } = await api();

    await expect(caller.memory.read({ type: "user", name: "Inexistente" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("revert pela API desfaz a última mudança", async () => {
    const { caller } = await api();
    const first = await caller.memory.write({ ...base, body: "primeira" });
    await caller.memory.write({ ...base, body: "segunda" });

    const result = await caller.memory.revert({ path: first.path });

    expect(result.outcome).toBe("reverted");
    expect((await caller.memory.read({ type: "user", name: "Estilo de revisão" })).body).toBe(
      "primeira",
    );
  });

  it("reindex reconstrói o catálogo", async () => {
    const { caller } = await api();
    await caller.memory.write(base);

    const result = await caller.memory.reindex();

    expect(result.indexed).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});
