import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";
import { MEMORY_ACTORS, MEMORY_SCOPES, MEMORY_TYPES } from "./entry.js";
import { requiresProposal } from "./proposals.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

async function service() {
  const stateDir = join(tempDir("lumem-proposal-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const db = openTestDb();
  databases.push(db);
  return { memory: new MemoryService({ db: db.db, stateDir }), stateDir };
}

const doWorkspace = {
  name: "Plano sem preço",
  description: "Usuário sem plano ativo vê catálogo, não preço",
  type: "domain" as const,
  body: "Regra de produto.",
  workspaceId: "ws1",
};

describe("requiresProposal — a matriz da Q27", () => {
  const naoHumanos = MEMORY_ACTORS.filter((actor) => actor !== "human");

  it("humano escreve qualquer tipo em qualquer escopo", () => {
    for (const type of MEMORY_TYPES) {
      for (const scope of MEMORY_SCOPES) {
        expect(requiresProposal("human", scope, type)).toBe(false);
      }
    }
  });

  it("os três tipos que valem para N projetos são proposta em qualquer escopo, para qualquer não-humano", () => {
    // Um caso por tipo e por ator, e não só `contract` × `agent`: `auto_research`
    // e `distiller` são exatamente os atores que o §7 do context-delivery cobre
    // com "proposta sempre, independentemente da evidência".
    for (const type of ["domain", "process", "contract"] as const) {
      for (const actor of naoHumanos) {
        for (const scope of MEMORY_SCOPES) {
          expect(requiresProposal(actor, scope, type)).toBe(true);
        }
      }
    }
  });

  it("escrever para cima é proposta mesmo para os tipos que vão direto", () => {
    // Só pelo tipo, um `project` gravado com `scope: "workspace"` subiria direto
    // — e "escrita para cima é revisada" é a assimetria do §11. `global` entra
    // junto porque é mais largo que `workspace` (Q27.1).
    for (const type of ["user", "feedback", "project", "reference"] as const) {
      for (const actor of naoHumanos) {
        expect(requiresProposal(actor, "workspace", type)).toBe(true);
        expect(requiresProposal(actor, "global", type)).toBe(true);
      }
    }
  });

  it("o que sobra indo direto é o escopo do próprio projeto, fora dos três tipos", () => {
    for (const actor of naoHumanos) {
      expect(requiresProposal(actor, "project", "project")).toBe(false);
      expect(requiresProposal(actor, "project", "reference")).toBe(false);
      // E o inverso, para o teste não passar por vacuidade: `user` e `feedback`
      // não têm escopo de projeto como default, mas pedido explicitamente também
      // vão direto — a regra é a dos dois eixos, não uma lista de tipos.
      expect(requiresProposal(actor, "project", "user")).toBe(false);
    }
  });
});

describe("requiresProposal — o que a inbox acrescentou", () => {
  it("agente escrevendo memória de projeto vai direto — erra barato", () => {
    expect(requiresProposal("agent", "project", "project")).toBe(false);
    expect(requiresProposal("agent", "project", "reference")).toBe(false);
  });

  it("você escrevendo no workspace não vira proposta — você é a revisão", () => {
    expect(requiresProposal("human", "workspace", "domain")).toBe(false);
  });

  // As duas metades do critério são independentes, e cada uma sozinha decide.
  // Sem estes dois casos cruzados, apagar qualquer uma delas deixa a suíte verde.
  it("tipo de workspace precisa de revisão mesmo gravado em escopo de projeto", () => {
    expect(requiresProposal("agent", "project", "domain")).toBe(true);
    expect(requiresProposal("agent", "project", "process")).toBe(true);
    expect(requiresProposal("agent", "project", "contract")).toBe(true);
  });

  it("escopo que atravessa projeto precisa de revisão mesmo com tipo barato", () => {
    expect(requiresProposal("agent", "workspace", "user")).toBe(true);
    expect(requiresProposal("agent", "workspace", "reference")).toBe(true);
  });

  // Q27.1: `global` é mais largo que `workspace`. Deixá-lo livre seria guardar a
  // porta estreita e abrir a larga — a destilação por sessão escreve exatamente
  // aqui.
  it("global é revisado junto com workspace, porque é mais largo", () => {
    expect(requiresProposal("distiller", "global", "feedback")).toBe(true);
    expect(requiresProposal("auto_research", "global", "user")).toBe(true);
  });

  it("`import` também é revisado — o que vem de fora não é mais confiável", () => {
    expect(requiresProposal("import", "workspace", "domain")).toBe(true);
    expect(requiresProposal("import", "project", "reference")).toBe(false);
  });
});

describe("a inbox", () => {
  it("escrita de agente no workspace vira proposta, e não toca o disco", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write({ ...doWorkspace, actor: "agent" });

    expect(result.outcome).toBe("proposed");
    expect(existsSync(join(stateDir, result.path))).toBe(false);
    expect(memory.list()).toHaveLength(0);
    expect(memory.proposals()).toHaveLength(1);
  });

  it("a mesma escrita feita por você é aplicada direto", async () => {
    const { memory } = await service();

    const result = await memory.write({ ...doWorkspace, actor: "human" });

    expect(result.outcome).toBe("applied");
    expect(memory.proposals()).toHaveLength(0);
  });

  it("a proposta carrega quem propôs, de onde, e a evidência", async () => {
    const { memory } = await service();

    await memory.write({
      ...doWorkspace,
      actor: "auto_research",
      projectId: "api",
      evidence: "api/src/billing/plan.ts:88",
      confidence: "low",
      sourceSessions: ["s-42"],
    });

    const [proposal] = memory.proposals();
    expect(proposal?.actor).toBe("auto_research");
    expect(proposal?.fromProjectId).toBe("api");
    expect(proposal?.evidence).toBe("api/src/billing/plan.ts:88");
    expect(proposal?.confidence).toBe("low");
    expect(proposal?.sessionId).toBe("s-42");
  });

  it("aprovar grava, e a escrita passa a ser sua", async () => {
    const { memory, stateDir } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();

    const result = await memory.approveProposal(proposal!.id);

    expect(result.outcome).toBe("applied");
    expect(existsSync(join(stateDir, result.path))).toBe(true);
    // Quem revisou e mandou gravar foi você — a origem fica na proposta.
    expect(memory.list()[0]?.sourceActor).toBe("human");
    expect(memory.proposals({ status: "approved" })).toHaveLength(1);
    expect(memory.proposals({ status: "pending" })).toHaveLength(0);
  });

  it("aprovar guarda quem propôs, a sessão e a proposta no arquivo", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent", projectId: "api", sourceSessions: ["s-7"] });
    const [proposal] = memory.proposals();

    await memory.approveProposal(proposal!.id);

    const entry = await memory.read("domain", "Plano sem preço", "workspace", {
      workspaceId: "ws1",
    });
    // Quem gravou é você; quem propôs continua no arquivo, com a sessão e o id
    // da proposta — `path` sozinho não distingue duas propostas do mesmo alvo.
    expect(entry.provenance.source_actor).toBe("human");
    expect(entry.provenance.proposed_by).toBe("agent");
    expect(entry.provenance.proposal_id).toBe(proposal!.id);
    expect(entry.provenance.source_sessions).toEqual(["s-7"]);
  });

  it("aprovar com edição grava o que você editou", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();

    await memory.approveProposal(proposal!.id, { body: "Corrigi antes de aceitar." });

    const entry = await memory.read("domain", "Plano sem preço", "workspace", {
      workspaceId: "ws1",
    });
    expect(entry.body).toBe("Corrigi antes de aceitar.");
  });

  it("aprovar não pode virar proposta de novo — seria laço", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();

    await memory.approveProposal(proposal!.id);

    expect(memory.proposals({ status: "pending" })).toHaveLength(0);
    expect(memory.list()).toHaveLength(1);
  });

  it("rejeitar mantém a proposta visível, com o motivo", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();

    const rejected = memory.rejectProposal(proposal!.id, "isso é regra do api, não do produto");

    // Recusar é histórico, não apagamento: é o que responde por que o sistema
    // insiste num assunto.
    expect(rejected.status).toBe("rejected");
    expect(rejected.resolutionNote).toContain("regra do api");
    expect(memory.proposals({ status: "rejected" })).toHaveLength(1);
    expect(memory.list()).toHaveLength(0);
  });

  it("`resolved` responde as duas juntas — e exclui a que ainda está pendente", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    await memory.write({ ...doWorkspace, name: "Squash antes de mergear", type: "process", actor: "agent" });
    // A terceira fica pendente de propósito: sem ela, "não filtrar nada" e
    // "filtrar o que não está pendente" devolvem a mesma lista.
    await memory.write({ ...doWorkspace, name: "Contrato de checkout", type: "contract", actor: "agent" });
    const [primeira, segunda] = memory.proposals({ status: "pending" });
    await memory.approveProposal(primeira!.id);
    memory.rejectProposal(segunda!.id, "não é do produto");

    // Uma pergunta só para "o que eu já decidi": a tela não deveria precisar
    // saber que `resolved` tem dois valores por baixo.
    expect(memory.proposals({ status: "resolved" })).toHaveLength(2);
    expect(memory.proposals({ status: "pending" })).toHaveLength(1);
    expect(memory.proposals()).toHaveLength(3);
  });

  it("aprovar a mesma proposta duas vezes é no-op — o carimbo não é conteúdo", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent", sourceSessions: ["s-1"] });
    const [primeira] = memory.proposals({ status: "pending" });
    await memory.approveProposal(primeira!.id);
    // A mesma sessão repropondo o mesmo texto: `proposal_id` é um id novo, e sem
    // ele fora da assinatura isto viraria um commit cujo único delta é o carimbo.
    await memory.write({ ...doWorkspace, actor: "agent", sourceSessions: ["s-1"] });
    const [segunda] = memory.proposals({ status: "pending" });

    const result = await memory.approveProposal(segunda!.id);

    // Duplicata exata continua sendo `noop` (passo 3 do §7 do PRD).
    expect(result.outcome).toBe("noop");
    expect(memory.proposals({ status: "approved" })).toHaveLength(2);
    const entry = await memory.read("domain", "Plano sem preço", "workspace", {
      workspaceId: "ws1",
    });
    // A proveniência continua apontando para a proposta que de fato gravou.
    expect(entry.provenance.proposal_id).toBe(primeira!.id);
  });

  it("proposta de outra sessão acumula a origem em vez de trocá-la", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent", sourceSessions: ["s-1"] });
    await memory.approveProposal(memory.proposals({ status: "pending" })[0]!.id);
    await memory.write({ ...doWorkspace, actor: "agent", sourceSessions: ["s-2"] });

    const result = await memory.approveProposal(memory.proposals({ status: "pending" })[0]!.id);

    // Uma sessão nova que ensina a mesma coisa é informação nova — grava. E o
    // que grava **soma** as origens: trocar a lista apagaria quem ensinou
    // primeiro, e é o que fazia cada nova sessão custar um commit sem ganho.
    expect(result.outcome).toBe("applied");
    const entry = await memory.read("domain", "Plano sem preço", "workspace", {
      workspaceId: "ws1",
    });
    expect(entry.provenance.source_sessions).toEqual(["s-1", "s-2"]);

    // E aí a terceira proposta da mesma sessão volta a ser duplicata.
    await memory.write({ ...doWorkspace, actor: "agent", sourceSessions: ["s-2"] });
    const terceira = await memory.approveProposal(memory.proposals({ status: "pending" })[0]!.id);
    expect(terceira.outcome).toBe("noop");
  });

  it("resolver duas vezes é recusado", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();
    memory.rejectProposal(proposal!.id);

    expect(() => memory.rejectProposal(proposal!.id)).toThrow(/já foi rejected/);
  });
});
