import { useEffect, useRef, useState } from "react";

/**
 * O relógio da linha de estado do turno (`035` S3): um tique por segundo, e
 * nenhum intervalo ligado quando não há turno.
 *
 * Inativo, devolve o último valor sem agendar nada — uma aba escondida, ou uma
 * conversa parada, não acorda o navegador uma vez por segundo para desenhar
 * uma linha que não está na tela.
 */
export function useNow(active: boolean, clock: () => number = Date.now): number {
  const [now, setNow] = useState(clock);
  // Num ref, para um relógio passado em linha não religar o intervalo a cada render.
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    if (!active) return;
    setNow(clockRef.current());
    const timer = setInterval(() => setNow(clockRef.current()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  return now;
}
