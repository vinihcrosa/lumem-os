import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, sessionUsage, worktree } from "../db/schema.js";
import { boardOf, BOARD_COLUMNS } from "./board.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * A leitura do quadro (`028` F1, T6).
 *
 * **Uma chamada serve o quadro inteiro.** Sete consultas — uma por coluna —
 * seriam sete viagens para pintar uma tela que existe para ser olhada por cinco
 * segundos, e nenhuma delas veria as outras seis: um cartão que mudasse de
 * coluna no meio apareceria duas vezes ou nenhuma.
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

async function workspaceWithProject(context: TestCaller, name = "acme") {
  const workspace = await context.api.workspace.create({ name });
  const projectId = newId();
  await context.db.insert(project).values({
    id: projectId,
    workspaceId: workspace.id,
    name: "acme-api",
    path: `/repos/${projectId}`,
    defaultBranch: "main",
  });
  return { workspaceId: workspace.id, projectId };
}

describe("boardOf", () => {
  it("devolve as sete colunas, em ordem, mesmo vazias", async () => {
    const { api } = caller();
    const { workspaceId } = await workspaceWithProject(context);

    const board = boardOf(context.db, { workspaceId });

    // Coluna vazia é uma resposta. Um quadro que esconde a coluna sem cartão
    // obriga a pessoa a lembrar quantas etapas existem.
    expect(board.map((column) => column.status)).toEqual([...BOARD_COLUMNS]);
    expect(board.every((column) => column.cards.length === 0)).toBe(true);
  });

  it("proposed e dropped não são coluna do quadro", async () => {
    const { api } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const droppable = await api.task.create({ workspaceId, projectId, title: "some" });
    await api.task.setStatus({ id: droppable.id, status: "dropped", reason: "mudou de ideia" });

    const board = boardOf(context.db, { workspaceId });

    // `proposed` mora na fila de Propostas da 022; `dropped` vira arquivo.
    expect(BOARD_COLUMNS).not.toContain("proposed");
    expect(BOARD_COLUMNS).not.toContain("dropped");
    expect(board.flatMap((column) => column.cards)).toHaveLength(0);
  });

  it("o cartão traz projeto e worktree sem uma segunda consulta", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const worktreeId = newId();
    await db.insert(worktree).values({
      id: worktreeId,
      projectId,
      name: "142-orders",
      branch: "fix/orders-500",
      path: "/wt/142",
    });
    const created = await api.task.create({ workspaceId, projectId, title: "o /orders devolve 500" });
    await api.task.attachWorktree({ id: created.id, worktreeId });

    const [card] = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards;

    expect(card).toMatchObject({
      title: "o /orders devolve 500",
      projectName: "acme-api",
      worktreeName: "142-orders",
      branch: "fix/orders-500",
    });
  });

  it("uma tarefa sem worktree é um cartão legítimo", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    await api.task.create({ workspaceId, projectId, title: "ainda não tem checkout" });

    const [card] = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards;

    expect(card).toMatchObject({ worktreeId: null, worktreeName: null, branch: null });
  });

  it("o custo é até aqui, e não de uma janela", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "cara" });
    const sessionId = newId();
    await db.insert(session).values({
      id: sessionId,
      kind: "shell",
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos/api",
      command: "bash",
      taskId: created.id,
    });
    // Um ano atrás: qualquer janela do `workspace-screen` cortaria isto fora, e
    // o cartão diz "custo até aqui" — uma tarefa velha não ficou mais barata.
    await db.insert(sessionUsage).values({
      id: newId(),
      sessionId,
      projectId,
      tokens: 1200,
      cost: 0.42,
      currency: "USD",
      createdAt: new Date(Date.now() - 400 * 86_400_000),
    });

    const [card] = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards;

    expect(card).toMatchObject({ tokens: 1200, cost: 0.42, currency: "USD" });
  });

  it("a ordem dentro da coluna é a que você arrastou", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const ids = [];
    for (const title of ["primeira", "segunda", "terceira"]) {
      ids.push((await api.task.create({ workspaceId, projectId, title })).id);
    }
    await api.task.move({ id: ids[2]!, status: "open", index: 0 });

    const column = boardOf(db, { workspaceId }).find((c) => c.status === "open")!;

    expect(column.cards.map((card) => card.title)).toEqual(["terceira", "primeira", "segunda"]);
  });

  it("o relógio do encalhe não zera quando você edita o título", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const created = await api.task.create({ workspaceId, projectId, title: "parada" });
    const before = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards[0]!;

    await api.task.update({ id: created.id, title: "parada, com outro nome" });
    const after = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards[0]!;

    // É o defeito que `updated_at` teria produzido: corrigir o título de uma
    // tarefa parada há duas horas a faria parecer recém-chegada, e o relógio
    // existe justamente para as que ninguém tocou.
    expect(after.statusChangedAt).toEqual(before.statusChangedAt);
  });

  it("o relógio zera ao trocar de coluna, e não ao reordenar dentro dela", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const first = await api.task.create({ workspaceId, projectId, title: "a" });
    await api.task.create({ workspaceId, projectId, title: "b" });
    const born = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards[0]!;

    await api.task.move({ id: first.id, status: "open", index: 1 });
    const reordered = boardOf(db, { workspaceId })
      .find((c) => c.status === "open")!
      .cards.find((card) => card.id === first.id)!;
    expect(reordered.statusChangedAt).toEqual(born.statusChangedAt);

    await api.task.move({ id: first.id, status: "in_progress", index: 0 });
    const moved = boardOf(db, { workspaceId }).find((c) => c.status === "in_progress")!.cards[0]!;
    expect(moved.statusChangedAt.getTime()).toBeGreaterThanOrEqual(born.statusChangedAt.getTime());
  });

  it("de onde veio é do cartão, e não do agrupamento", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    await api.task.create({
      workspaceId,
      projectId,
      title: "com link",
      links: ["https://linear.app/acme/issue/ACME-142"],
    });

    const [card] = boardOf(db, { workspaceId }).find((c) => c.status === "open")!.cards;

    // Origem é categoria, então é glifo (§10.2): `◆` agente, `↗` tracker,
    // `◈` memória. Quem escolhe o glifo é a tela; quem sabe a origem é isto.
    expect(card).toMatchObject({
      createdBy: "human",
      links: ["https://linear.app/acme/issue/ACME-142"],
    });
  });

  it("filtra por projeto sem esconder as colunas", async () => {
    const { api, db } = caller();
    const { workspaceId, projectId } = await workspaceWithProject(context);
    const otherId = newId();
    await db.insert(project).values({
      id: otherId,
      workspaceId,
      name: "acme-web",
      path: `/repos/${otherId}`,
      defaultBranch: "main",
    });
    await api.task.create({ workspaceId, projectId, title: "da api" });
    await api.task.create({ workspaceId, projectId: otherId, title: "do web" });

    const board = boardOf(db, { workspaceId, projectId: otherId });

    expect(board).toHaveLength(BOARD_COLUMNS.length);
    expect(board.flatMap((column) => column.cards).map((card) => card.title)).toEqual(["do web"]);
  });

  it("não mistura workspace", async () => {
    const { api, db } = caller();
    const mine = await workspaceWithProject(context, "acme");
    const theirs = await workspaceWithProject(context, "outro");
    await api.task.create({ workspaceId: theirs.workspaceId, projectId: theirs.projectId, title: "deles" });

    const board = boardOf(db, { workspaceId: mine.workspaceId });

    expect(board.flatMap((column) => column.cards)).toHaveLength(0);
  });
});
