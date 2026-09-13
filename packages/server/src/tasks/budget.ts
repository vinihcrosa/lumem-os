import type { BudgetSpend } from "../usage/query.js";

/**
 * O que o daemon faz quando o teto do workspace estourou (`028` §6, Parte 3 — T16).
 *
 * Pura, e separada do `AcpManager`, pelo mesmo motivo que a
 * `permission-policy.ts` é: a parte interessante é uma **decisão** e o manager é
 * uma pilha de I/O. Toda ramificação aqui é uma frase com que alguém pode
 * discordar, e nenhuma delas precisa de um processo para ser exercitada.
 *
 * **Três saídas, e não duas** ([Q45](../../../../docs/features/028-autonomous-orchestration/open-questions.md)):
 * o número é o mesmo e a leitura é a mesma; o que muda é o verbo.
 *
 * - **quem conduz é avisado, e decide.** Interromper alguém que está olhando por
 *   um número que ela configurou há um mês é como um teto vira desligado e nunca
 *   mais ligado. É a mesma postura do [`session-mode`](../../../../docs/features/016-session-mode/prd.md),
 *   que **nunca nega sozinho**;
 * - **a esteira para**, com o número, sem reduzir nem continuar. Aí ninguém está
 *   olhando, e é exatamente o vazamento que o princípio 1 da PRD nomeia.
 */

/** `NULL` é **sem teto**; `0` é **bloqueia tudo**. São coisas diferentes. */
export interface WorkspaceBudget {
  costPerTask: number | null;
  costPerDay: number | null;
  turnsPerSession: number | null;
}

/**
 * Quem está conduzindo este turno.
 *
 * O ramo `esteira` nasce **sem chamador** — ela é a Parte 2 —, e isso é
 * aceitável aqui e não seria em CSS: uma função pura com os dois ramos cobertos
 * é um contrato escrito, e uma classe para marcação que não existe é lixo
 * esperando divergir. Quando a Parte 2 chegar, ela passa `"conveyor"` e nada
 * mais muda.
 */
export type Driver = "human" | "conveyor";

/** Qual teto segurou. O bloqueio **nomeia** o teto, senão mexer nele é adivinhação. */
export type BudgetCap = "cost-per-task" | "cost-per-day" | "turns-per-session";

export type BudgetDecision =
  | { kind: "pass" }
  | { kind: "warn"; cap: BudgetCap; limit: number; spent: number; message: string }
  | { kind: "block"; cap: BudgetCap; limit: number; spent: number; message: string };

const LABEL: Record<BudgetCap, (limit: number) => string> = {
  "cost-per-task": (limit) => `US$ ${limit.toFixed(2)} por tarefa`,
  "cost-per-day": (limit) => `US$ ${limit.toFixed(2)} por dia`,
  "turns-per-session": (limit) => `${String(limit)} turnos por sessão`,
};

/**
 * O primeiro teto que estourou, na ordem em que eles apertam.
 *
 * Ordem, e não "todos": o cartão bloqueado tem **151px medidos** e cabe uma
 * frase. Dizer *"parou em três tetos"* obrigaria a pessoa a mexer em três
 * números sem saber qual deles era o que segurava.
 */
function exceeded(budget: WorkspaceBudget, spend: BudgetSpend): {
  cap: BudgetCap;
  limit: number;
  spent: number;
} | null {
  const checks: { cap: BudgetCap; limit: number | null; spent: number | null }[] = [
    { cap: "turns-per-session", limit: budget.turnsPerSession, spent: spend.sessionTurns },
    { cap: "cost-per-task", limit: budget.costPerTask, spent: spend.taskCost },
    { cap: "cost-per-day", limit: budget.costPerDay, spent: spend.dayCost },
  ];

  for (const check of checks) {
    // `null` no teto é **sem teto**; `null` no gasto é um agente que não relata
    // dinheiro — e um teto em dólar contra ele não tem como ser cobrado. Os dois
    // casos passam, e a tela é quem diz que aquele teto está inerte (Q44).
    if (check.limit === null || check.spent === null) continue;
    if (check.spent >= check.limit) {
      return { cap: check.cap, limit: check.limit, spent: check.spent };
    }
  }
  return null;
}

export function decideBudget(
  budget: WorkspaceBudget,
  spend: BudgetSpend,
  driver: Driver,
): BudgetDecision {
  const hit = exceeded(budget, spend);
  if (hit === null) return { kind: "pass" };

  const where = LABEL[hit.cap](hit.limit);
  return driver === "conveyor"
    ? {
        kind: "block",
        ...hit,
        message: `parou no teto do workspace — ${where}`,
      }
    : {
        kind: "warn",
        ...hit,
        message: `passou do teto do workspace — ${where}`,
      };
}
