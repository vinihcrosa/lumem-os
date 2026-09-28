import type { AcpEvent } from "@lumem/shared";

import type { Turn } from "./conversation-model.js";

/**
 * As duas recusas do `session/prompt`, em palavras.
 *
 * Fora do `conversation-model.ts` pelo mesmo motivo do `unavailable-text.ts` e do
 * `continuation-text.ts`: o fold só precisa do `case`, e a frase é o que muda.
 * As duas fecham o turno — o adaptador não manda `turn_end` numa recusa — e as
 * duas são o Lumem falando, em turno próprio.
 *
 * - `quota_refused` (`028` T17) vira um bloco `quota`, e não um `meta`: o `meta`
 *   é a sessão contando o que fez, em cinza; isto é um **estado** que pede uma
 *   decisão sua — esperar, ou continuar noutra conta. O texto do adaptador vai
 *   **inteiro** e por último: *"resets 7pm"* só existe nele;
 * - `turn_failed` vira um bloco `failure`: não há decisão a oferecer, só o porquê.
 *
 * Montadas aqui e não no daemon, pela regra do núcleo da memória: o evento
 * carrega fatos, e a tela escolhe as palavras.
 */
export function closingTurn(
  event: Extract<AcpEvent, { type: "quota_refused" | "turn_failed" }>,
  at: number,
): Turn {
  if (event.type === "turn_failed") {
    return { role: "agent", blocks: [{ kind: "failure", text: `o turno falhou — ${event.message}` }], at };
  }
  const who =
    event.accountLabel === null
      ? `o ${event.agent} recusou por limite de uso`
      : `a conta ${event.accountLabel} bateu no limite do ${event.agent}`;
  return { role: "agent", blocks: [{ kind: "quota", text: `${who} — ${event.message}` }], at };
}
