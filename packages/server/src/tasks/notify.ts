import type { Seal } from "@lumem/shared";

import type { BoardStatus } from "./board.js";

/**
 * O que merece aviso (`028` §6, Parte 4 — T35 · Q55).
 *
 * **Duas transições, e as duas têm a mesma forma:** *a máquina parou e a vez é
 * sua*. Uma é boa — `ready_to_merge`, que o §4.1 criou para ser o fim da esteira
 * — e a outra é ruim — `bloqueada`, com o motivo. O que as une é o que justifica
 * interromper alguém: nenhuma delas anda sozinha.
 *
 * **O que não avisa diz tanto quanto o que avisa.** `pausada` não avisa, e o
 * UC6 é explícito sobre o porquê: ela *"retoma sozinha e **não te notifica**,
 * porque não precisa de você"*. `aguardando <papel>` também não: a máquina está
 * vindo. E `implementando há 12 min` menos ainda — avisar que o trabalho começou
 * é o aviso que ensina a ignorar avisos.
 *
 * Função pura, e é o arquivo inteiro: quem guarda o *"já avisei"* é a coluna
 * `notified_at`, e quem notifica é a aba.
 */

export interface NoticeFacts {
  status: BoardStatus;
  seal: Seal;
  /** `null` quando você ainda não foi avisado sobre o estado atual. */
  notifiedAt: Date | null;
}

/** A frase, ou `null` quando não há o que avisar. */
export function noticeFor(title: string, facts: NoticeFacts): string | null {
  if (facts.notifiedAt !== null) return null;

  if (facts.seal.kind === "blocked") return `${title} parou: ${facts.seal.reason}`;
  if (facts.status === "ready_to_merge") return `${title} está pronta para mesclar`;
  return null;
}
