import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, task, taskComment } from "../db/schema.js";
import { createTaskCommentRepository } from "./task-comment.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O que foi dito sobre uma tarefa (`028` Parte 2, T21).
 *
 * A entidade é nova, e o que ela carrega de regra é **proveniência**: a
 * [Q50](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * tirou o comentário do portão da inbox, e o que sobrou da regra da `022` foi
 * *quem escreveu vem junto*. É isso que este arquivo cobra.
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

async function scene() {
  const { api, db } = caller();
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
  const sessionId = `ses-${newId()}`;
  await db.insert(session).values({
    id: sessionId,
    kind: "shell",
    scopeType: "project",
    scopeId: projectId,
    cwd: "/repos",
    command: "bash",
    taskId: created.id,
  });
  return { db, taskId: created.id, sessionId, comments: createTaskCommentRepository(db) };
}

describe("quem escreveu vem junto", () => {
  it("comentário de pessoa não carrega sessão, mesmo quando quem chamou está numa", async () => {
    const { comments, taskId, sessionId } = await scene();

    const row = await comments.create({ taskId, body: "o cupom acumula com frete grátis", sessionId });

    /*
     * O `sessionId` é **descartado**, e não recusado: quem chama pode estar
     * dentro de uma sessão e ainda assim estar escrevendo como você. O que não
     * pode ser possível construir é a linha com `human` e sessão preenchida,
     * que é a mentira que o `CHECK` recusa.
     */
    expect(row).toMatchObject({ createdBy: "human", createdBySession: null });
  });

  it("comentário de agente sem sessão é recusado, e a mensagem diz o que falta", async () => {
    const { comments, taskId } = await scene();

    await expect(comments.create({ taskId, body: "implementei", actor: "agent" })).rejects.toThrow(
      /precisa da sessão/,
    );
  });

  it("comentário de agente guarda a sessão que o escreveu", async () => {
    const { comments, taskId, sessionId } = await scene();

    const row = await comments.create({
      taskId,
      body: "commitei em 3 arquivos; o teste do carrinho vazio passa",
      actor: "agent",
      sessionId,
    });

    expect(row).toMatchObject({ createdBy: "agent", createdBySession: sessionId });
  });
});

describe("o que o banco garante, e o que este arquivo garante", () => {
  it("apagar a sessão não é recusado, e o comentário guarda o id órfão", async () => {
    const { comments, db, taskId, sessionId } = await scene();
    await comments.create({ taskId, body: "implementei", actor: "agent", sessionId });

    await db.delete(session).where(eq(session.id, sessionId));

    /*
     * **Este teste achou um defeito de desenho, e por isso a coluna não tem
     * estrangeiro.** Com `references(session, onDelete: "set null")`, a ação do
     * estrangeiro é um `UPDATE` — e `created_by = 'agent'` com sessão nula
     * viola o `CHECK` de proveniência. As duas restrições se contradizem, e o
     * resultado era o pior dos dois mundos: apagar a sessão ficava
     * **impossível** depois que um agente comentou.
     *
     * `RESTRICT` é a mesma prisão dita em voz alta, e a `022` já a recusou para
     * `task.created_by_session`. Então o id fica solto: um id órfão ainda diz
     * mais que uma coluna nula, e a proveniência continua obrigatória na
     * escrita, que é onde ela importa.
     */
    const [row] = await comments.listByTask(taskId);
    expect(row).toMatchObject({
      body: "implementei",
      createdBy: "agent",
      createdBySession: sessionId,
    });
  });

  it("apagar a tarefa leva os comentários junto", async () => {
    const { comments, db, taskId } = await scene();
    await comments.create({ taskId, body: "uma nota" });

    // `cascade`, e é a única relação desta tabela que o é: um comentário sem
    // tarefa é uma frase sem assunto, que não aparece em lugar nenhum.
    await db.delete(session).where(eq(session.taskId, taskId));
    await db.delete(task).where(eq(task.id, taskId));

    expect(await db.select().from(taskComment).all()).toEqual([]);
  });

  it("tarefa que não existe é NOT_FOUND, e não um erro de estrangeiro", async () => {
    const { comments } = await scene();

    await expect(comments.create({ taskId: "nao-existe", body: "oi" })).rejects.toThrow(
      /tarefa nao-existe não existe/,
    );
  });

  it("comentário em branco é recusado — o banco aceitaria", async () => {
    const { comments, taskId } = await scene();

    // `NOT NULL` aceita `''`, e uma linha vazia na tarefa é indistinguível de
    // um erro de envio para quem lê.
    await expect(comments.create({ taskId, body: "   \n " })).rejects.toThrow(/está vazio/);
  });
});

describe("a leitura", () => {
  it("devolve em ordem de escrita", async () => {
    const { comments, taskId, sessionId } = await scene();
    await comments.create({ taskId, body: "primeiro" });
    await comments.create({ taskId, body: "segundo", actor: "agent", sessionId });
    await comments.create({ taskId, body: "terceiro" });

    expect((await comments.listByTask(taskId)).map((row) => row.body)).toEqual([
      "primeiro",
      "segundo",
      "terceiro",
    ]);
  });

  it("empate de milissegundo não embaralha — o desempate é a ordem de inserção", async () => {
    const { comments, db, taskId } = await scene();
    /*
     * O empate é **forçado**, e não torcido para acontecer.
     *
     * A primeira versão deste teste escrevia os três pela porta normal e
     * conferia que os `created_at` tinham saído iguais. Passou sozinho e
     * **falhou na suíte inteira**, onde a máquina está carregada e os três
     * levaram 2ms — ou seja, ele estava afirmando a velocidade do computador,
     * não o comportamento da consulta. Com o carimbo escrito à mão o empate é
     * certo, e o que fica sob teste é só o desempate por `rowid`.
     */
    const at = new Date("2026-09-13T12:00:00.000Z");
    for (const body of ["primeiro", "segundo", "terceiro"]) {
      await db
        .insert(taskComment)
        .values({ id: newId(), taskId, body, createdAt: at, updatedAt: at });
    }

    expect((await comments.listByTask(taskId)).map((row) => row.body)).toEqual([
      "primeiro",
      "segundo",
      "terceiro",
    ]);
  });

  it("não mistura tarefas", async () => {
    const { comments, db, taskId } = await scene();
    const other = await scene();
    await comments.create({ taskId, body: "desta" });
    await other.comments.create({ taskId: other.taskId, body: "da outra" });

    expect((await comments.listByTask(taskId)).map((row) => row.body)).toEqual(["desta"]);
    void db;
  });
});
