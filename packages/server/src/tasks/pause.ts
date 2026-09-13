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
 * **O que este arquivo não sabe é o caminho de falha**, e isso está anotado em
 * vez de adivinhado: quando o `session/prompt` é recusado por cota, o protocolo
 * não tem um código para isso — não existe o equivalente ao `-32000` do login. As
 * três tentativas com espera crescente e o corte de 4 h que a Q32 descreve
 * precisam da forma desse erro, e ela só aparece contra uma cota de verdade
 * esgotada.
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
