import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_RESTART_PORT } from "../ports.js";
import { call, query, startDaemon } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ALT } from "./support/fixtures.js";

/**
 * A sessão termina, e o que ela ensinou espera revisão.
 *
 * **Daemon próprio**, e por um motivo de produto: a destilação vem **desligada**
 * (§10 do PRD), e o daemon que a suíte compartilha tem que continuar rodando com
 * o default — ligar lá faria toda sessão de agente de todo spec produzir uma
 * proposta, e os specs da memória asseguram justamente o conteúdo da inbox.
 *
 * A aprovação **pela tela** não está aqui, e não é buraco: ela é o segundo spec
 * do `memory.spec.ts`, contra o daemon compartilhado, que é o único com navegador
 * apontado para ele. O que só este arquivo pode provar é o começo da corrente —
 * que uma sessão de verdade, terminando, produz o que a tela depois revisa.
 */

const AGENT = "acp-falso";

// Um daemon próprio para subir, uma worktree para criar, um turno para rodar e a
// destilação depois de tudo isso. O default de 30 s é para spec de tela.
test.setTimeout(180_000);

interface SessionRow {
  id: string;
  state: string;
}

interface Proposal {
  id: string;
  name: string;
  actor: string;
  status: string;
}

/** Um turno pela conversa, respondendo a permissão que o agente falso pede. */
async function converse(daemonUrl: string, sessionId: string, text: string): Promise<void> {
  const socket = new WebSocket(`${daemonUrl.replace("http://", "ws://")}/acp?session=${sessionId}`);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("o turno não terminou em 30 s")), 30_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "prompt", text })));
    socket.addEventListener("error", () => reject(new Error("o socket da conversa falhou")));
    socket.addEventListener("message", (frame) => {
      const message = JSON.parse(String(frame.data)) as {
        type: string;
        event?: { type: string; requestId?: string; options?: { optionId: string }[] };
      };
      if (message.type !== "event" || !message.event) return;
      if (message.event.type === "permission_request") {
        socket.send(
          JSON.stringify({
            type: "permission_response",
            requestId: message.event.requestId,
            optionId: message.event.options?.[0]?.optionId ?? "allow",
          }),
        );
      }
      if (message.event.type === "turn_end") {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
  });
}

test("uma sessão que termina vira proposta na inbox, e aprovar vira memória", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-destilacao-"));
  // A única diferença em relação ao daemon da suíte: a destilação ligada.
  const daemon = await startDaemon({
    port: E2E_RESTART_PORT,
    stateDir,
    env: { LUMEM_MEMORY_DISTILL: "1" },
  });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "destilacao" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };
    const worktree = (await call(daemon.url, "worktree.create", {
      projectId: project.id,
      name: "destilacao-api",
    })) as { id: string };
    const configs = (await query(daemon.url, "agentConfig.list", {})) as {
      id: string;
      name: string;
    }[];
    const config = configs.find((candidate) => candidate.name === AGENT)!;

    const session = (await call(daemon.url, "session.createAgent", {
      scopeType: "worktree",
      scopeId: worktree.id,
      agentConfigId: config.id,
    })) as SessionRow;

    // Um turno de verdade: ele toca arquivo e roda comando, que é o que a
    // projeção lê. Sem isto a destilação não teria o que destilar.
    await converse(daemon.url, session.id, "arruma o frontmatter vazio");
    await call(daemon.url, "session.close", { id: session.id });

    // A destilação roda depois da saída, e sem bloquear ninguém — então o teste
    // espera pelo resultado dela, e não pela chamada.
    await expect
      .poll(
        async () =>
          ((await query(daemon.url, "memory.proposals", { status: "pending" })) as Proposal[])
            .length,
        { timeout: 45_000 },
      )
      .toBe(1);

    const [proposal] = (await query(daemon.url, "memory.proposals", {
      status: "pending",
    })) as Proposal[];
    // Escrita de ator não-humano em escopo de workspace: proposta, nunca memória.
    expect(proposal?.actor).toBe("distiller");
    expect(proposal?.name).toBe("O frontmatter deste repo");
    expect((await query(daemon.url, "memory.list", { workspaceId: workspace.id })) as {
      entries: unknown[];
    }).toMatchObject({ entries: [] });

    await call(daemon.url, "memory.approveProposal", { id: proposal!.id });

    const view = (await query(daemon.url, "memory.list", { workspaceId: workspace.id })) as {
      entries: { name: string; sourceActor: string }[];
    };
    expect(view.entries.map((entry) => entry.name)).toEqual(["O frontmatter deste repo"]);
    // A escrita é sua: quem revisou e mandou gravar foi você.
    expect(view.entries[0]?.sourceActor).toBe("human");
  } finally {
    await daemon.stop();
    rmSync(stateDir, { recursive: true, force: true });
  }
});
