import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, task } from "../db/schema.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O router de tarefas (`022-workspace-tasks` T5).
 *
 * A ordem da lista é testada com os quatro estados misturados de propósito: ela
 * é uma decisão de produto — `review` e `in_progress` primeiro, porque são o que
 * está acontecendo e o que espera você — e uma decisão de produto que não tem
 * teste volta a ser opinião na primeira refatoração.
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

/**
 * O projeto entra por `insert` e não por `project.add`.
 *
 * `add` resolve a branch default lendo o disco, e isto aqui não é um teste de
 * git: um repositório de mentira no `tmp` faria cada caso pagar um `git init`
 * para provar uma regra que nunca toca em arquivo.
 */
async function workspaceWithProject(context: TestCaller, name = "acme") {
  const workspace = await context.api.workspace.create({ name });
  const projectId = newId();
  await context.db.insert(project).values({
    id: projectId,
    workspaceId: workspace.id,
    name: `api-${projectId.slice(0, 6)}`,
    path: `/repos/${projectId}`,
    defaultBranch: "main",
  });
  return { workspaceId: workspace.id, projectId };
}

describe("task.create", () => {
  it("nasce aberta, e criada por você", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    const created = await api.task.create({
      workspaceId,
      projectId,
      title: "o endpoint /orders devolve 500",
    });

    expect(created).toMatchObject({ status: "open", createdBy: "human", createdBySession: null });
    expect(created.links).toBe("[]");
  });

  it("recusa um projeto de outro workspace", async () => {
    const { api } = caller();
    const mine = await workspaceWithProject(context, "acme");
    const other = await api.workspace.create({ name: "pessoal" });

    // Nenhum estrangeiro expressa "a coluna A e a coluna B concordam", então a
    // regra é do repositório — e sem ela a tarefa sumiria da lista dos dois.
    const failure = api.task.create({
      workspaceId: other.id,
      projectId: mine.projectId,
      title: "algo",
    });

    await expect(failure).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(failure).rejects.toThrow(/não é deste workspace/);
  });

  it.each(["", "   "])("recusa o título vazio %j", async (title) => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    await expect(api.task.create({ workspaceId, projectId, title })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("task.listByWorkspace", () => {
  it("põe o que espera você e o que está andando na frente", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    const titles = ["aberta", "em revisão", "andando", "fechada"] as const;
    const created = [];
    for (const title of titles) {
      created.push(await api.task.create({ workspaceId, projectId, title }));
    }
    // `in_progress` é derivado do primeiro prompt (T6), então aqui ele é
    // escrito direto — o que está em teste é a ordem, não quem move a seta.
    await db
      .update(task)
      .set({ status: "in_progress" })
      .where(eq(task.id, created[2]!.id));
    await api.task.setStatus({ id: created[1]!.id, status: "review" });
    await api.task.setStatus({ id: created[3]!.id, status: "done" });

    const list = await api.task.listByWorkspace({ workspaceId });

    expect(list.map((row) => row.title)).toEqual(["em revisão", "andando", "aberta", "fechada"]);
  });

  it("filtra por projeto sem mexer na ordem", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    await api.task.create({ workspaceId, projectId, title: "uma" });
    await api.task.create({ workspaceId, projectId, title: "outra" });

    expect(await api.task.listByWorkspace({ workspaceId, projectId })).toHaveLength(2);
    expect(
      await api.task.listByWorkspace({ workspaceId, projectId: "projeto-que-nao-existe" }),
    ).toHaveLength(0);
  });
});

describe("task.setStatus", () => {
  it("descartar sem motivo é recusado", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "sem alvo" });

    // Sem motivo, `dropped` é indistinguível de esquecimento.
    await expect(api.task.setStatus({ id: created.id, status: "dropped" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    const dropped = await api.task.setStatus({
      id: created.id,
      status: "dropped",
      reason: "sem critério de aceite",
    });
    expect(dropped).toMatchObject({ status: "dropped", reason: "sem critério de aceite" });
    expect(dropped.closedAt).not.toBeNull();
  });

  it("reabrir apaga a data de fechamento", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "voltou" });
    await api.task.setStatus({ id: created.id, status: "done" });

    const reopened = await api.task.setStatus({ id: created.id, status: "open" });

    // O CHECK do banco recusa `open` com data — o que este teste prova é que o
    // repositório limpa em vez de deixar o banco explodir na cara de alguém.
    expect(reopened.closedAt).toBeNull();
  });

  it("recusa um estado que não existe", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    await expect(
      // @ts-expect-error — o enum do zod é justamente o que está em teste
      api.task.setStatus({ id: created.id, status: "quase" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("task.remove", () => {
  it("apaga tarefa sem sessão", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "engano" });

    await api.task.remove({ id: created.id });

    expect(await api.task.listByWorkspace({ workspaceId })).toHaveLength(0);
  });

  it("recusa apagar tarefa que já teve sessão, e manda descartar", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "trabalhada" });
    await db.insert(session).values({
      id: "se-1",
      kind: "shell",
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos",
      command: "bash",
      taskId: created.id,
    });

    const failure = api.task.remove({ id: created.id });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/descarte-a em vez de apagar/);
  });

  it("recusa uma tarefa que não existe", async () => {
    const { api } = caller();

    await expect(api.task.remove({ id: "nada" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
