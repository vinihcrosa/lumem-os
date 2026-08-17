import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  MEMORY_DECISIONS_KEY,
  MEMORY_USAGE_KEY,
  memoryListKey,
  memoryProposalsKey,
} from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/**
 * Os tipos saem do contrato, nunca reescritos à mão.
 *
 * A lição está no PRD da ui-shell e já foi paga uma vez: uma cópia manual do que
 * a procedure devolve deriva, e a deriva **passa no typecheck**.
 */
export type MemoryView = Awaited<ReturnType<typeof trpc.memory.list.query>>;
export type MemoryEntry = MemoryView["entries"][number];
export type Proposal = Awaited<ReturnType<typeof trpc.memory.proposals.query>>[number];
export type Decision = Awaited<ReturnType<typeof trpc.memory.decisions.query>>[number];
export type UsageSummary = Awaited<ReturnType<typeof trpc.memory.usage.query>>;

export interface MemoryScopeFilter {
  workspaceId: string | null;
  projectId: string | null;
}

export function useMemoryList(filter: MemoryScopeFilter): UseQueryResult<MemoryView> {
  return useQuery({
    queryKey: memoryListKey(filter.workspaceId, filter.projectId),
    queryFn: () =>
      trpc.memory.list.query({
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      }),
  });
}

export function useProposals(status: "pending" | "approved" | "rejected" = "pending") {
  return useQuery({
    queryKey: memoryProposalsKey(status),
    queryFn: () => trpc.memory.proposals.query({ status }),
  });
}

export function useDecisions() {
  return useQuery({ queryKey: MEMORY_DECISIONS_KEY, queryFn: () => trpc.memory.decisions.query() });
}

export function useUsage() {
  return useQuery({ queryKey: MEMORY_USAGE_KEY, queryFn: () => trpc.memory.usage.query() });
}

/**
 * Resolver uma proposta invalida **tudo** de memória.
 *
 * Aprovar muda a lista, a inbox, a linha do tempo e os números. Invalidar três
 * de quatro é exatamente como uma tela passa a discordar de si mesma.
 */
export interface ResolveProposal {
  approve: UseMutationResult<unknown, Error, { id: string; body?: string }>;
  reject: UseMutationResult<unknown, Error, { id: string; note?: string }>;
}

export function useResolveProposal(): ResolveProposal {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["memory"] });

  const approve = useMutation({
    mutationFn: (input: { id: string; body?: string }) => trpc.memory.approveProposal.mutate(input),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; note?: string }) => trpc.memory.rejectProposal.mutate(input),
    onSuccess: invalidate,
  });

  return { approve, reject };
}
