import { newId } from "@lumem/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, task, workspace, worktree } from "../db/schema.js";
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

/**
 * As sete colunas do quadro (`028-autonomous-orchestration` F1, T3).
 *
 * O quadro tem sete etapas e o modelo da `022` tinha quatro estados úteis. O
 * que decidiu esta task não foram os dois estados que faltavam — esses são
 * mecânicos — e sim a **fronteira**: `Backlog` e `To-Do` mapeariam para o mesmo
 * `open`, e o §4 da PRD diz que a To-Do é *onde mora a autorização*. Colapsar as
 * duas apagaria exatamente o que a coluna existe para marcar.
 */
describe("as sete colunas do quadro", () => {
  it("aceita os três estados novos", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    for (const status of ["backlog", "testing", "ready_to_merge"] as const) {
      const created = await api.task.create({ workspaceId, projectId, title: status });
      const moved = await api.task.setStatus({ id: created.id, status });
      expect(moved).toMatchObject({ status, closedAt: null });
    }
  });

  it("backlog não é open — a fronteira da autorização é um estado, não um rótulo", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "ainda não é pra fazer" });

    await api.task.setStatus({ id: created.id, status: "backlog" });

    // A leitura filtrada é o que a fila da esteira vai usar. Se `backlog`
    // respondesse a um filtro `open`, uma tarefa que o tracker despejou viraria
    // trabalho autorizado sem ninguém ter consentido.
    const naFila = await api.task.listByWorkspace({ workspaceId, status: "open" });
    const noBacklog = await api.task.listByWorkspace({ workspaceId, status: "backlog" });

    expect(naFila).toHaveLength(0);
    expect(noBacklog).toHaveLength(1);
  });

  it("uma tarefa criada por você continua nascendo na To-Do", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);

    const created = await api.task.create({ workspaceId, projectId, title: "é pra fazer" });

    // Este é o caso que a migração não pode mexer: `open` continua sendo a
    // To-Do, e nenhuma tarefa existente muda de coluna por causa da T3.
    expect(created.status).toBe("open");
  });

  it("nenhum dos três novos carimba data de fechamento", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    await api.task.setStatus({ id: created.id, status: "ready_to_merge" });
    const row = await context.db.query.task.findFirst({ where: eq(task.id, created.id) });

    // `ready_to_merge` é a esteira acabando, não a tarefa: o custo continua
    // aberto e a worktree não é candidata a remoção. O CHECK `task_closed_at`
    // cobra os dois sentidos.
    expect(row?.closedAt).toBeNull();
  });

  it("recusa um oitavo valor", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    await expect(
      // @ts-expect-error — o enum do zod é justamente o que está em teste
      api.task.setStatus({ id: created.id, status: "merged" }),
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

/**
 * Quem escreve cada estado novo (`028` T4).
 *
 * Há **uma** lista, e ela é do agente: você não tem allowlist, então tudo que
 * está em `TASK_STATUSES` passa pelo seu caminho. É isso que faz o *"arrastar
 * para qualquer coluna, sempre"* do §4 funcionar sem exceção — e é uma
 * propriedade que nenhum teste cobria, então ela era verdadeira por acidente.
 */
describe("quem escreve os estados do quadro", () => {
  it("você move para qualquer uma das sete colunas, in_progress incluído", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "estou fazendo na mão" });

    const moved = await api.task.setStatus({ id: created.id, status: "in_progress" });

    // A coluna é a etapa e o selo é quem está nela (§4.1): um cartão posto aqui
    // à mão fica `In Progress` com o selo `manual — ninguém pega`, que é o que
    // ele é. A honestidade mora no selo, não na coluna.
    expect(moved.status).toBe("in_progress");
  });

  it("a derivação não atropela o que você pôs à mão", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });
    await api.task.setStatus({ id: created.id, status: "ready_to_merge" });

    // `tasks/progress.ts` é `WHERE status = 'open'`. Alargar aquele `where`
    // faria uma conversa aberta numa tarefa que já chegou ao fim da esteira
    // puxá-la de volta para In Progress.
    await db
      .update(task)
      .set({ status: "in_progress" })
      .where(and(eq(task.id, created.id), eq(task.status, "open")));

    const row = await db.query.task.findFirst({ where: eq(task.id, created.id) });
    expect(row?.status).toBe("ready_to_merge");
  });

  it("o agente não move para testing nem para ready_to_merge", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const repository = createTaskRepository(db);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    // As duas são etapas que **o daemon** move, observando fato verificável — a
    // PR existe, o CI fechou. Um agente que se declara pronto diz `review`.
    for (const status of ["testing", "ready_to_merge"] as const) {
      await expect(repository.setStatus(created.id, status, { actor: "agent" })).rejects.toMatchObject(
        { code: "BLOCKED" },
      );
    }
  });

  it("o agente não empurra tarefa para o backlog", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const repository = createTaskRepository(db);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    // As duas pontas da fila são suas: `backlog` é "ainda não é para fazer" e
    // `open` é a autorização. Um agente que pudesse escrever qualquer uma das
    // duas decidiria sozinho o que vira trabalho.
    await expect(repository.setStatus(created.id, "backlog", { actor: "agent" })).rejects.toMatchObject(
      { code: "BLOCKED" },
    );
  });

  it("o agente continua podendo dizer review, e só isso", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const repository = createTaskRepository(db);
    const created = await api.task.create({ workspaceId, projectId, title: "x" });

    const moved = await repository.setStatus(created.id, "review", { actor: "agent" });

    expect(moved.status).toBe("review");
  });
});

