import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project } from "../db/schema.js";
import { createTaskRepository } from "./task.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * As duas colunas da esteira (`028` Parte 2, T22).
 *
 * O resto da tarefa é coberto pelo `routers/task.test.ts`, que é por onde ela
 * é usada. Estas duas ainda **não têm chamador** — a esteira é a Fase 12 —, e é
 * exatamente por isso que o contrato delas precisa estar escrito com teste: o
 * [ADR](../../../../docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md) diz
 * que são as únicas coisas guardadas, então elas carregam sozinhas o que o
 * lease do Compozy carregava com seis.
 */

let context: TestCaller;

async function scene() {
  context = createTestCaller();
  const { api, db } = context;
  const space = await api.workspace.create({ name: `acme-${newId()}` });
  const projectId = newId();
  await db.insert(project).values({
    id: projectId,
    workspaceId: space.id,
    name: "acme-api",
    path: `/repos/${projectId}`,
    defaultBranch: "main",
  });
  const created = await api.task.create({
    workspaceId: space.id,
    projectId,
    title: "o /orders devolve 500",
  });
  return { api, db, tasks: createTaskRepository(db), taskId: created.id };
}

afterEach(async () => {
  await context?.cleanup();
});

describe("a tentativa conta, e só para frente", () => {
  it("nasce em zero e devolve o valor novo a cada contagem", async () => {
    const { tasks, taskId } = await scene();

    // Devolve o valor novo porque quem chama precisa dele **para decidir** se
    // ainda há tentativa. Ler de novo depois abriria a mesma janela pela porta
    // dos fundos.
    expect(await tasks.countAttempt(taskId)).toBe(1);
    expect(await tasks.countAttempt(taskId)).toBe(2);
  });

  it("conta no banco, e não lendo antes de escrever", async () => {
    const { tasks, taskId } = await scene();

    // Duas contagens ao mesmo tempo. Com `read-then-write` uma das duas se
    // perde, e o preço de perder uma tentativa é abrir uma sessão a mais —
    // que gasta.
    const results = await Promise.all([tasks.countAttempt(taskId), tasks.countAttempt(taskId)]);

    expect(results.sort()).toEqual([1, 2]);
  });

  it("tarefa que não existe é NOT_FOUND, e não um update calado", async () => {
    const { tasks } = await scene();

    // `UPDATE` sem linha não erra no SQLite: afeta zero linhas e volta calado.
    // Sem a guarda, a esteira contaria tentativa de uma tarefa apagada para
    // sempre.
    await expect(tasks.countAttempt("nao-existe")).rejects.toThrow(/não existe/);
  });
});

describe("mudar de etapa zera a tentativa, na mesma escrita", () => {
  it("`setStatus` zera", async () => {
    const { tasks, taskId } = await scene();
    await tasks.countAttempt(taskId);
    await tasks.countAttempt(taskId);

    const row = await tasks.setStatus(taskId, "in_progress");

    // Mudar de etapa **é** a conclusão bem-sucedida daquela etapa. Falhar
    // revisando não é o mesmo defeito que falhar implementando, e cada etapa
    // tem o seu orçamento.
    expect(row.attempts).toBe(0);
  });

  it("`move` para outra coluna zera", async () => {
    const { tasks, taskId } = await scene();
    await tasks.countAttempt(taskId);

    const row = await tasks.move(taskId, { status: "in_progress", index: 0 });

    expect(row.attempts).toBe(0);
  });

  it("reordenar dentro da mesma coluna **não** zera", async () => {
    const { tasks, taskId } = await scene();
    await tasks.countAttempt(taskId);
    await tasks.countAttempt(taskId);

    const row = await tasks.move(taskId, { status: "open", index: 0 });

    // Subir um cartão de lugar não é uma etapa nova — é a mesma regra que o
    // relógio do encalhe já seguia, e pelo mesmo motivo.
    expect(row.attempts).toBe(2);
  });

  it("mudar para a etapa em que já está não zera", async () => {
    const { tasks, taskId } = await scene();
    await tasks.countAttempt(taskId);

    const row = await tasks.setStatus(taskId, "open");

    expect(row.attempts).toBe(1);
  });
});

describe("a autonomia da tarefa", () => {
  it("nasce herdando o workspace", async () => {
    const { tasks, taskId } = await scene();

    // `inherit` não liga nada: quem decide é o interruptor do workspace, que
    // nasce em `manual`. É o que faz a migração não mudar o comportamento de
    // ninguém.
    expect((await tasks.get(taskId))?.autonomy).toBe("inherit");
  });

  it("desligar sobrevive à mudança de etapa", async () => {
    const { tasks, taskId } = await scene();
    await tasks.setAutonomy(taskId, "off");

    const row = await tasks.setStatus(taskId, "in_progress");

    /*
     * A diferença entre as duas colunas, em uma asserção: tentativa é sobre a
     * **etapa** e zera; autonomia é sobre a **tarefa** e não. Você desligou
     * porque quer fazer aquilo na mão, e mover de coluna não desfaz a intenção
     * — se desfizesse, o gesto de assumir o volante duraria até o cartão andar.
     */
    expect(row).toMatchObject({ autonomy: "off", attempts: 0 });
  });

  it("valor fora dos dois é recusado com o nome do que veio", async () => {
    const { tasks, taskId } = await scene();

    await expect(
      tasks.setAutonomy(taskId, "on" as unknown as "off"),
    ).rejects.toThrow(/autonomia inválida: on/);
  });
});
