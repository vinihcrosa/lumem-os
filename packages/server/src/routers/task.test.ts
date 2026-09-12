import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, task, worktree } from "../db/schema.js";
import { createTaskRepository } from "../repositories/task.js";
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

describe("o agente e o que está fechado", () => {
  it("não reabre uma tarefa done, e nem uma dropped", async () => {
    /*
     * O guard de destino sozinho deixava passar: `review` é o único estado que
     * um agente escreve, e uma tarefa **já fechada** movida para `review` sai de
     * `done` e perde o `closedAt`. Um `POST /tasks/:id/review` reabriria, pelo
     * agente, o estado que a T9 reserva para você. Fechar é seu, e reabrir
     * também é.
     */
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const repository = createTaskRepository(db);

    for (const [status, reason] of [
      ["done", undefined],
      ["dropped", "sem alvo"],
    ] as const) {
      const created = await api.task.create({ workspaceId, projectId, title: `t-${status}` });
      await api.task.setStatus({
        id: created.id,
        status,
        ...(reason === undefined ? {} : { reason }),
      });

      await expect(
        repository.setStatus(created.id, "review", { actor: "agent" }),
      ).rejects.toThrow(/reabrir é seu/);

      const [row] = await db.select().from(task).where(eq(task.id, created.id));
      expect(row?.status).toBe(status);
      // E a data de fechamento continua lá: era ela que o caminho antigo zerava.
      expect(row?.closedAt).not.toBeNull();
    }
  });

  it("continua podendo dizer review numa tarefa aberta", async () => {
    // A guarda nova é sobre o estado **atual**, e não pode fechar a porta certa.
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "em andamento" });

    const moved = await createTaskRepository(db).setStatus(created.id, "review", {
      actor: "agent",
    });

    expect(moved.status).toBe("review");
  });
});

describe("a medida de cerimônia", () => {
  it("conta só as sessões deste workspace", async () => {
    /*
     * A linha é renderizada dentro da lista de **um** workspace. Contar o banco
     * inteiro misturaria as sessões de todos eles, e um número que não é do
     * lugar onde está escrito é pior que nenhum: ele parece dado.
     */
    const { api, db } = caller();
    const mine = await workspaceWithProject(context, "acme");
    const other = await workspaceWithProject(context, "pessoal");
    const task1 = await api.task.create({
      workspaceId: mine.workspaceId,
      projectId: mine.projectId,
      title: "com tarefa",
    });

    await db.insert(session).values([
      {
        id: "se-minha-com",
        kind: "shell",
        scopeType: "project",
        scopeId: mine.projectId,
        cwd: "/repos",
        command: "bash",
        taskId: task1.id,
      },
      {
        id: "se-minha-sem",
        kind: "shell",
        scopeType: "project",
        scopeId: mine.projectId,
        cwd: "/repos",
        command: "bash",
      },
      // Três do outro workspace: nenhuma pode entrar na conta.
      ...["a", "b", "c"].map((suffix) => ({
        id: `se-alheia-${suffix}`,
        kind: "shell" as const,
        scopeType: "project" as const,
        scopeId: other.projectId,
        cwd: "/repos",
        command: "bash",
      })),
    ]);

    expect(await api.task.settings({ workspaceId: mine.workspaceId })).toMatchObject({
      sessions: 2,
      sessionsWithTask: 1,
    });
    expect(await api.task.settings({ workspaceId: other.workspaceId })).toMatchObject({
      sessions: 3,
      sessionsWithTask: 0,
    });
  });

  it("alcança a sessão que mora numa worktree, e não só a do projeto", async () => {
    // O escopo de uma sessão é polimórfico: `scope_id` aponta para projeto ou
    // para worktree, e nenhum estrangeiro expressa isso. São duas junções.
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    await db
      .insert(worktree)
      .values({ id: "wt1", projectId, name: "feat", branch: "feat", path: "/wt/1" });
    await db.insert(session).values({
      id: "se-na-worktree",
      kind: "shell",
      scopeType: "worktree",
      scopeId: "wt1",
      cwd: "/wt/1",
      command: "bash",
    });

    expect(await api.task.settings({ workspaceId })).toMatchObject({
      sessions: 1,
      sessionsWithTask: 0,
    });
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
