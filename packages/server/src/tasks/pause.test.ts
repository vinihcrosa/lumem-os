import { describe, expect, it } from "vitest";

import type { AcpRateLimit } from "@lumem/shared";

import { newId } from "@lumem/shared";

import { project, session } from "../db/schema.js";
import { createTestCaller } from "../testing/caller.js";
import { QUOTA_MAX_WAIT_MS, QUOTA_RETRIES, pausedUntil, quotaWait } from "./pause.js";
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

    expect(seal).toEqual({ kind: "paused", until: until.toISOString() });
  });

  it("sem pausa, o selo é o que sempre foi", () => {
    const since = new Date();

    expect(sealOf({ status: "review", liveTurns: [{ startedAt: since }], pausedUntil: null })).toEqual(
      { kind: "working", role: "revisor", since: since.toISOString() },
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

/**
 * A metade da T17 que esperava a recusa ter forma (Q32, medida em 2026-09-28).
 *
 * *Sem sinal de quando reabre: 3 tentativas com espera crescente, e depois
 * bloqueia; espera maior que 4 h vira bloqueio.* A recusa medida chegou com
 * `rateLimit: null` e o *"resets 7pm"* só no texto — então o caso comum é o de
 * baixo, sem sinal, e o texto não é lido.
 */
describe("quotaWait", () => {
  const NOW = new Date("2026-09-28T18:00:00Z");
  const minutes = (until: Date) => (until.getTime() - NOW.getTime()) / 60_000;

  it("sem sinal, espera e tenta de novo — cada espera maior que a anterior", () => {
    const waits = [1, 2, 3].map((refusals) => quotaWait({ refusals, reopensAt: null, now: NOW }));

    for (const wait of waits) expect(wait.kind).toBe("pause");
    const lengths = waits.map((wait) => (wait.kind === "pause" ? minutes(wait.until) : NaN));
    expect(lengths[0]).toBeGreaterThan(0);
    expect(lengths[1]).toBeGreaterThan(lengths[0]!);
    expect(lengths[2]).toBeGreaterThan(lengths[1]!);
    // Nenhuma das três é a que a Q32 já chamou de longa demais.
    expect(lengths.every((length) => length * 60_000 <= QUOTA_MAX_WAIT_MS)).toBe(true);
  });

  it("depois das três, bloqueia dizendo que tentou", () => {
    expect(QUOTA_RETRIES).toBe(3);

    const wait = quotaWait({ refusals: QUOTA_RETRIES + 1, reopensAt: null, now: NOW });

    expect(wait).toEqual({ kind: "block", why: "tentei de novo 3 vezes e ela não reabriu" });
  });

  it("com sinal de quando reabre, espera até lá", () => {
    const reopensAt = new Date(NOW.getTime() + 50 * 60_000);

    expect(quotaWait({ refusals: 1, reopensAt, now: NOW })).toEqual({ kind: "pause", until: reopensAt });
  });

  it("se reabre em mais de 4 h, não é pausa: é sua vez de decidir", () => {
    // Limite semanal, que reabre em dois dias: trocar o agente do encaixe, ou
    // deixar para depois — a Q32 põe a decisão com você.
    const reopensAt = new Date(NOW.getTime() + QUOTA_MAX_WAIT_MS + 60_000);

    expect(quotaWait({ refusals: 1, reopensAt, now: NOW })).toEqual({
      kind: "block",
      why: "ela só reabre daqui a mais de 4 h",
    });
  });

  it("um sinal que já passou não vale: a recusa desmentiu, e a espera volta a crescer", () => {
    const stale = new Date(NOW.getTime() - 60_000);

    const wait = quotaWait({ refusals: 2, reopensAt: stale, now: NOW });

    expect(wait).toEqual(quotaWait({ refusals: 2, reopensAt: null, now: NOW }));
  });

  it("com sinal ou sem, o teto de tentativas vale — um sinal errado não vira laço", () => {
    const reopensAt = new Date(NOW.getTime() + 10 * 60_000);

    expect(quotaWait({ refusals: QUOTA_RETRIES + 1, reopensAt, now: NOW }).kind).toBe("block");
  });
});
