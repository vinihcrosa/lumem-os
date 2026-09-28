import type { AcpRateLimit } from "@lumem/shared";

/**
 * Até quando a cota do agente está fechada, ou `null` (`028` §6, Parte 3 — T17).
 *
 * **Cota não é orçamento**, e a [Q32](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * escreve a diferença inteira: estourar cota não consome orçamento nem turno,
 * **libera a vaga**, retoma sozinha e não notifica. É espera, não falha.
 *
 * O sinal é **derivado do que o agente relata**, e não de prosa dele: a janela
 * está gasta (`utilization >= 1`) e ele **não** está em excedente. Com
 * excedente, ele continua trabalhando e pausar seria inventar uma parada que
 * não existe — foi por isso que `isUsingOverage` entrou no contrato.
 *
 * **O caminho de falha é o `quotaWait`, abaixo.** Ele esperou uma cota de
 * verdade esgotar (2026-09-28) para ter forma: o `session/prompt` recusado com
 * `data.errorKind` que a `spec` do adaptador declara — e com `rateLimit: null`,
 * o que faz *este* sinal faltar justamente no caso medido.
 */
export function pausedUntil(rateLimit: AcpRateLimit | null | undefined): Date | null {
  if (!rateLimit) return null;
  // Em excedente o agente continua respondendo: a janela estar cheia não é ele
  // ter parado.
  if (rateLimit.isUsingOverage) return null;
  if (rateLimit.utilization < 1) return null;
  // Sem `resetsAt` a janela está fechada e ninguém sabe até quando. `pausada até
  // ~??:??` não é uma frase, e um selo que não diz nada é pior que o anterior:
  // fica `manual`, e o relógio de encalhe cobra.
  if (rateLimit.resetsAt === null || rateLimit.resetsAt === undefined) return null;
  // Segundos de época, como o protocolo manda.
  return new Date(rateLimit.resetsAt * 1000);
}

/**
 * Quantas vezes a esteira tenta de novo uma cota que não diz quando reabre (Q32).
 */
export const QUOTA_RETRIES = 3;

/**
 * As esperas entre elas, crescentes: 15 min, 45 min, 2 h.
 *
 * A Q32 pede *"espera crescente"* e não diz os números; estes são escolha, com a
 * âncora escrita. As três somam 3 h — menos que as 4 h que a Q32 chamou de
 * longa demais —, e cobrem os dois casos que ela nomeia: a janela que reabre em
 * 10 min pega a primeira, e a de 3h50 pega a última. O limite semanal passa das
 * três, e é aí que o cartão para e a decisão fica com você.
 */
export const QUOTA_WAITS_MS: readonly number[] = [15 * 60_000, 45 * 60_000, 2 * 60 * 60_000];

/** Acima disso, esperar deixa de ser pausa: você quer decidir (Q32). */
export const QUOTA_MAX_WAIT_MS = 4 * 60 * 60_000;

export type QuotaWait =
  | { kind: "pause"; until: Date }
  /** A frase do porquê — quem monta o motivo do bloqueio junta a conta na frente. */
  | { kind: "block"; why: string };

/**
 * O que fazer com a recusa por cota número `refusals` (`028` T17, Q32).
 *
 * **Função pura**, como o `decideBudget` e o `sealOf`: toda ramificação aqui é
 * uma frase com que alguém pode discordar, e nenhuma precisa de processo.
 *
 * `reopensAt` é o sinal que o agente **relatou** (o `pausedUntil` do último
 * `rateLimit`), e só ele — o *"resets 7pm"* do texto do adaptador não entra,
 * porque ler prosa de outro produto é o que o ADR de 2026-09-13 proíbe. Um
 * sinal que já passou foi desmentido pela própria recusa, e não vale.
 *
 * O teto de tentativas vale **com sinal ou sem**: um `resetsAt` errado que se
 * repetisse faria a esteira esperar e ser recusada para sempre.
 */
export function quotaWait({
  refusals,
  reopensAt,
  now,
}: {
  refusals: number;
  reopensAt: Date | null;
  now: Date;
}): QuotaWait {
  if (refusals > QUOTA_RETRIES) {
    return { kind: "block", why: `tentei de novo ${String(QUOTA_RETRIES)} vezes e ela não reabriu` };
  }
  if (reopensAt !== null && reopensAt > now) {
    if (reopensAt.getTime() - now.getTime() > QUOTA_MAX_WAIT_MS) {
      return { kind: "block", why: "ela só reabre daqui a mais de 4 h" };
    }
    return { kind: "pause", until: reopensAt };
  }
  const wait = QUOTA_WAITS_MS[Math.max(0, refusals - 1)] ?? QUOTA_WAITS_MS.at(-1)!;
  return { kind: "pause", until: new Date(now.getTime() + wait) };
}
