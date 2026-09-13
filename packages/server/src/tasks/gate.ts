import type { PrVerdict } from "@lumem/shared";

import type { GateVerdict } from "./conveyor.js";

/**
 * O portão da esteira (`028` §4.1, Parte 2 — T28).
 *
 * **O que separa *terminou* de *desistiu inventando* é o CI, e não o commit.** A
 * medição de 2026-09-13 é dura sobre isso: a tarefa impossível — que pedia um
 * serviço inexistente — virou commit em **3 de 4** execuções, com o serviço
 * inventado junto. O commit separa *"escreveu alguma coisa"* de *"não escreveu
 * nada"*, e nada além disso.
 *
 * A [Q53](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * fechou a lacuna que o §4.1 deixava: como escrito, o portão dependia de checks
 * de PR, e um projeto sem CI no GitHub nunca avançaria. Então o portão tem
 * **duas metades**, e a de baixo funciona em quase todo repositório:
 *
 * 1. o **`test` do `<repo>/.lumem/project.toml`**, que a
 *    [`012`](../../../../docs/features/012-project-scripts/prd.md) já definiu e
 *    que a esteira já usa para preparar a worktree com o `setup`;
 * 2. o **check da PR**, quando há PR — pelo `gh` da sua máquina, como o
 *    [ADR de 2026-08-30](../../../../docs/adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)
 *    manda.
 *
 * E a consequência desconfortável fica escrita, porque a PRD já a escrevia: num
 * repositório **sem `test` declarado**, a esteira não tem como saber que o
 * implementador inventou. Ela avança com o commit como único fato — e o cartão
 * diz isso, que é a diferença entre uma garantia e a ausência dela.
 */

export interface GateFacts {
  /** Alguma coisa foi commitada nesta etapa. Necessário, e longe de suficiente. */
  committed: boolean;
  /**
   * O `test` do `project.toml` rodou e o código de saída dele, ou `null` quando
   * o projeto **não declara** `test`. `null` e `1` são coisas muito diferentes.
   */
  testExitCode: number | null;
  /** O projeto declara `test`. Separado do resultado porque a ausência é uma resposta. */
  hasTest: boolean;
  /** O veredito da PR, quando há PR. `null` é *não há PR*, e não *está vermelha*. */
  pr: PrVerdict | null;
}

/**
 * A decisão, e ela é **função pura**.
 *
 * Como a `decideBudget` da Parte 3, e pelo mesmo motivo: toda ramificação aqui é
 * uma frase com que alguém pode discordar, e nenhuma delas precisa de um
 * processo para ser exercitada.
 */
export function decideGate(facts: GateFacts): GateVerdict {
  /*
   * Sem commit, o trabalho não chegou ao ponto de ser julgado.
   *
   * `unfinished` e não `fail`, e a distinção não é cosmética: `fail` diz *"foi
   * feito e está errado"*, que é o que move a tarefa de volta com um parecer.
   * Um turno que morreu no meio não produziu parecer nenhum — ele produziu uma
   * tentativa gasta, e a próxima passada recomeça.
   */
  if (!facts.committed) {
    return { kind: "unfinished", reason: "o turno acabou sem commit" };
  }

  if (facts.hasTest) {
    if (facts.testExitCode === null) {
      // Declarado e não rodou: é diferente de vermelho, e tratá-los igual faria
      // um erro de execução do daemon parecer um defeito do código do projeto.
      return { kind: "unfinished", reason: "o teste do projeto não chegou a rodar" };
    }
    if (facts.testExitCode !== 0) {
      return { kind: "fail", reason: `o teste do projeto falhou (saída ${String(facts.testExitCode)})` };
    }
  }

  /*
   * A PR entra **também**, e não no lugar.
   *
   * `null` é *não há PR* — a maioria dos turnos —, e recusar por isso faria a
   * esteira exigir uma PR que ninguém pediu.
   *
   * Duas leituras seguram, e por motivos diferentes: `blocked` é **vermelho** e
   * vira parecer, e `pending` é o CI **ainda rodando**, que não é um veredito —
   * tratá-lo como falha gastaria uma tentativa contra um relógio. As outras
   * quatro passam, inclusive `draft`: uma PR em rascunho com o teste verde é
   * trabalho feito, e exigir que ela saia do rascunho seria a esteira decidindo
   * uma coisa que é sua.
   */
  if (facts.pr === "blocked") {
    return { kind: "fail", reason: "a PR está bloqueada" };
  }
  if (facts.pr === "pending") {
    return { kind: "unfinished", reason: "o CI da PR ainda está rodando" };
  }

  return { kind: "pass" };
}

/**
 * Este projeto tem portão de verdade?
 *
 * Existe para a tela poder dizer, e é a frase da Q53 virando dado: um projeto
 * sem `test` declarado e sem PR avança com o **commit** como único fato. Não é
 * defeito e não é bloqueio — é a ausência de uma garantia, e ela precisa ser
 * visível para não ser confundida com uma.
 */
export function gateStrength(facts: Pick<GateFacts, "hasTest" | "pr">): "test" | "pr" | "commit" {
  if (facts.hasTest) return "test";
  if (facts.pr !== null) return "pr";
  return "commit";
}
