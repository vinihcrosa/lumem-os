import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, sessionUsage, workspace, worktree } from "../db/schema.js";
import { createBudgetSource } from "./budget-source.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O lado sujo do teto (`028` Parte 3, T16).
 *
 * A decisão é pura e está coberta na [`budget.test.ts`](budget.test.ts). O que
 * este arquivo cobre é o **caminho até ela** — e ele é feito quase inteiro de
 * saídas antecipadas, cada uma devolvendo `pass`.
 *
 * É por isso que ele merece teste próprio: `pass` é *"pode gastar"*. Um erro em
 * qualquer um desses ramos não quebra nada visível — o turno roda, a tela pinta,
 * a suíte fica verde —, e o teto que alguém configurou simplesmente **nunca se
 * aplica**. Um teto que falha aberto em silêncio é pior que não ter teto, porque
 * a tela continua dizendo que ele existe.
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

/** Um workspace com um projeto, e o teto que ele quiser. */
async function scene(
  budget: Partial<{
    budgetCostPerTask: number | null;
    budgetCostPerDay: number | null;
    budgetTurnsPerSession: number | null;
  }> = {},
) {
  const { api, db } = caller();
  const space = await api.workspace.create({ name: `acme-${newId()}` });
  if (Object.keys(budget).length > 0) {
    await db.update(workspace).set(budget).where(eq(workspace.id, space.id)).run();
  }

  const projectId = newId();
  await db.insert(project).values({
    id: projectId,
    workspaceId: space.id,
    name: "acme-api",
    path: `/repos/${projectId}`,
    defaultBranch: "main",
  });

  return { api, db, workspaceId: space.id, projectId };
}

async function openSession(
  context: TestCaller,
  row: { id: string; scopeType: "project" | "worktree"; scopeId: string; taskId?: string },
) {
  await context.db.insert(session).values({
    id: row.id,
    // `shell` e não `agent` por economia de arranjo: uma sessão de agente exige
    // `agent_config_id` pelo CHECK, e esta função não lê `kind` — ela lê escopo
    // e tarefa. Inventar uma configuração de agente aqui seria arranjo que não
    // participa de nenhuma asserção.
    kind: "shell",
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    cwd: "/repos",
    command: "claude-agent-acp",
    taskId: row.taskId ?? null,
  });
}

/** Um turno gasto: uma linha de consumo é um turno, e o custo é opcional. */
async function spend(
  context: TestCaller,
  row: { sessionId: string; projectId: string; cost?: number },
) {
  await context.db.insert(sessionUsage).values({
    id: newId(),
    sessionId: row.sessionId,
    projectId: row.projectId,
    tokens: 1000,
    cost: row.cost ?? null,
    currency: row.cost === undefined ? null : "USD",
  });
}

describe("o que não tem como ser cobrado passa", () => {
  it("sessão que a tabela não conhece", async () => {
    const { db } = await scene({ budgetTurnsPerSession: 0 });

    /*
     * `0` é *bloqueia tudo* — então se este ramo lesse o workspace, esta chamada
     * seria `warn`. Ela é `pass` porque **não há de quem ler o escopo**: o
     * manager conhece a sessão do protocolo, e quem liga sessão a workspace é a
     * linha. Sem linha, não há teto a aplicar.
     */
    expect(await createBudgetSource(db)({ id: "ses-fantasma" })).toEqual({ kind: "pass" });
  });

  it("escopo que não chega a workspace nenhum", async () => {
    const { db } = await scene({ budgetTurnsPerSession: 0 });
    await openSession(context, { id: "ses-orfa", scopeType: "project", scopeId: "projeto-que-sumiu" });

    expect(await createBudgetSource(db)({ id: "ses-orfa" })).toEqual({ kind: "pass" });
  });

  it("worktree cujo projeto não existe mais", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 0 });
    await db.insert(worktree).values({
      id: "wt-1",
      projectId,
      name: "corrige-500",
      branch: "fix/500",
      path: "/wt/1",
    });
    await openSession(context, { id: "ses-wt-orfa", scopeType: "worktree", scopeId: "wt-que-sumiu" });

    expect(await createBudgetSource(db)({ id: "ses-wt-orfa" })).toEqual({ kind: "pass" });
  });

  it("workspace sem teto nenhum não paga a soma", async () => {
    const { db, projectId } = await scene();
    await openSession(context, { id: "ses-livre", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-livre", projectId, cost: 99 });

    // Três `null` é o caso comum — o §6 da PRD diz que os interruptores que
    // gastam token nascem desligados. Somar o consumo do dia inteiro para
    // concluir que não há teto seria pagar por uma pergunta já respondida.
    expect(await createBudgetSource(db)({ id: "ses-livre" })).toEqual({ kind: "pass" });
  });
});

