import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_RESTART_PORT } from "../ports.js";
import { call, query, startDaemon } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ALT } from "./support/fixtures.js";

/**
 * A pergunta sem resposta preenche o próprio buraco.
 *
 * **Daemon próprio**, como o da destilação, e pelo mesmo motivo de produto: o
 * auto-learn vem desligado, e o daemon compartilhado tem que continuar rodando
 * com o default — uma pergunta que cria memória num daemon que outros specs usam
 * é estado aparecendo do nada nas asserções deles.
 *
 * O que só aqui se prova: que a porta HTTP, o agente de pesquisa, o critério de
 * evidência e o portão de escrita são a mesma corrente — e que a segunda pergunta
 * não paga o agente de novo.
 */

const AGENT = "acp-falso";

test.setTimeout(180_000);

interface Entry {
  name: string;
  sourceActor: string;
  confidence: string;
}

async function ask(daemonUrl: string, question: string, sessionId?: string): Promise<string> {
  const url = new URL(`${daemonUrl}/memory/ask`);
  url.searchParams.set("q", question);
  if (sessionId !== undefined) url.searchParams.set("session", sessionId);
  const response = await fetch(url);
  return response.text();
}

test("uma pergunta sem resposta vira memória com evidência, e só custa uma vez", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-autolearn-"));
  const daemon = await startDaemon({
    port: E2E_RESTART_PORT,
    stateDir,
    env: { LUMEM_MEMORY_AUTO_LEARN: "1", LUMEM_MEMORY_AUTO_LEARN_BUDGET: "2" },
  });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "pesquisa" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };
    const configs = (await query(daemon.url, "agentConfig.list", {})) as {
      id: string;
      name: string;
    }[];
    const config = configs.find((candidate) => candidate.name === AGENT)!;
    const session = (await call(daemon.url, "session.createAgent", {
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    })) as { id: string };

    const first = await ask(daemon.url, "como o loader trata frontmatter vazio", session.id);

    // A resposta chegou, e ela **diz** que é nova e não verificada.
    expect(first).toContain("frontmatter vazio");
    expect(first).toContain("não está verificado");
    expect(first).toContain("gravada");

    const view = (await query(daemon.url, "memory.list", {
      workspaceId: workspace.id,
      projectId: project.id,
    })) as { entries: Entry[] };
    const [entry] = view.entries;
    expect(entry?.name).toBe("Frontmatter vazio no loader");
    // Proveniência própria e confiança baixa: nasceu de um buraco no acervo.
    expect(entry?.sourceActor).toBe("auto_research");
    expect(entry?.confidence).toBe("low");

    const stored = (await query(daemon.url, "memory.read", {
      type: "project",
      name: "Frontmatter vazio no loader",
      scope: "project",
      workspaceId: workspace.id,
      projectId: project.id,
    })) as { body: string };
    expect(stored.body).toContain("não verificada");
    expect(stored.body).toContain("src/lore/loader.ts:12");

    // A segunda pergunta idêntica sai do cache: a mesma pergunta duas vezes não
    // sobe agente duas vezes (§5.4). Se subisse, o orçamento de 2 permitiria — e
    // é isso que faz este assert medir cache, e não orçamento.
    const second = await ask(daemon.url, "como o loader trata frontmatter vazio", session.id);
    expect(second).toContain("frontmatter vazio");

    const research = (await query(daemon.url, "memory.usage", {})) as {
      kind: string;
      events: number;
    }[];
    expect(research.find((row) => row.kind === "research")?.events).toBe(1);
  } finally {
    await daemon.stop();
    rmSync(stateDir, { recursive: true, force: true });
  }
});
