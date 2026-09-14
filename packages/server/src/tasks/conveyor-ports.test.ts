import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project, task } from "../db/schema.js";
import { createTaskRepository } from "../repositories/task.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

import { createConveyorPorts } from "./conveyor-ports.js";
import type { QueueEntry } from "./queue.js";

/**
 * A costura entre a esteira e o repositório (`028` Parte 7 — T50).
 *
 * **Este arquivo não existia, e é por isso que a T49 chegou à produção.** O
 * `conveyor.test.ts` injeta um `advance` falso — ele prova a *política* da
 * esteira sem tocar o banco —, então as 48 tasks da `028` fecharam com ele verde
 * enquanto **três das quatro setas eram recusadas pelo próprio daemon**.
 *
 * O custo de não ter: uma tarefa de verdade, **US$ 11,41** e 453 884 tokens, com
 * o cartão parado em `In Review` e o revisor rodando contra ele até esgotar as
 * tentativas.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

/** Um workspace com um projeto, e uma tarefa na etapa que se quer testar. */
async function scene(status: string) {
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

  const tasks = createTaskRepository(db);
  const created = await tasks.create({
    workspaceId: space.id,
    projectId,
    title: "o /orders devolve 500",
  });
  if (status !== "open") {
    // Pela mão, que é o ator sem allowlist — semear não é o que está sob teste.
    await tasks.setStatus(created.id, status as "review", { actor: "human" });
  }

  /*
   * As portas com as pontas de fora **falsas**, menos a que importa.
   *
   * `advance` é a única coisa deste arquivo, e ela só toca o banco: nada aqui
   * corta worktree, roda script ou abre processo.
   */
  const ports = createConveyorPorts({
    db,
    git: {} as never,
    scripts: {} as never,
    createWorktree: () => Promise.reject(new Error("não devia cortar worktree")),
    openAgentSession: () => Promise.reject(new Error("não devia abrir sessão")),
    prompt: () => Promise.reject(new Error("não devia mandar prompt")),
    cancel: () => Promise.resolve(),
    closeSession: () => Promise.resolve(),
    reproduce: () => Promise.reject(new Error("não devia rerodar nada")),
    liveTurns: () => [],
    prVerdictOf: () => Promise.resolve(null),
  });

  const entry = (): QueueEntry => ({
    task: { ...created, status } as never,
    role: "implementador",
  });

  const statusNow = async () =>
    (await db.select().from(task)).find((row) => row.id === created.id)?.status;

  return { ports, entry, statusNow, taskId: created.id, tasks };
}

describe("as quatro setas da esteira andam", () => {
  /*
   * As quatro, uma por uma. Três delas eram **recusadas pelo próprio daemon**
   * até a T49: a esteira escrevia com `actor: "agent"`, e o `AGENT_MAY_SET` da
   * `022` só permite `review`.
   */
  const setas: [string, string][] = [
    ["open", "in_progress"],
    ["in_progress", "review"],
    ["review", "testing"],
    ["testing", "ready_to_merge"],
  ];

  it.each(setas)("%s → %s", async (de, para) => {
    const { ports, entry, statusNow } = await scene(de);

    await ports.advance({ task: entry().task, role: "implementador" });

    expect(await statusNow()).toBe(para);
  });

  it("em `ready_to_merge` a seta não anda, e isso não é erro", async () => {
    // É sua vez, e a esteira acabou de chegar nela.
    const { ports, entry, statusNow } = await scene("ready_to_merge");

    await ports.advance({ task: entry().task, role: "implementador" });

    expect(await statusNow()).toBe("ready_to_merge");
  });
});

describe("a regra do agente não foi afrouxada", () => {
  /*
   * O conserto da T49 é a esteira **parar de se declarar agente** — e não a `022`
   * passar a deixar um agente mover o que quiser. Sem estes dois casos, o
   * conserto poderia ter sido feito do jeito errado e ninguém saberia.
   */
  it("um agente continua sem poder dizer `testing`", async () => {
    const { tasks, taskId } = await scene("review");

    await expect(
      tasks.setStatus(taskId, "testing", { actor: "agent" }),
    ).rejects.toThrow(/um agente não pode mover/);
  });

  it("um agente continua podendo dizer `review`", async () => {
    const { tasks, taskId, statusNow } = await scene("in_progress");

    await tasks.setStatus(taskId, "review", { actor: "agent" });

    expect(await statusNow()).toBe("review");
  });

  it("a esteira também não marca `done` — ela para em `ready_to_merge`", async () => {
    // O §4 é explícito: `done` é seu. A esteira ganhou quatro etapas, e não a
    // última — que é a única sem desfazer barato.
    const { tasks, taskId } = await scene("ready_to_merge");

    await expect(
      tasks.setStatus(taskId, "done", { actor: "conveyor" }),
    ).rejects.toThrow(/só você marca done/);
  });

  it("a esteira não reabre o que você fechou", async () => {
    const { tasks, taskId } = await scene("ready_to_merge");
    await tasks.setStatus(taskId, "done", { actor: "human" });

    await expect(
      tasks.setStatus(taskId, "review", { actor: "conveyor" }),
    ).rejects.toThrow(/reabrir é seu/);
  });
});
