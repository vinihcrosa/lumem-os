import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";
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

describe("requiresProposal", () => {
  it("agente escrevendo no workspace precisa de revisão", () => {
    expect(requiresProposal("agent", "workspace", "domain")).toBe(true);
    expect(requiresProposal("auto_research", "workspace", "contract")).toBe(true);
  });

  it("agente escrevendo memória de projeto vai direto — erra barato", () => {
    expect(requiresProposal("agent", "project", "project")).toBe(false);
    expect(requiresProposal("agent", "project", "reference")).toBe(false);
  });

  it("você escrevendo no workspace não vira proposta — você é a revisão", () => {
    expect(requiresProposal("human", "workspace", "domain")).toBe(false);
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

  it("resolver duas vezes é recusado", async () => {
    const { memory } = await service();
    await memory.write({ ...doWorkspace, actor: "agent" });
    const [proposal] = memory.proposals();
    memory.rejectProposal(proposal!.id);

    expect(() => memory.rejectProposal(proposal!.id)).toThrow(/já foi rejected/);
  });
});
