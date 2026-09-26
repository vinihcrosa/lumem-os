import { useQuery } from "@tanstack/react-query";

import { HEALTH_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/**
 * Perguntado sempre, mesmo sem sessão nenhuma — é o que faz o daemon caindo no
 * meio de uma sessão virar algo que a topbar nota e diz, em vez de continuar
 * relatando a versão que viu no boot.
 */
export function useHealth() {
  return useQuery({
    queryKey: HEALTH_KEY,
    queryFn: () => trpc.health.query(),
    refetchInterval: 5_000,
    // A failed poll is the answer, not a glitch to retry around.
    retry: false,
  });
}
