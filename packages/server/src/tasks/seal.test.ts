import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project, session } from "../db/schema.js";
import { liveTurnsByTask, sealOf } from "./seal.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O selo, derivado (`028` §4.1, T7).
 *
 * O par de casos que o §12 da PRD pede, e o único dos dois que a F1 alcança:
 * **matar a sessão faz o selo voltar na próxima leitura, sem nenhuma escrita.**
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

describe("sealOf", () => {
  it("sem turno em voo, ninguém pega — e esse é o default do produto", () => {
    expect(sealOf({ status: "in_progress", liveTurns: [] })).toEqual({ kind: "manual" });
  });

  it("o verbo vem da coluna, porque o papel já está no cabeçalho dela", () => {
    const since = new Date("2026-09-12T10:00:00Z");

    expect(sealOf({ status: "in_progress", liveTurns: [{ startedAt: since }] })).toEqual({
      kind: "working",
      role: "implementador",
      since,
    });
    expect(sealOf({ status: "review", liveTurns: [{ startedAt: since }] })).toMatchObject({
      role: "revisor",
    });
    expect(sealOf({ status: "testing", liveTurns: [{ startedAt: since }] })).toMatchObject({
      role: "testador",
    });
  });

  it("numa coluna sem papel, alguém trabalhando ainda é alguém trabalhando", () => {
    const since = new Date();

    // Você assumiu o volante num cartão em `ready_to_merge`. Inventar um quarto
    // papel para cobrir isso seria inventar um quarto encaixe, e o §6 tirou
    // isso de escopo de propósito.
    expect(sealOf({ status: "ready_to_merge", liveTurns: [{ startedAt: since }] })).toEqual({
      kind: "working",
      role: null,
      since,
    });
  });

  it("com dois turnos, o relógio conta do mais antigo", () => {
    const older = new Date("2026-09-12T10:00:00Z");
    const newer = new Date("2026-09-12T10:09:00Z");

    const seal = sealOf({ status: "review", liveTurns: [{ startedAt: newer }, { startedAt: older }] });

    // Contar do mais recente faria o relógio andar para trás toda vez que uma
    // segunda sessão começasse — e o cartão pergunta há quanto tempo alguém
    // está nisto, não há quanto tempo o último chegou.
    expect(seal).toMatchObject({ since: older });
  });
});

describe("os dois estados que a esteira acrescenta", () => {
  it("com a esteira ligada, uma etapa com papel diz que a máquina vem", () => {
    /*
     * A diferença é a feature inteira: `aguardando revisor` diz *"a máquina
     * vem"* e `manual — ninguém pega` diz *"não vem"*. Sem ela, um quadro com a
     * autonomia ligada desenharia o mesmo pixel de um com ela desligada — que é
     * o defeito que o §10.2 nomeou ao inventar o `manual`.
     */
    expect(sealOf({ status: "review", liveTurns: [], autonomyOn: true })).toEqual({
      kind: "waiting",
      role: "revisor",
    });
  });

  it("uma coluna sem papel continua `manual`, mesmo com a esteira ligada", () => {
    // `ready_to_merge` é sua vez, e nenhum encaixe vem buscá-la — dizer
    // `aguardando` ali seria prometer uma máquina que não existe.
    expect(sealOf({ status: "ready_to_merge", liveTurns: [], autonomyOn: true })).toEqual({
      kind: "manual",
    });
  });

  it("com a esteira desligada continua `manual`, que é o default do produto", () => {
    expect(sealOf({ status: "review", liveTurns: [], autonomyOn: false })).toEqual({
      kind: "manual",
    });
  });

  it("o bloqueio ganha de tudo, inclusive da cota", () => {
    const seal = sealOf({
      status: "in_progress",
      liveTurns: [],
      pausedUntil: new Date("2026-09-13T04:20:00Z"),
      blockedReason: "o teste do projeto falhou",
      autonomyOn: true,
    });

    /*
     * Os dois dizem *"parou"*, e a diferença é quem retoma: a cota volta sozinha
     * e o bloqueio espera você. Um cartão bloqueado pintando `pausada até
     * ~04:20` prometeria uma retomada que não vem — e o relógio da pausa existe
     * justamente para dizer que não é preciso fazer nada.
     */
    expect(seal).toEqual({ kind: "blocked", reason: "o teste do projeto falhou" });
  });

  it("motivo em branco não é bloqueio", () => {
    // `''` é o que um `UPDATE` desastrado escreve, e um selo vermelho sem frase
    // é pior que nenhum: ele para o cartão sem dizer o que fazer.
    expect(sealOf({ status: "review", liveTurns: [], blockedReason: "", autonomyOn: true })).toEqual(
      { kind: "waiting", role: "revisor" },
    );
  });

  it("um turno em voo ainda vence o `aguardando`", () => {
    const since = new Date("2026-09-13T04:00:00Z");

    // A ordem importa: quem já está lá é mais informativo que quem viria.
    expect(
      sealOf({ status: "review", liveTurns: [{ startedAt: since }], autonomyOn: true }),
    ).toMatchObject({ kind: "working", role: "revisor" });
  });
});

