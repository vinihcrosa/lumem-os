import type { AcpEvent } from "@lumem/shared";

import type { Turn } from "./conversation-model.js";

/**
 * A recusa por cota, em palavras (`028` T17).
 *
 * Fora do `conversation-model.ts` pelo mesmo motivo do `unavailable-text.ts` e do
 * `continuation-text.ts`: o fold só precisa do `case`, e a frase é o que muda.
 *
 * Um bloco próprio (`quota`), e não um `meta`: o `meta` é a sessão contando o que
 * fez, em cinza; isto é um **estado** que pede uma decisão sua — esperar, ou
 * continuar noutra conta —, e é a única linha do daemon que oferece um gesto.
 *
 * O texto do adaptador vai **inteiro** e por último — *"resets 7pm"* só existe
 * nele, e é a informação que decide se vale esperar. Montada aqui e não no
 * daemon, pela regra do núcleo da memória: o evento carrega fatos, e a tela
 * escolhe as palavras.
 */
export function quotaTurn(event: Extract<AcpEvent, { type: "quota_refused" }>, at: number): Turn {
  const who =
    event.accountLabel === null
      ? `o ${event.agent} recusou por limite de uso`
      : `a conta ${event.accountLabel} bateu no limite do ${event.agent}`;
  return { role: "agent", blocks: [{ kind: "quota", text: `${who} — ${event.message}` }], at };
}
