import { useQuery } from "@tanstack/react-query";

import {
  AGENT_RATE_LIMITS_KEY,
  RECENT_WORKSPACES_KEY,
  SYSTEM_LIVE_KEY,
  SYSTEM_RESOURCES_KEY,
  usageTotalKey,
} from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/**
 * As cinco leituras do painel da barra (`038`, Parte 3), cada uma a sua: um bloco que
 * falha não leva os outros, e cada uma tem o ritmo que o dado pede.
 *
 * Perguntadas de tempos em tempos e não uma vez, porque o painel fica aberto olhando
 * — e os recursos, em particular, **precisam** da pergunta: é ela que mantém o daemon
 * amostrando (AC 43). O `retry` desligado é o mesmo do `useHealth`: uma resposta que
 * falhou é a resposta, e o bloco diz que não conseguiu ler em vez de esperar.
 */
const EVERY = { fast: 3_000, normal: 10_000, slow: 30_000 } as const;

export function useRateLimits() {
  return useQuery({
    queryKey: AGENT_RATE_LIMITS_KEY,
    queryFn: () => trpc.agentAccount.rateLimits.query(),
    refetchInterval: EVERY.normal,
    retry: false,
  });
}

/** O total do dia: a manchete de quem não tem cota relatada. */
export function useTodayUsage() {
  return useQuery({
    queryKey: usageTotalKey("1d"),
    queryFn: () => trpc.usage.total.query({ period: "1d" }),
    refetchInterval: EVERY.normal,
    retry: false,
  });
}

/** Os turnos em voo, nomeados, e quantos shells estão abertos. */
export function useLiveSessions() {
  return useQuery({
    queryKey: SYSTEM_LIVE_KEY,
    queryFn: () => trpc.system.live.query(),
    refetchInterval: EVERY.fast,
    retry: false,
  });
}

export function useResources() {
  return useQuery({
    queryKey: SYSTEM_RESOURCES_KEY,
    queryFn: () => trpc.system.resources.query(),
    // O mesmo ritmo do `SAMPLE_INTERVAL_MS` do daemon (5 s): perguntar mais rápido que ele
    // amostra só devolveria a mesma amostra.
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useRecentWorkspaces() {
  return useQuery({
    queryKey: RECENT_WORKSPACES_KEY,
    queryFn: () => trpc.workspace.recent.query(),
    refetchInterval: EVERY.slow,
    retry: false,
  });
}
