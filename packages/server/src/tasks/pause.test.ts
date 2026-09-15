import { describe, expect, it } from "vitest";

import type { AcpRateLimit } from "@lumem/shared";

import { newId } from "@lumem/shared";

import { project, session } from "../db/schema.js";
import { createTestCaller } from "../testing/caller.js";
import { pausedUntil } from "./pause.js";
import { pausesByTask, sealOf } from "./seal.js";

/**
 * Cota não é orçamento (`028` Q32, T17).
 *
 * O que estes casos guardam é a diferença entre *a janela está cheia* e *o
 * agente parou* — que não é a mesma coisa, e o `isUsingOverage` é quem separa.
 */

const RESET = Math.floor(new Date("2026-09-13T18:00:00Z").getTime() / 1000);

const limit = (patch: Partial<AcpRateLimit>): AcpRateLimit => ({
  utilization: 0.5,
  surpassedThreshold: null,
  isUsingOverage: false,
  resetsAt: RESET,
  kind: "five_hour",
  ...patch,
});

describe("pausedUntil", () => {
  it("sem relato de cota, não há pausa", () => {
    expect(pausedUntil(null)).toBeNull();
    expect(pausedUntil(undefined)).toBeNull();
  });

  it("janela pela metade não é pausa", () => {
    expect(pausedUntil(limit({ utilization: 0.5 }))).toBeNull();
  });

  it("janela gasta e sem excedente é pausa, até o `resetsAt`", () => {
    expect(pausedUntil(limit({ utilization: 1 }))).toEqual(new Date(RESET * 1000));
  });

  it("em excedente, a janela cheia **não** é pausa", () => {
    // O agente continua respondendo. Pausar aqui seria inventar uma parada que
    // não existe — e é por isso que `isUsingOverage` entrou no contrato.
    expect(pausedUntil(limit({ utilization: 1.4, isUsingOverage: true }))).toBeNull();
  });

  it("sem `resetsAt`, não há pausa que se saiba escrever", () => {
    // `pausada até ~??:??` não é uma frase. Sem hora, o cartão fica `manual` e o
    // relógio de encalhe cobra — que é pior aviso, e um aviso honesto.
    expect(pausedUntil(limit({ utilization: 1, resetsAt: null }))).toBeNull();
  });
});

describe("a pausa vence o turno em voo", () => {
  it("uma tarefa pausada não diz que alguém está trabalhando nela", () => {
    const until = new Date(RESET * 1000);

    // A Q32: a pausa **libera a vaga**. Dizer `implementando há 12 min` de algo
    // que espera a cota reabrir é o selo mentindo sobre quem está com ela.
    const seal = sealOf({
      status: "in_progress",
      liveTurns: [{ startedAt: new Date() }],
      pausedUntil: until,
    });

    expect(seal).toEqual({ kind: "paused", until });
  });

  it("sem pausa, o selo é o que sempre foi", () => {
    const since = new Date();

    expect(sealOf({ status: "review", liveTurns: [{ startedAt: since }], pausedUntil: null })).toEqual(
      { kind: "working", role: "revisor", since },
    );
  });
});

describe("pausesByTask", () => {
  it("nenhuma cota relatada é uma leitura, não uma consulta", async () => {
    const context = createTestCaller();
    try {
      // O caso comum do produto: ninguém estourou cota. Não pode custar uma ida
      // ao banco.
      expect(pausesByTask(context.db, []).size).toBe(0);
    } finally {
      await context.cleanup();
    }
  });

  it("com duas sessões da mesma tarefa, vence a que reabre mais tarde", async () => {
    const context = createTestCaller();
    try {
      const workspace = await context.api.workspace.create({ name: "acme" });
      const projectId = newId();
      await context.db.insert(project).values({
        id: projectId,
        workspaceId: workspace.id,
        name: "api",
        path: `/repos/${projectId}`,
        defaultBranch: "main",
      });
      const task = await context.api.task.create({
        workspaceId: workspace.id,
        projectId,
        title: "x",
      });

      const ids = [newId(), newId()];
      for (const id of ids) {
        await context.db.insert(session).values({
          id,
          kind: "shell",
          scopeType: "project",
          scopeId: projectId,
          cwd: "/repos/api",
          command: "bash",
          taskId: task.id,
        });
      }

      const cedo = Math.floor(new Date("2026-09-13T18:00:00Z").getTime() / 1000);
      const tarde = Math.floor(new Date("2026-09-13T19:00:00Z").getTime() / 1000);
      const paused = pausesByTask(context.db, [
        { sessionId: ids[0]!, rateLimit: limit({ utilization: 1, resetsAt: cedo }) },
        { sessionId: ids[1]!, rateLimit: limit({ utilization: 1, resetsAt: tarde }) },
      ]);

      // Prometer a volta às 18h quando a outra só reabre às 19h faria o cartão
      // prometer uma volta que não acontece.
      expect(paused.get(task.id)).toEqual(new Date(tarde * 1000));
    } finally {
      await context.cleanup();
    }
  });
});