describe("o teto chega até a decisão", () => {
  it("conta os turnos da sessão, e avisa quem conduz", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 2 });
    await openSession(context, { id: "ses-2", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-2", projectId });
    await spend(context, { sessionId: "ses-2", projectId });

    // `warn` e não `block`: sem condutor declarado, o default é `human` — quem
    // está olhando é avisado e decide (Q45).
    expect(await createBudgetSource(db)({ id: "ses-2" })).toMatchObject({
      kind: "warn",
      cap: "turns-per-session",
      limit: 2,
      spent: 2,
    });
  });

  it("o mesmo número, empurrado pela esteira, **para**", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 2 });
    await openSession(context, { id: "ses-e", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-e", projectId });
    await spend(context, { sessionId: "ses-e", projectId });

    /*
     * A Q45 em uma linha: mesmo teto, mesma leitura, verbo diferente. Sem o
     * condutor chegando até aqui, `decideBudget` nunca devolveria `block` e o
     * ramo de bloqueio do `AcpManager` seria código morto — uma esteira com teto
     * configurado gastaria acima dele indefinidamente, e `0 = bloqueia tudo`
     * viraria `0 = avisa tudo` para o único condutor que não tem quem leia o
     * aviso.
     */
    expect(await createBudgetSource(db)({ id: "ses-e", driver: "conveyor" })).toMatchObject({
      kind: "block",
      cap: "turns-per-session",
      limit: 2,
      spent: 2,
    });
  });

  it("o turno de outra sessão não conta contra esta", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 2 });
    await openSession(context, { id: "ses-a", scopeType: "project", scopeId: projectId });
    await openSession(context, { id: "ses-b", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-a", projectId });
    await spend(context, { sessionId: "ses-b", projectId });
    await spend(context, { sessionId: "ses-b", projectId });

    expect(await createBudgetSource(db)({ id: "ses-a" })).toEqual({ kind: "pass" });
  });

  it("sessão de worktree acha o workspace pelo projeto dela", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 1 });
    await db.insert(worktree).values({
      id: "wt-2",
      projectId,
      name: "corrige-500",
      branch: "fix/500",
      path: "/wt/2",
    });
    await openSession(context, { id: "ses-wt", scopeType: "worktree", scopeId: "wt-2" });
    await spend(context, { sessionId: "ses-wt", projectId });

    /*
     * O caminho polimórfico, e o único que **nenhum estrangeiro expressa**: o
     * escopo é projeto ou worktree, e a worktree só chega ao workspace pelo
     * projeto dela. Se esta leitura devolvesse `null`, toda sessão aberta de
     * dentro de um checkout — que é como o produto é usado — rodaria sem teto,
     * com a tela dizendo que ele está configurado.
     */
    expect(await createBudgetSource(db)({ id: "ses-wt" })).toMatchObject({
      kind: "warn",
      cap: "turns-per-session",
    });
  });

  it("o teto em dinheiro é cobrado contra a tarefa da sessão", async () => {
    const { api, db, workspaceId, projectId } = await scene({ budgetCostPerTask: 1 });
    const task = await api.task.create({ workspaceId, projectId, title: "o /orders devolve 500" });
    await openSession(context, {
      id: "ses-tarefa",
      scopeType: "project",
      scopeId: projectId,
      taskId: task.id,
    });
    await spend(context, { sessionId: "ses-tarefa", projectId, cost: 1.5 });

    expect(await createBudgetSource(db)({ id: "ses-tarefa" })).toMatchObject({
      kind: "warn",
      cap: "cost-per-task",
      limit: 1,
      spent: 1.5,
    });
  });

  it("sem tarefa, o teto por tarefa não tem contra o que ser cobrado", async () => {
    const { db, projectId } = await scene({ budgetCostPerTask: 1 });
    await openSession(context, { id: "ses-solta", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-solta", projectId, cost: 1.5 });

    // A sessão gastou mais que o teto, e passa: `taskId` nulo é uma conversa
    // que não pertence a tarefa nenhuma, e cobrar dela o teto *por tarefa*
    // seria cobrar de um denominador que não existe. O teto por dia é o que
    // pega este caso — e ele é outro número.
    expect(await createBudgetSource(db)({ id: "ses-solta" })).toEqual({ kind: "pass" });
  });

  it("o teto do dia soma o workspace inteiro, e não só esta sessão", async () => {
    const { db, projectId } = await scene({ budgetCostPerDay: 2 });
    await openSession(context, { id: "ses-hoje", scopeType: "project", scopeId: projectId });
    await spend(context, { sessionId: "ses-outra", projectId, cost: 1.5 });
    await spend(context, { sessionId: "ses-hoje", projectId, cost: 0.6 });

    expect(await createBudgetSource(db)({ id: "ses-hoje" })).toMatchObject({
      kind: "warn",
      cap: "cost-per-day",
      limit: 2,
      spent: 2.1,
    });
  });

  it("`0` bloqueia tudo, e é diferente de `null`", async () => {
    const { db, projectId } = await scene({ budgetTurnsPerSession: 0 });
    await openSession(context, { id: "ses-zero", scopeType: "project", scopeId: projectId });

    // Sem um único turno gasto. `0 >= 0` é a leitura inteira: quem quer parar
    // tudo por um momento tem como dizer isso sem apagar o número configurado.
    expect(await createBudgetSource(db)({ id: "ses-zero" })).toMatchObject({
      kind: "warn",
      cap: "turns-per-session",
      limit: 0,
      spent: 0,
    });
  });
});
