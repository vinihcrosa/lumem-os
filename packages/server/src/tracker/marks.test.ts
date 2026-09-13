import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { project, task } from "../db/schema.js";
import { marksOf, moveState, writeMark } from "./marks.js";
import type { TrackerHost } from "./TrackerHost.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O que o tracker vê acontecer (`028` Parte 6, T46 e T47).
 *
 * A propriedade mais importante aqui não é *"o comentário sai"*: é que **ele não
 * sai duas vezes**. Um `notified_at` duplicado é uma notificação a mais na sua
 * tela; um marco duplicado é um comentário a mais na issue de outra pessoa, e
 * essa é a única parte disto que não tem desfazer.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

function fakeHost(overrides: Partial<TrackerHost> = {}): TrackerHost {
  return {
    id: "linear",
    secretId: "linear",
    available: () => true,
    labelled: vi.fn(async () => Promise.resolve([])),
    comment: vi.fn(async () => Promise.resolve()),
    moveState: vi.fn(async () => Promise.resolve()),
    ...overrides,
  };
}

async function scene(external = true) {
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
  if (external) {
    await db
      .update(task)
      .set({ externalSource: "linear", externalId: "iss-1" })
      .where(eq(task.id, created.id));
  }
  return { db, taskId: created.id };
}

import { eq } from "drizzle-orm";

describe("cada marco, uma vez", () => {
  it("o primeiro escreve e o segundo não", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    expect(await writeMark({ db, host }, taskId, "taken")).toBe(true);
    expect(await writeMark({ db, host }, taskId, "taken")).toBe(false);
    expect(host.comment).toHaveBeenCalledTimes(1);
  });

  it("dois ao mesmo tempo: um só comenta", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    /*
     * A reserva acontece **antes** da escrita, e é aqui que a corrida é
     * fechada: a primeira reserva e comenta, a segunda não reserva e não
     * comenta. Ler e depois escrever deixaria as duas comentarem.
     */
    const results = await Promise.all([
      writeMark({ db, host }, taskId, "ready"),
      writeMark({ db, host }, taskId, "ready"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(host.comment).toHaveBeenCalledTimes(1);
  });

  it("marcos diferentes são independentes", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    await writeMark({ db, host }, taskId, "taken");
    expect(await writeMark({ db, host }, taskId, "pr", "#87")).toBe(true);

    const row = await db.query.task.findFirst({ where: eq(task.id, taskId) });
    expect(marksOf(row!)).toEqual(["taken", "pr"]);
  });

  it("a frase carrega o contexto quando o marco tem um", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    await writeMark({ db, host }, taskId, "pr", "#87");
    await writeMark({ db, host }, taskId, "blocked", "o teste do projeto falhou");

    expect(host.comment).toHaveBeenNthCalledWith(1, "iss-1", "PR #87 aberta.");
    expect(host.comment).toHaveBeenNthCalledWith(2, "iss-1", "Travei: o teste do projeto falhou");
  });
});

describe("falhar não para nada", () => {
  it("o erro vira aviso com etiqueta, e não exceção", async () => {
    const { db, taskId } = await scene();
    const warn = vi.fn();
    const host = fakeHost({
      comment: vi.fn(() => Promise.reject(new Error("o Linear respondeu 500"))),
    });

    /*
     * É cortesia, não portão: o trabalho já aconteceu do lado de cá, e recusar
     * o avanço porque o host não respondeu seria o produto ficando refém de um
     * terceiro que o ADR do segredo decidiu tratar como opcional.
     */
    await expect(writeMark({ db, host, log: { warn } }, taskId, "taken")).resolves.toBe(false);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ tag: "tracker-mark-failed" });
  });

  it("e não tenta de novo — a reserva já foi escrita", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost({
      comment: vi.fn(() => Promise.reject(new Error("caiu"))),
    });

    await writeMark({ db, host }, taskId, "taken");
    await writeMark({ db, host }, taskId, "taken");

    /*
     * O custo de reservar antes é este: o marco fica registrado sem ter saído.
     * É o lado certo de errar — o outro é comentar duas vezes na issue de
     * alguém, e o §8 chama reenvio infinito de *"aviso que se aprende a
     * ignorar"*.
     */
    expect(host.comment).toHaveBeenCalledTimes(1);
  });
});

describe("o que não é do tracker não é comentado", () => {
  it("tarefa sem chave externa", async () => {
    const { db, taskId } = await scene(false);
    const host = fakeHost();

    expect(await writeMark({ db, host }, taskId, "taken")).toBe(false);
    expect(host.comment).not.toHaveBeenCalled();
  });

  it("host indisponível", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost({ available: () => false });

    expect(await writeMark({ db, host }, taskId, "taken")).toBe(false);
  });
});

describe("sem mapa, nada é movido (Q65)", () => {
  it("mapa ausente não move", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    /*
     * É a decisão, e não o default preguiçoso: mover estado no tracker de
     * alguém sem um mapa que essa pessoa escreveu é a definição de duas fontes
     * de verdade brigando.
     */
    expect(await moveState({ db, host }, taskId, null)).toBe(false);
    expect(host.moveState).not.toHaveBeenCalled();
  });

  it("coluna que o mapa não nomeia não move", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    // O mapa é explícito por definição: o que não está nele é o que você
    // decidiu **não** espelhar.
    expect(await moveState({ db, host }, taskId, { review: "state-review" })).toBe(false);
    expect(host.moveState).not.toHaveBeenCalled();
  });

  it("com o mapa, move para o estado que ele nomeia", async () => {
    const { db, taskId } = await scene();
    const host = fakeHost();

    expect(await moveState({ db, host }, taskId, { open: "state-todo" })).toBe(true);
    expect(host.moveState).toHaveBeenCalledWith("iss-1", "state-todo");
  });

  it("falhar ao mover também é aviso", async () => {
    const { db, taskId } = await scene();
    const warn = vi.fn();
    const host = fakeHost({ moveState: vi.fn(() => Promise.reject(new Error("caiu"))) });

    await expect(
      moveState({ db, host, log: { warn } }, taskId, { open: "state-todo" }),
    ).resolves.toBe(false);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ tag: "tracker-move-failed" });
  });
});

describe("a coluna corrompida não para a esteira", () => {
  it("JSON inválido lê como lista vazia", () => {
    // O pior que acontece é um marco repetido, contra um `throw` que pararia o
    // laço de todo mundo.
    expect(marksOf({ externalMarks: "{isto não é json" })).toEqual([]);
  });
});
