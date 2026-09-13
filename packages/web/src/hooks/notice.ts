import { useEffect, useRef } from "react";

import type { BoardColumn } from "../lib/board.js";
import { trpc } from "../lib/trpc.js";

/**
 * A notificação do quadro (`028` Parte 4, T36 · Q55).
 *
 * **A aba notifica; o daemon lembra.** A `Notification` do navegador é a única
 * superfície que este produto tem para o sistema operacional — o daemon é um
 * processo sem interface, e chamar `osascript` seria um binário por sistema
 * dentro de um produto que acabou de decidir não depender do PATH nem para
 * adaptador.
 *
 * O que impede *"uma vez"* de virar *"uma vez por aba"* é que a decisão **não**
 * é daqui: a frase vem no cartão só enquanto o daemon não registrou o aviso, e
 * esta função responde `markNotified` **depois** de mostrar. Com duas abas, a
 * segunda recebe `first: false` e some com a frase sem ter notificado.
 */

/** `Notification` não existe em jsdom nem em navegador antigo. */
function available(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Pede a permissão **quando alguém liga a autonomia**.
 *
 * É o único instante em que o pedido tem uma frase honesta para mostrar: até
 * então, nada no produto acontece sem você. Pedir no primeiro acesso seria o
 * pedido que se aprende a negar por reflexo.
 */
export async function askNoticePermission(): Promise<void> {
  if (!available()) return;
  if (Notification.permission !== "default") return;
  // O resultado é ignorado de propósito: negar é uma resposta legítima, e o
  // aviso continua existindo no quadro — a frase do topo não depende disto.
  await Notification.requestPermission().catch(() => undefined);
}

/**
 * Avisa uma vez por cartão que o daemon ainda não registrou.
 *
 * **Sem permissão, nada quebra e nada se perde**: o `markNotified` continua
 * sendo chamado, porque o que ele marca é *"você já teve como saber"* — e a
 * frase do topo do quadro, que é a superfície que não depende de permissão
 * nenhuma, já contou. Marcar só quando há permissão faria o contador do topo
 * repetir para sempre em quem disse não.
 */
export function useBoardNotices(columns: readonly BoardColumn[] | undefined): void {
  /*
   * Os que já foram tratados **nesta aba**.
   *
   * A defesa de verdade é a do daemon; esta é contra o React: a leitura do
   * quadro refaz de tempos em tempos, e sem isto a mesma frase dispararia a cada
   * refetch até a resposta do `markNotified` voltar.
   */
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (columns === undefined) return;

    for (const column of columns) {
      for (const card of column.cards) {
        if (card.notice === null) continue;
        if (handled.current.has(card.id)) continue;
        handled.current.add(card.id);

        const text = card.notice;
        void trpc.task.markNotified
          .mutate({ id: card.id })
          .then((result: { first: boolean }) => {
            // Só quem escreveu notifica. A outra aba já perdeu a corrida no
            // daemon, e notificar aqui seria o segundo aviso que a Q55 recusa.
            if (!result.first) return;
            if (!available() || Notification.permission !== "granted") return;
            new Notification("Lumem", { body: text, tag: `lumem-task-${card.id}` });
          })
          .catch(() => {
            // Uma marcação que falhou é um aviso que volta na leitura seguinte,
            // e isso é melhor que um aviso perdido: `notified_at` continua nulo.
            handled.current.delete(card.id);
          });
      }
    }
  }, [columns]);
}