describe("liveTurnsByTask", () => {
  async function taskWithSession(kind = "shell") {
    const { api, db } = caller();
    const workspace = await api.workspace.create({ name: "acme" });
    const projectId = newId();
    await db.insert(project).values({
      id: projectId,
      workspaceId: workspace.id,
      name: "api",
      path: `/repos/${projectId}`,
      defaultBranch: "main",
    });
    const created = await api.task.create({
      workspaceId: workspace.id,
      projectId,
      title: "x",
    });
    const sessionId = newId();
    await db.insert(session).values({
      id: sessionId,
      kind,
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos/api",
      command: "bash",
      taskId: created.id,
    });
    return { db, taskId: created.id, sessionId, projectId, workspaceId: workspace.id };
  }

  it("liga o turno em voo à tarefa da sessão", async () => {
    const { db, taskId, sessionId } = await taskWithSession();
    const startedAt = new Date();

    const byTask = liveTurnsByTask(db, [{ sessionId, startedAt }]);

    expect(byTask.get(taskId)).toEqual([{ startedAt }]);
  });

  it("sessão sem tarefa não pinta selo em cartão nenhum", async () => {
    const { db, projectId } = await taskWithSession();
    const loose = newId();
    await db.insert(session).values({
      id: loose,
      kind: "shell",
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos/api",
      command: "bash",
    });

    const byTask = liveTurnsByTask(db, [{ sessionId: loose, startedAt: new Date() }]);

    expect(byTask.size).toBe(0);
  });

  it("nenhum turno em voo é uma leitura, não uma consulta", async () => {
    const { db } = await taskWithSession();

    // O caso comum do produto: o quadro abre e ninguém está trabalhando. Ele
    // não pode custar uma ida ao banco.
    expect(liveTurnsByTask(db, []).size).toBe(0);
  });

  it("a sessão morrendo apaga o selo, e nada foi escrito", async () => {
    const { db, taskId, sessionId } = await taskWithSession();
    const startedAt = new Date();

    const working = sealOf({
      status: "in_progress",
      liveTurns: liveTurnsByTask(db, [{ sessionId, startedAt }]).get(taskId) ?? [],
    });
    expect(working).toMatchObject({ kind: "working" });

    // O turno acabou — o `AcpManager` para de listá-lo. Nenhuma escrita, em
    // lugar nenhum: é a leitura seguinte que devolve outra resposta, e é isso
    // que faz o selo não poder divergir da realidade.
    const after = sealOf({
      status: "in_progress",
      liveTurns: liveTurnsByTask(db, []).get(taskId) ?? [],
    });

    expect(after).toEqual({ kind: "manual" });
  });
});
