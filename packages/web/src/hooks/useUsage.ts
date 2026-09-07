import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  usageByProjectAndAgentKey,
  usageByProjectKey,
  usageByWorktreeKey,
} from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/**
 * O consumo por escopo (`workspace-screen`, W4).
 *
 * A janela é um **nome** — `7d`, `1m` — e não uma data: quem resolve o corte é o
 * daemon, porque o relógio de quem pergunta não pode decidir o que "últimos 7
 * dias" quer dizer. Uma tela aberta desde ontem daria uma resposta diferente da
 * mesma tela recarregada agora.
 *
 * Os tipos saem do contrato, nunca reescritos à mão: a lição da `ui-shell` está
 * paga uma vez, e cópia manual do que a procedure devolve deriva **passando** no
 * typecheck.
 */

export type UsageWindow = Parameters<typeof trpc.usage.byProject.query>[0]["period"];
export type ProjectUsage = Awaited<ReturnType<typeof trpc.usage.byProject.query>>[number];
export type WorktreeUsage = Awaited<ReturnType<typeof trpc.usage.byWorktree.query>>;
export type ProjectAgentUsage = Awaited<
  ReturnType<typeof trpc.usage.byProjectAndAgent.query>
>[number];

/** As janelas, na ordem em que a tela as mostra. `1a` é como se escreve em pt-BR. */
export const USAGE_WINDOWS: readonly { id: NonNullable<UsageWindow>; label: string }[] = [
  { id: "1d", label: "1d" },
  { id: "7d", label: "7d" },
  { id: "1m", label: "1m" },
  { id: "6m", label: "6m" },
  { id: "1y", label: "1a" },
];

export function useUsageByProject(
  workspaceId: string,
  period: NonNullable<UsageWindow>,
): UseQueryResult<ProjectUsage[]> {
  return useQuery({
    queryKey: usageByProjectKey(workspaceId, period),
    queryFn: () => trpc.usage.byProject.query({ workspaceId, period }),
  });
}

export function useUsageByWorktree(
  projectId: string,
  period: NonNullable<UsageWindow>,
): UseQueryResult<WorktreeUsage> {
  return useQuery({
    queryKey: usageByWorktreeKey(projectId, period),
    queryFn: () => trpc.usage.byWorktree.query({ projectId, period }),
  });
}

/**
 * O consumo de cada projeto **por agente** (`second-agent`, F5 e C5).
 *
 * `enabled` de propósito, e é a C5 escrita em código: com um agente a comparação
 * não existe, então a consulta também não acontece. Quem decide é quem sabe
 * quantos agentes há — a tela —, e não este hook.
 */
export function useUsageByProjectAndAgent(
  workspaceId: string,
  period: NonNullable<UsageWindow>,
  enabled: boolean,
): UseQueryResult<ProjectAgentUsage[]> {
  return useQuery({
    queryKey: usageByProjectAndAgentKey(workspaceId, period),
    queryFn: () => trpc.usage.byProjectAndAgent.query({ workspaceId, period }),
    enabled,
  });
}
