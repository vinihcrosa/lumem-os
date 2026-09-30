import { useEffect, useState } from "react";

/**
 * A hora de agora, renovada de tempos em tempos.
 *
 * O painel diz *"há 5 min"* e *"reseta em 2 h"*: frases que envelhecem na tela com o
 * painel aberto. Meio minuto basta — nenhuma delas fala em segundos.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
