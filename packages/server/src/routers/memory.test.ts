import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listAccess } from "../memory/access.js";
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
  return { caller: created.api, db: created.db, stateDir };
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
    // O par, e não só a contagem: é ele que a UI da PR 05 usa para responder
    // "por que esta memória não está valendo", e invertido ele mente.
    expect(view.shadowed[0]?.winner).toBe(
      "workspaces/ws1/projects/p1/memory/user_estilo-de-revisao.md",
    );
    expect(view.shadowed[0]?.loser).toBe("workspaces/ws1/memory/user_estilo-de-revisao.md");
  });

  it("toda leitura atravessa o funil e fica registrada (Q26 + D8)", async () => {
    const { caller, db } = await api();
    await caller.memory.write(base);

    await caller.memory.read({ type: "user", name: "Estilo de revisão", fromProjectId: "p1" });
    await caller.memory.list({ workspaceId: "ws1", projectId: "p2", actor: "agent" });

    // "Livre" (Q26) não é "sem registro": o funil da D8 nasce com o registro
    // funcionando, senão a tabela só passa a existir junto com a permissão.
    const rows = listAccess(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.decision)).toEqual(["allowed", "allowed"]);
    expect(rows.find((row) => row.actor === "agent")).toMatchObject({
      kind: "memory",
      workspaceId: "ws1",
      targetProjectId: "p2",
    });
    expect(rows.find((row) => row.fromProjectId === "p1")?.target).toBe("user/Estilo de revisão");
  });

  it("revert só aceita caminho de memória — o `~/.lumem` não é editável pela API", async () => {
    const { caller, stateDir } = await api();

    await expect(caller.memory.revert({ path: ".gitignore" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    // O git barra `../`; ele não barra `.gitignore`. Sem a guarda, desfazer
    // apagava qualquer arquivo *tracked* do repositório do daemon.
    expect(existsSync(join(stateDir, ".gitignore"))).toBe(true);
  });

  it("agente não escreve contract de workspace direto — é proposta (Q27)", async () => {
    const { caller, stateDir } = await api();

    await expect(
      caller.memory.write({
        name: "Contrato de checkout",
        description: "O que o front espera do back",
        type: "contract",
        scope: "workspace",
        workspaceId: "ws1",
        actor: "agent",
        body: "Itens e cupom.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Fail-closed enquanto a inbox da PR 05 não existe — e a recusa fica no WAL,
    // que é onde se pergunta "por que isso não foi salvo?".
    const decisions = await caller.memory.decisions();
    expect(decisions[0]?.outcome).toBe("rejected");
    expect(decisions[0]?.reason).toContain("Q27");
    expect(
      existsSync(join(stateDir, "workspaces/ws1/memory/contract_contrato-de-checkout.md")),
    ).toBe(false);
  });

  it("o mesmo `project` escrito por agente vai direto — a assimetria é a da Q27", async () => {
    const { caller } = await api();

    const written = await caller.memory.write({
      name: "Onde mora o build",
      description: "O build sai em dist/",
      type: "project",
      workspaceId: "ws1",
      projectId: "p1",
      actor: "agent",
      body: "dist/ é derivado.",
    });

    expect(written.outcome).toBe("applied");
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