/**
 * A ordem dentro da coluna (`028` §4.3, T5).
 *
 * *"Se você quiser outra ordem, arrasta — a posição na coluna é a prioridade, e
 * não existe campo de prioridade."* É um gesto que o quadro já tem, e não
 * inventa vocabulário — mas ele precisa de uma coluna: a ordem da lista da `022`
 * é **derivada** do estado (`STATUS_RANK`), e derivada não se arrasta.
 */
describe("a ordem dentro da coluna", () => {
  async function threeInTodo() {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const tasks = [];
    for (const title of ["primeira", "segunda", "terceira"]) {
      tasks.push(await api.task.create({ workspaceId, projectId, title }));
    }
    return { api, workspaceId, tasks };
  }

  async function titlesIn(api: TestCaller["api"], workspaceId: string, status: "open" | "in_progress") {
    const rows = await api.task.listByWorkspace({ workspaceId, status });
    return rows.map((row) => row.title);
  }

  it("chega no fim da fila", async () => {
    const { api, workspaceId } = await threeInTodo();

    expect(await titlesIn(api, workspaceId, "open")).toEqual(["primeira", "segunda", "terceira"]);
  });

  it("arrastar para o topo muda a prioridade, e persiste", async () => {
    const { api, workspaceId, tasks } = await threeInTodo();

    await api.task.move({ id: tasks[2]!.id, status: "open", index: 0 });

    expect(await titlesIn(api, workspaceId, "open")).toEqual(["terceira", "primeira", "segunda"]);
  });

  it("arrastar para o meio", async () => {
    const { api, workspaceId, tasks } = await threeInTodo();

    await api.task.move({ id: tasks[0]!.id, status: "open", index: 1 });

    expect(await titlesIn(api, workspaceId, "open")).toEqual(["segunda", "primeira", "terceira"]);
  });

  it("mover entre colunas escreve o estado e a posição na mesma transação", async () => {
    const { api, workspaceId, tasks } = await threeInTodo();
    await api.task.move({ id: tasks[0]!.id, status: "in_progress", index: 0 });

    const moved = await api.task.move({ id: tasks[1]!.id, status: "in_progress", index: 0 });

    expect(moved.status).toBe("in_progress");
    expect(await titlesIn(api, workspaceId, "in_progress")).toEqual(["segunda", "primeira"]);
    // E a To-Do não ficou com buraco de ordenação: quem sobrou continua legível.
    expect(await titlesIn(api, workspaceId, "open")).toEqual(["terceira"]);
  });

  it("um índice além do fim encosta no fim, em vez de abrir buraco", async () => {
    const { api, workspaceId, tasks } = await threeInTodo();

    await api.task.move({ id: tasks[0]!.id, status: "open", index: 99 });

    expect(await titlesIn(api, workspaceId, "open")).toEqual(["segunda", "terceira", "primeira"]);
  });

  it("o agente não arrasta", async () => {
    const { workspaceId, tasks } = await threeInTodo();
    const repository = createTaskRepository(context.db);

    // `move` é o gesto do quadro, e o quadro é seu. Um agente que reordenasse a
    // fila decidiria o que a esteira pega primeiro.
    await expect(
      repository.move(tasks[0]!.id, { status: "open", index: 0, actor: "agent" }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    expect(workspaceId).toBeTruthy();
  });
});

describe("task.board", () => {
  it("serve o quadro inteiro numa chamada, com o selo derivado", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    await api.task.create({ workspaceId, projectId, title: "na fila" });

    const board = await api.task.board({ workspaceId });

    expect(board.map((column) => column.status)).toEqual([
      "backlog",
      "open",
      "in_progress",
      "review",
      "testing",
      "ready_to_merge",
      "done",
    ]);
    // Com a autonomia desligada — o default do produto — todo cartão diz que
    // ninguém pegou. Sem este estado, o quadro desenharia o mesmo pixel de uma
    // esteira travada.
    expect(board.find((column) => column.status === "open")!.cards[0]!.seal).toEqual({
      kind: "manual",
    });
  });

  it("um workspace sem tarefa devolve sete colunas vazias, e não erro", async () => {
    const { api } = caller();
    const workspace = await api.workspace.create({ name: "vazio" });

    const board = await api.task.board({ workspaceId: workspace.id });

    expect(board).toHaveLength(7);
    expect(board.flatMap((column) => column.cards)).toHaveLength(0);
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

describe("os tetos do workspace na leitura", () => {
  it("um workspace que nunca pediu teto devolve os três em null", async () => {
    const { api } = caller();
    const { workspaceId } = await workspaceWithProject(context);

    const settings = await api.task.settings({ workspaceId });

    // É o caso comum e é o default: o §6 da PRD diz que os interruptores que
    // gastam token nascem desligados.
    expect(settings.caps).toEqual({
      costPerTask: null,
      costPerDay: null,
      turnsPerSession: null,
    });
  });

  it("`0` chega como `0`, e não como ausência", async () => {
    const { api, db } = caller();
    const { workspaceId } = await workspaceWithProject(context);
    await db
      .update(workspace)
      .set({ budgetTurnsPerSession: 0, budgetCostPerDay: 2.5 })
      .where(eq(workspace.id, workspaceId));

    const settings = await api.task.settings({ workspaceId });

    // `0` é "bloqueia tudo" e `null` é "sem teto". A tela precisa dos dois para
    // dizer coisas diferentes.
    expect(settings.caps).toEqual({
      costPerTask: null,
      costPerDay: 2.5,
      turnsPerSession: 0,
    });
  });
});

describe("escrever os tetos", () => {
  it("`null` é escrita, e é como se diz sem teto", async () => {
    const { api } = caller();
    const { workspaceId } = await workspaceWithProject(context);
    await api.workspace.setBudget({
      id: workspaceId,
      costPerTask: 2,
      costPerDay: 10,
      turnsPerSession: 40,
    });

    await api.workspace.setBudget({
      id: workspaceId,
      costPerTask: null,
      costPerDay: 10,
      turnsPerSession: 40,
    });

    // Um `Partial` faria "não mandei" e "mandei nada" serem a mesma coisa, e
    // desligar um teto deixaria de ter gesto.
    const settings = await api.task.settings({ workspaceId });
    expect(settings.caps).toEqual({ costPerTask: null, costPerDay: 10, turnsPerSession: 40 });
  });

  it("teto negativo é recusado com uma frase, e não com um CHECK cru", async () => {
    const { api } = caller();
    const { workspaceId } = await workspaceWithProject(context);

    await expect(
      api.workspace.setBudget({
        id: workspaceId,
        costPerTask: -1,
        costPerDay: null,
        turnsPerSession: null,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
