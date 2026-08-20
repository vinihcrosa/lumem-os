import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { createMemoryTranscriptStore, type TranscriptStore } from "../acp/TranscriptStore.js";
import type { Db } from "../db/index.js";
import type { SessionRow } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { createSessionCapture } from "./capture.js";
import { ensureMemoryHome } from "./home.js";

const databases: TestDb[] = [];
const managers: AcpManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

const CANDIDATE = JSON.stringify({
  memories: [
    {
      type: "process",
      name: "O gate desta task",
      description: "o gate que vale é o que a task declara",
      body: "Rode o gate declarado antes de dizer que acabou.",
      evidence: "package.json:17",
    },
  ],
});

let clock = 1_700_000_000_000;
function at(event: AcpEvent): AcpTranscriptEntry {
  clock += 10;
  return { at: clock, event };
}

/** A transcrição de uma sessão que mexeu em arquivo e rodou comando. */
const DID_WORK: readonly AcpTranscriptEntry[] = [
  at({
    type: "tool_call",
    toolCallId: "tc-1",
    title: "Edit src/loader.ts",
    name: "Edit",
    kind: "edit",
    status: "ok",
    locations: [{ path: join(tmpdir(), "src/loader.ts") }],
  }),
  at({ type: "turn_end", stopReason: "end_turn" }),
];

interface World {
  capture: ReturnType<typeof createSessionCapture>;
  memory: MemoryService;
  db: Db;
  row: SessionRow;
  transcripts: TranscriptStore;
}

async function world(
  options: { enabled?: boolean; answer?: string; entries?: readonly AcpTranscriptEntry[] } = {},
): Promise<World> {
  const stateDir = join(tempDir("lumem-capture-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  const transcripts = createMemoryTranscriptStore();
  const answer = options.answer ?? CANDIDATE;
  const acpManager = new AcpManager({
    spawner: () =>
      fakeAgentProcess({
        prompt: async (_text, turn) => {
          await turn.update({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: answer },
          });
          return "end_turn";
        },
      }).process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
    transcripts,
  });
  managers.push(acpManager);

  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name: "lorebase",
    path: join(tmpdir(), "lorebase"),
    defaultBranch: "main",
  });
  const config = await createAgentConfigRepository(db).create({
    name: "claude",
    command: "claude-agent-acp",
    transport: "acp",
    adapterVersion: "0.40.0",
  });
  const row = await createSessionRepository(db).create({
    id: "ses_morta",
    kind: "agent",
    agentConfigId: config.id,
    scopeType: "project",
    scopeId: project.id,
    cwd: tmpdir(),
    command: config.command,
    transport: "acp",
    acpSessionId: "acp_1",
  });

  for (const entry of options.entries ?? DID_WORK) transcripts.append(row.id, entry);

  return {
    capture: createSessionCapture({
      db,
      stateDir,
      acpManager,
      enabled: options.enabled ?? true,
    }),
    memory: new MemoryService({ db, stateDir }),
    db,
    row,
    transcripts,
  };
}

/** Bem depois do `KILLED_EARLY_SECONDS`, para a sessão não parecer abortada. */
const LIVED = (row: SessionRow) => new Date(row.createdAt.getTime() + 120_000);

describe("createSessionCapture", () => {
  it("o candidato entra como proposta, e não como memória", async () => {
    const { capture, memory, row } = await world();

    await capture(row, LIVED(row));

    // `process` em escopo de workspace, escrito por ator não-humano: a Q27 manda
    // para a inbox, sem uma linha nova de código nesta PR.
    const [proposal] = memory.proposals({ status: "pending" });
    expect(proposal?.name).toBe("O gate desta task");
    expect(proposal?.actor).toBe("distiller");
    expect(memory.list()).toHaveLength(0);
  });

  it("desligada, não faz nada", async () => {
    const { capture, memory, row } = await world({ enabled: false });

    await capture(row, LIVED(row));

    expect(memory.proposals({ status: "pending" })).toHaveLength(0);
  });

  it("sessão retomada não redestila a conversa de ontem (Q21)", async () => {
    const { capture, memory, row, db, transcripts } = await world();
    const resumed = await createSessionRepository(db).create({
      id: "ses_hoje",
      kind: "agent",
      agentConfigId: row.agentConfigId,
      scopeType: "project",
      scopeId: row.scopeId,
      cwd: row.cwd,
      command: row.command,
      transport: "acp",
      acpSessionId: "acp_1",
      resumedFromId: row.id,
    });
    // Como o `resume` de verdade faz (D15): a conversa de ontem é copiada para
    // dentro da sessão de hoje. Sem esta linha o teste passaria pelo motivo
    // errado — projeção vazia em vez de "só a raiz destila".
    transcripts.copy(row.id, resumed.id);

    await capture(resumed, LIVED(resumed));

    // A transcrição de ontem é copiada para dentro da sessão retomada, então
    // destilar de novo devolveria os candidatos que você já recusou.
    expect(memory.proposals({ status: "pending" })).toHaveLength(0);
  });

  it("quem decide é a projeção, não o relógio: sessão curta que trabalhou destila", async () => {
    // A guarda por tempo de vida existiu por um dia e saiu: uma sessão que edita
    // um arquivo e é fechada em vinte segundos **fez** trabalho, e uma que ficou
    // aberta a tarde toda conversando não fez nenhum.
    const { capture, memory, row } = await world();

    await capture(row, new Date(row.createdAt.getTime() + 2_000));

    expect(memory.proposals({ status: "pending" })).toHaveLength(1);
  });

  it("sessão que só conversou não sobe agente nenhum", async () => {
    const { capture, memory, row } = await world({
      entries: [at({ type: "message", messageId: "m1", role: "user", text: "oi" })],
    });

    await capture(row, LIVED(row));

    expect(memory.proposals({ status: "pending" })).toHaveLength(0);
    // Mas a tentativa fica medida: "destilou e não achou" é um número (Q20).
    const [usage] = memory.usageSummary().filter((summary) => summary.kind === "distill");
    expect(usage?.events).toBe(1);
  });

  it("mede o que produziu, mesmo produzindo (Q20)", async () => {
    const { capture, memory, row } = await world();

    await capture(row, LIVED(row));

    const [usage] = memory.usageSummary().filter((summary) => summary.kind === "distill");
    expect(usage?.totalAmount).toBe(1);
  });
});
