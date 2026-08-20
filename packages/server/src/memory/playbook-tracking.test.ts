import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { ensureMemoryHome } from "./home.js";
import { createPlaybookService, type PlaybookService } from "./playbook.js";
import { trackPlaybookLoads } from "./playbook-tracking.js";

const databases: TestDb[] = [];
const managers: AcpManager[] = [];
const unhooks: (() => void)[] = [];

afterEach(async () => {
  for (const unhook of unhooks.splice(0)) unhook();
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

/**
 * Uma sessão viva contra um agente falso que carrega uma Skill.
 *
 * Pelo caminho real — `emit` dentro do turno — porque é ali que o observador
 * global roda, e um teste que chamasse `recordLoad` na mão não provaria que a
 * telemetria está **ligada**.
 */
async function world(): Promise<{ playbooks: PlaybookService; sessionId: string; run: () => Promise<void> }> {
  const stateDir = join(tempDir("lumem-tracking-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const database = openTestDb();
  databases.push(database);
  const playbooks = createPlaybookService({ db: database.db, stateDir });

  const acpManager = new AcpManager({
    spawner: () =>
      fakeAgentProcess({
        prompt: async (_text, turn) => {
          await turn.update({
            sessionUpdate: "tool_call",
            toolCallId: "tc-skill",
            title: "Skill investigar-teste-flaky",
            kind: "other",
            status: "in_progress",
          });
          return "end_turn";
        },
      }).process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  managers.push(acpManager);
  unhooks.push(trackPlaybookLoads({ acpManager, playbooks }));

  const session = await acpManager.spawn({
    command: "claude-agent-acp",
    cwd: stateDir,
    adapterVersion: "0.0.0-fake",
  });

  return {
    playbooks,
    sessionId: session.id,
    run: async () => void (await acpManager.prompt(session.id, "usa o playbook")),
  };
}

describe("trackPlaybookLoads", () => {
  it("um `tool_call` de Skill no turno conta como carregamento", async () => {
    const { playbooks, run } = await world();
    await playbooks.write({
      taskClass: "Investigar teste flaky",
      description: "o caminho que já funcionou",
      body: "rode isolado, rode junto, compare",
      scope: "workspace",
      workspaceId: "ws1",
      actor: "human",
    });

    await run();

    const [row] = playbooks.list();
    expect(row?.loads).toBe(1);
    expect(row?.lastLoadedAt).not.toBeNull();
  });

  it("sem playbook nenhum, o turno passa e nada é contado", async () => {
    const { playbooks, run } = await world();

    await run();

    expect(playbooks.list()).toHaveLength(0);
  });
});
