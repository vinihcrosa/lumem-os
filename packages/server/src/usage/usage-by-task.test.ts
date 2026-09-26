import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, sessionUsage, task, workspace } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";

import { usageByTask } from "./query.js";

/**
 * O custo por tarefa (`022-workspace-tasks` F5, T16).
 *
 * A resposta mais barata que o modelo dá de graça: `session_usage` já tinha
 * sessão, e a sessão passou a ter tarefa. O que estes casos provam é que a soma
 * **fecha** com as sessões dela, e que tarefa sem sessão continua na lista — com
 * `null`, que é diferente de zero.
 */

const databases: TestDb[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
});

function world() {
  const database = openTestDb();
  databases.push(database);
  const db = database.db;
  const workspaceId = newId();
  const projectId = newId();
  db.insert(workspace).values({ id: workspaceId, name: "acme" }).run();
  db.insert(project)
    .values({ id: projectId, workspaceId, name: "api", path: `/repos/${projectId}`, defaultBranch: "main" })
    .run();
  return { db, workspaceId, projectId };
}

function addTask(w: ReturnType<typeof world>, title: string): string {
  const id = newId();
  w.db.insert(task).values({ id, workspaceId: w.workspaceId, projectId: w.projectId, title }).run();
  return id;
}

function addSpend(
  w: ReturnType<typeof world>,
  taskId: string | null,
  spend: { tokens: number; cost: number | null },
  /** Os `usage_update` desta sessão, com o turno de cada um. Um turno, por padrão. */
  updates: readonly number[] = [0],
): void {
  const sessionId = newId();
  w.db
    .insert(session)
    .values({
      id: sessionId,
      kind: "shell",
      scopeType: "project",
      scopeId: w.projectId,
      cwd: "/repos",
      command: "bash",
      ...(taskId === null ? {} : { taskId }),
    })
    .run();
  for (const [index, turn] of updates.entries()) {
    w.db
      .insert(sessionUsage)
      .values({
        id: newId(),
        sessionId,
        projectId: w.projectId,
        worktreeId: "",
        turn,
        // O consumo vai inteiro na primeira: o que estes casos medem é a
        // **contagem de turnos**, e dividir o número por linha só tornaria as
        // somas mais difíceis de ler sem provar nada a mais.
        tokens: index === 0 ? spend.tokens : 0,
        ...(spend.cost === null || index !== 0 ? {} : { cost: spend.cost }),
      })
      .run();
  }
}

describe("usageByTask", () => {
  it("a soma da tarefa fecha com as sessões dela", () => {
    const w = world();
    const mine = addTask(w, "consertar o /orders");
    addSpend(w, mine, { tokens: 1_000, cost: 0.31 });
    addSpend(w, mine, { tokens: 500, cost: 0.22 });
    // De outra tarefa: não pode entrar na conta.
    addSpend(w, addTask(w, "outra"), { tokens: 9_000, cost: 9 });
    // E de sessão sem tarefa nenhuma — o caso mais comum do produto.
    addSpend(w, null, { tokens: 7_000, cost: 7 });

    const rows = usageByTask(w.db, { workspaceId: w.workspaceId, period: "7d" });

    const row = rows.find((candidate) => candidate.taskId === mine);
    expect(row).toMatchObject({ tokens: 1_500, turns: 2 });
    expect(row?.cost).toBeCloseTo(0.53, 5);
  });

  it("os vários `usage_update` de um turno são **um** turno", () => {
    /*
     * O adaptador do Claude manda dezenas de `usage_update` dentro do mesmo
     * turno — 97 num só, medido na `LUM-51` —, e a conta era `count(id)`. Isso
     * ia para a tela como *"quantos turnos entraram na conta"* e alimentava o
     * teto de `turnsPerSession`, que parava a esteira dentro do primeiro turno.
     */
    const w = world();
    const mine = addTask(w, "um turno, muitos relatos");
    addSpend(w, mine, { tokens: 1_000, cost: 0.3 }, [0, 0, 0, 0]);

    const [row] = usageByTask(w.db, { workspaceId: w.workspaceId, period: "7d" }).filter(
      (candidate) => candidate.taskId === mine,
    );

    expect(row).toMatchObject({ tokens: 1_000, turns: 1 });
  });

  it("dois turnos da mesma sessão são dois, e não um", () => {
    const w = world();
    const mine = addTask(w, "duas voltas");
    addSpend(w, mine, { tokens: 1_000, cost: 0.3 }, [0, 0, 1]);

    const [row] = usageByTask(w.db, { workspaceId: w.workspaceId, period: "7d" }).filter(
      (candidate) => candidate.taskId === mine,
    );

    expect(row?.turns).toBe(2);
  });

  it("tarefa que ninguém começou continua na lista, com null", () => {
    // Sumir dali faria a lista esconder exatamente o que está esperando alguém.
    // E `null` é diferente de zero: ninguém reportou custo.
    const w = world();
    const idle = addTask(w, "esperando");

    const rows = usageByTask(w.db, { workspaceId: w.workspaceId, period: "7d" });

    expect(rows.find((row) => row.taskId === idle)).toMatchObject({
      tokens: 0,
      cost: null,
      turns: 0,
    });
  });

  it("a shell conta como trabalho, mesmo sem custar token", () => {
    // Se você subiu a aplicação para conferir o que o agente fez, aquilo foi
    // trabalho desta tarefa.
    const w = world();
    const mine = addTask(w, "conferida na mão");
    addSpend(w, mine, { tokens: 0, cost: null });

    const rows = usageByTask(w.db, { workspaceId: w.workspaceId, period: "7d" });

    expect(rows.find((row) => row.taskId === mine)).toMatchObject({ tokens: 0, turns: 1 });
  });
});
