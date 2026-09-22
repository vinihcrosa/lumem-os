import { useEffect, useRef } from "react";

import { consumeArrival, useNavigation, type Arrival } from "../../lib/navigation.js";

/**
 * A chegada desta sessão, consumida uma vez — o one-shot que hoje vivia
 * espalhado em três refs (`opened` do `ScopePanel`, `asked` e o inicializador
 * do rascunho da `Conversation`) passa a nascer aqui (`032-web-architecture`
 * T22).
 *
 * **Ler é síncrono; consumir é em efeito**, e a ordem é o que faz isto correto:
 *
 * - a leitura fica num `ref` (`shown`), atualizada **durante a renderização**
 *   sempre que o store tiver uma chegada desta sessão **diferente** da que já
 *   está mostrada — porque o rascunho que a `Conversation` inicializa a partir
 *   daqui precisa do valor **antes** do primeiro efeito rodar. Um efeito
 *   atropelaria o primeiro caractere de quem já começou a digitar antes de ele
 *   disparar, e é exatamente o motivo que já vivia no comentário do antigo
 *   `initialDraft`;
 * - a escrita que zera a chegada no store (`consumeArrival`) só acontece num
 *   `useEffect`. Mutar o store **durante a renderização** de um componente
 *   notificaria, na hora, qualquer outro inscrito no mesmo store (o
 *   `ScopePanel`, que decide qual aba trazer para a frente) — e o React
 *   recusa um `setState` disparado enquanto outro componente ainda está
 *   renderizando ("Cannot update a component while rendering a different
 *   component"). Adiar para o efeito é o que mantém a leitura do `ScopePanel`
 *   — que fecha sobre o valor do **seu próprio** render, antes deste hook
 *   consumir — correta independente da ordem em que os efeitos disparam.
 *
 * **Reler a cada render, e não só na primeira vez que a sessão aparece**
 * (achado 7 da revisão independente): o `sessionId` já existe antes de a
 * chegada ser registrada sempre que quem cria a sessão manda `arrive()` depois
 * de o `Composer` já ter montado — hoje funciona só pela ordem do agendador do
 * React, não por invariante. `consumed` guarda a última chegada já mandada
 * para `consumeArrival`, e é ela — não o `sessionId` — que decide se há
 * novidade: o store some depois de consumido (o próprio efeito zera), então
 * comparar com o store ao vivo confundiria "acabei de consumir" com "nada
 * pendente".
 *
 * A dupla renderização do `StrictMode` (`main.tsx`) não consome duas vezes: a
 * segunda passada encontra `shown` já preenchido com a mesma chegada e
 * `consumeArrival` já é idempotente por si — a segunda chamada, do efeito
 * duplicado, não acha mais nada para consumir.
 */
export function useArrival(sessionId: string): Arrival | null {
  const { arrival } = useNavigation();
  const incoming = arrival !== null && arrival.sessionId === sessionId ? arrival : null;

  const shown = useRef<{ readonly sessionId: string; readonly arrival: Arrival | null } | undefined>(
    undefined,
  );
  const consumed = useRef<Arrival | null>(null);

  if (
    shown.current === undefined ||
    shown.current.sessionId !== sessionId ||
    (incoming !== null && incoming !== consumed.current && incoming !== shown.current.arrival)
  ) {
    shown.current = { sessionId, arrival: incoming };
  }

  useEffect(() => {
    const pending = shown.current?.arrival ?? null;
    if (shown.current?.sessionId !== sessionId || pending === null || consumed.current === pending) return;
    consumed.current = pending;
    consumeArrival(sessionId);
  }, [sessionId, shown.current?.arrival]);

  return shown.current.arrival;
}
