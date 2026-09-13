import { describe, expect, it } from "vitest";

import { decideBudget, type WorkspaceBudget } from "./budget.js";
import type { BudgetSpend } from "../usage/query.js";

/**
 * A decisão do teto (`028` Parte 3, T16).
 *
 * Função pura, então **os três ramos são exercitáveis sem um processo** — e o
 * ramo `block` não tem chamador até a Parte 2 existir. É aqui que ele fica
 * honesto: um contrato escrito com teste, e não um caminho morto.
 */

const SEM_TETO: WorkspaceBudget = {
  costPerTask: null,
  costPerDay: null,
  turnsPerSession: null,
};

const NADA_GASTO: BudgetSpend = {
  taskCost: null,
  taskTokens: 0,
  dayCost: null,
  dayTokens: 0,
  sessionTurns: 0,
};

const gasto = (patch: Partial<BudgetSpend>): BudgetSpend => ({ ...NADA_GASTO, ...patch });

describe("sem teto, nada acontece", () => {
  it("`null` nos três é o workspace de quem nunca pediu teto", () => {
    // O pior defeito desta fatia seria um teto que nasce valendo: o produto de
    // todo mundo passaria a recusar trabalho que ninguém pediu para recusar.
    expect(decideBudget(SEM_TETO, gasto({ sessionTurns: 999, taskCost: 900 }), "human")).toEqual({
      kind: "pass",
    });
    expect(decideBudget(SEM_TETO, gasto({ sessionTurns: 999 }), "conveyor")).toEqual({
      kind: "pass",
    });
  });

  it("um teto em dólar contra um agente que não relata dólar não é cobrável", () => {
    // O Codex atravessa um turno com `cost: null` — medido na fase 0 da `021`.
    const decision = decideBudget({ ...SEM_TETO, costPerTask: 1 }, gasto({ taskCost: null }), "conveyor");

    expect(decision).toEqual({ kind: "pass" });
  });

  it("gasto desconhecido não é gasto zero, e o teto zero é quem prova", () => {
    /*
     * O caso acima **não** prova o que parece: com `spent` virando `0`, ele
     * continua verde, porque `0 >= 1` é falso de qualquer jeito. Achado por
     * mutação.
     *
     * Com o teto em `0` — *bloqueia tudo* — a diferença aparece: tratar
     * desconhecido como zero faria `0 >= 0` e o turno seria bloqueado por um
     * gasto que ninguém mediu. Um agente que não relata dinheiro tem de passar
     * pelo teto em dinheiro, **qualquer que seja o número**.
     */
    const decision = decideBudget({ ...SEM_TETO, costPerDay: 0 }, gasto({ dayCost: null }), "conveyor");

    expect(decision).toEqual({ kind: "pass" });
  });
});

describe("quem conduz é avisado, quem não está olhando é parado", () => {
  const teto: WorkspaceBudget = { costPerTask: 2, costPerDay: null, turnsPerSession: null };

  it("você recebe o número e decide", () => {
    const decision = decideBudget(teto, gasto({ taskCost: 2.5 }), "human");

    expect(decision).toMatchObject({
      kind: "warn",
      cap: "cost-per-task",
      limit: 2,
      spent: 2.5,
      message: "passou do teto do workspace — US$ 2.00 por tarefa",
    });
  });

  it("a esteira para, com o mesmo número", () => {
    const decision = decideBudget(teto, gasto({ taskCost: 2.5 }), "conveyor");

    expect(decision).toMatchObject({
      kind: "block",
      cap: "cost-per-task",
      limit: 2,
      message: "parou no teto do workspace — US$ 2.00 por tarefa",
    });
  });

  it("o número e a leitura são os mesmos; o que muda é o verbo", () => {
    const spend = gasto({ taskCost: 2.5 });
    const seu = decideBudget(teto, spend, "human");
    const dela = decideBudget(teto, spend, "conveyor");

    expect({ ...seu, kind: "x", message: "" }).toEqual({ ...dela, kind: "x", message: "" });
  });
});

describe("o teto nomeia qual segurou", () => {
  it("turnos apertam antes do dinheiro, porque é o chão que todo agente tem", () => {
    const budget: WorkspaceBudget = { costPerTask: 1, costPerDay: 1, turnsPerSession: 3 };

    // Ordem, e não "todos": o cartão bloqueado tem 151px medidos e cabe uma
    // frase. Dizer "parou em três tetos" faria a pessoa mexer em três números
    // sem saber qual segurava.
    const decision = decideBudget(budget, gasto({ sessionTurns: 3, taskCost: 5, dayCost: 5 }), "conveyor");

    expect(decision).toMatchObject({ cap: "turns-per-session", limit: 3 });
  });

  it("o teto do dia é nomeado como do dia, e não como da tarefa", () => {
    const budget: WorkspaceBudget = { costPerTask: null, costPerDay: 10, turnsPerSession: null };

    const decision = decideBudget(budget, gasto({ dayCost: 12 }), "conveyor");

    expect(decision).toMatchObject({
      cap: "cost-per-day",
      message: "parou no teto do workspace — US$ 10.00 por dia",
    });
  });
});

describe("as bordas do número", () => {
  it("gastar exatamente o teto já estourou", () => {
    // `>=` e não `>`: o teto é quanto se pode gastar, e o turno seguinte gastaria
    // mais. Conferir com `>` deixa passar um turno inteiro além do limite.
    const budget: WorkspaceBudget = { ...SEM_TETO, turnsPerSession: 5 };

    expect(decideBudget(budget, gasto({ sessionTurns: 5 }), "human")).toMatchObject({ kind: "warn" });
    expect(decideBudget(budget, gasto({ sessionTurns: 4 }), "human")).toEqual({ kind: "pass" });
  });

  it("teto zero bloqueia tudo, e é diferente de sem teto", () => {
    // As duas escritas existem de propósito: quem quer parar por um momento diz
    // `0` sem apagar o número que configurou.
    const decision = decideBudget({ ...SEM_TETO, turnsPerSession: 0 }, NADA_GASTO, "conveyor");

    expect(decision).toMatchObject({ kind: "block", cap: "turns-per-session", limit: 0 });
  });
});
