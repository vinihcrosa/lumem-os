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
 * - a leitura fica num `ref`, calculada **durante a renderização** (guardada
 *   pelo `sessionId`, não recalculada enquanto ele não muda) — porque o
 *   rascunho que a `Conversation` inicializa a partir daqui precisa do valor
 *   **antes** do primeiro efeito rodar. Um efeito atropelaria o primeiro
 *   caractere de quem já começou a digitar antes de ele disparar, e é
 *   exatamente o motivo que já vivia no comentário do antigo `initialDraft`;
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
 * A dupla renderização do `StrictMode` (`main.tsx`) não consome duas vezes: a
 * segunda passada encontra o `ref` já preenchido para o mesmo `sessionId` e
 * não olha o store de novo; e `consumeArrival` já é idempotente por si — a
 * segunda chamada, do efeito duplicado, não acha mais nada para consumir.
 */
export function useArrival(sessionId: string): Arrival | null {
  const { arrival } = useNavigation();

  const captured = useRef<{ readonly sessionId: string; readonly arrival: Arrival | null } | undefined>(
    undefined,
  );
  if (captured.current === undefined || captured.current.sessionId !== sessionId) {
    captured.current = {
      sessionId,
      arrival: arrival !== null && arrival.sessionId === sessionId ? arrival : null,
    };
  }

  useEffect(() => {
    if (captured.current?.sessionId !== sessionId || captured.current.arrival === null) return;
    consumeArrival(sessionId);
  }, [sessionId]);

  return captured.current.arrival;
}
