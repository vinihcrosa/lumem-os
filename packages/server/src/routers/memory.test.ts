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
      // O alvo diz **qual** escopo foi listado: uma linha de auditoria que só
      // diz "alguém listou algo" não responde nada depois.
      target: "list:ws1/p2",
    });
    expect(rows.find((row) => row.fromProjectId === "p1")?.target).toBe("user/Estilo de revisão");
  });

  it("agente não apaga memória pela API — apagar é sempre ação sua (Q29)", async () => {
    const { caller } = await api();
    await caller.memory.write(base);

    await expect(
      caller.memory.forget({ type: "user", name: "Estilo de revisão", actor: "agent" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Fechar a escrita e deixar a deleção aberta seria fechar a porta da frente e
    // esquecer a dos fundos.
    expect((await caller.memory.read({ type: "user", name: "Estilo de revisão" })).body).toBe(
      "Achado primeiro.",
    );
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

    const written = await caller.memory.write({
      name: "Contrato de checkout",
      description: "O que o front espera do back",
      type: "contract",
      scope: "workspace",
      workspaceId: "ws1",
      actor: "agent",
      body: "Itens e cupom.",
    });

    // A 03 recusava com motivo porque a inbox não existia; a 05 desvia. O
    // invariante é o mesmo: a segunda superfície não tem atalho em volta dele.
    expect(written.outcome).toBe("proposed");
    expect(await caller.memory.proposals({ status: "pending" })).toHaveLength(1);
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

  it("search pela API respeita escopo e devolve a explicação", async () => {
    const { caller } = await api();
    await caller.memory.write({
      name: "Contrato de checkout",
      description: "api expõe POST /v2/checkout e o web consome",
      type: "contract",
      workspaceId: "ws1",
      body: "itens e cupom",
    });

    const result = await caller.memory.search({ query: "checkout consome", workspaceId: "ws1" });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.why.join(" ")).toContain("score=");

    // Outro workspace não enxerga: escopo antes de relevância.
    const outro = await caller.memory.search({ query: "checkout consome", workspaceId: "ws2" });
    expect(outro.hits).toHaveLength(0);
  });

  it("busca por query não registra, e o recall do agente registra", async () => {
    const { caller } = await api();
    await caller.memory.write(base);

    // `search` é leitura: refetch e retry do cliente não podem subir o número
    // que o §6 usa para decidir o desenho.
    await caller.memory.search({ query: "estilo revisao" });
    expect(await caller.memory.usage()).toHaveLength(0);

    await caller.memory.recall({ query: "estilo revisao", sessionId: "s1" });

    const summary = await caller.memory.usage();
    const recallRow = summary.find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(1);
    expect(recallRow?.sessions).toBe(1);
  });

  it("aprovar pela API grava no disco e resolve a proposta", async () => {
    const { caller } = await api();
    await caller.memory.write({
      name: "Plano sem preço",
      description: "Usuário sem plano ativo vê catálogo, não preço",
      type: "domain",
      workspaceId: "ws1",
      body: "Regra de produto.",
      actor: "agent",
    });
    const [proposal] = await caller.memory.proposals({ status: "pending" });

    const result = await caller.memory.approveProposal({
      id: proposal!.id,
      body: "Corrigi antes de aceitar.",
    });

    expect(result.outcome).toBe("applied");
    const read = await caller.memory.read({
      type: "domain",
      name: "Plano sem preço",
      scope: "workspace",
      workspaceId: "ws1",
    });
    expect(read.body).toBe("Corrigi antes de aceitar.");
    expect(await caller.memory.proposals({ status: "approved" })).toHaveLength(1);
  });

  it("proposta que não existe é NOT_FOUND, e resolver duas vezes é CONFLICT", async () => {
    const { caller } = await api();

    // O contrato de erro é o do núcleo, traduzido pelo `domainSafe` — não uma
    // segunda semântica desta superfície.
    await expect(caller.memory.approveProposal({ id: "nao-existe" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await caller.memory.write({
      name: "Squash antes de mergear",
      description: "O time faz squash na main",
      type: "process",
      workspaceId: "ws1",
      body: "",
      actor: "agent",
    });
    const [proposal] = await caller.memory.proposals({ status: "pending" });
    const rejected = await caller.memory.rejectProposal({
      id: proposal!.id,
      note: "isso é regra do api",
    });
    expect(rejected.resolutionNote).toBe("isso é regra do api");

    await expect(caller.memory.rejectProposal({ id: proposal!.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // `resolved` é valor do contrato, e não da tela: sem este caso, tirá-lo do
    // enum passa build e suíte, e só quebra no navegador.
    const resolvidas = await caller.memory.proposals({ status: "resolved" });
    expect(resolvidas).toHaveLength(1);
    expect(await caller.memory.proposals({ status: "pending" })).toHaveLength(0);
  });

  it("reindex reconstrói o catálogo", async () => {
    const { caller } = await api();
    await caller.memory.write(base);

    const result = await caller.memory.reindex();

    expect(result.indexed).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});
