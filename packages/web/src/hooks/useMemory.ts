import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  MEMORY_DECISIONS_KEY,
  MEMORY_SETTINGS_KEY,
  MEMORY_USAGE_KEY,
  memoryCoreKey,
  memoryListKey,
  memoryProposalsKey,
  playbooksKey,
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
export type MemoryCore = Awaited<ReturnType<typeof trpc.memory.core.query>>;
export type MemorySettings = Awaited<ReturnType<typeof trpc.memory.settings.query>>;

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

/**
 * `resolved` é uma opção porque rejeitar **não** apaga.
 *
 * A proposta recusada continua existindo, e uma inbox que só sabe perguntar
 * pelas pendentes é uma tela onde ela desaparece — nem na lista, nem no
 * histórico, que só registra o que passou pelo portão.
 *
 * Derivado do contrato, e não escrito à mão: tirar um valor do enum do router
 * tem de virar erro de typecheck aqui, e não uma aba que só quebra no navegador.
 */
type ProposalQueryInput = Exclude<Parameters<typeof trpc.memory.proposals.query>[0], void | undefined>;

export type ProposalStatus = NonNullable<ProposalQueryInput["status"]>;

export function useProposals(status: ProposalStatus = "pending") {
  return useQuery({
    queryKey: memoryProposalsKey(status),
    queryFn: () => trpc.memory.proposals.query({ status }),
  });
}

export function useDecisions() {
  return useQuery({ queryKey: MEMORY_DECISIONS_KEY, queryFn: () => trpc.memory.decisions.query() });
}

/**
 * O que o núcleo custa neste escopo.
 *
 * Query própria e não um campo do `list`: a lista responde "o que existe" e é
 * lida em toda abertura do painel; a marca d'água lê o disco de cada memória
 * fixada, e pendurá-la no `list` faria toda abertura pagar isso.
 */
export function useMemoryCore(filter: MemoryScopeFilter): UseQueryResult<MemoryCore> {
  return useQuery({
    queryKey: memoryCoreKey(filter.workspaceId, filter.projectId),
    queryFn: () =>
      trpc.memory.core.query({
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      }),
  });
}

/**
 * Fixar e desfixar — e invalidar **tudo** de memória.
 *
 * Fixar muda a lista (a entrada mostra que está no núcleo), a marca d'água, a
 * linha do tempo (virou decisão no WAL) e o commit no `~/.lumem`. Invalidar três
 * de quatro é exatamente como uma tela passa a discordar de si mesma — a lição
 * já está paga no `useResolveProposal`.
 */
export function usePinMemory(): UseMutationResult<unknown, Error, { path: string; pinned: boolean }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; pinned: boolean }) => trpc.memory.pin.mutate(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["memory"] }),
  });
}

/** O que está ligado no daemon. Hoje, a destilação de fim de sessão. */
export function useMemorySettings(): UseQueryResult<MemorySettings> {
  return useQuery({ queryKey: MEMORY_SETTINGS_KEY, queryFn: () => trpc.memory.settings.query() });
}

export type Playbook = Awaited<ReturnType<typeof trpc.memory.playbooks.query>>[number];

/** Os playbooks do escopo. `archived` é uma vista, não um estado escondido. */
export function usePlaybooks(
  filter: MemoryScopeFilter & { archived?: boolean },
): UseQueryResult<Playbook[]> {
  const archived = filter.archived ?? false;
  return useQuery({
    queryKey: playbooksKey(filter.workspaceId, archived),
    queryFn: () =>
      trpc.memory.playbooks.query({
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
        archived,
      }),
  });
}

/** Arquivar e desarquivar — e as duas vistas mudam juntas. */
export function useArchivePlaybook(): UseMutationResult<
  unknown,
  Error,
  { path: string; archived: boolean }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; archived: boolean }) =>
      trpc.memory.archivePlaybook.mutate(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["memory"] }),
  });
}

export function useUsage() {
  return useQuery({ queryKey: MEMORY_USAGE_KEY, queryFn: () => trpc.memory.usage.query() });
}

/**
 * O que você pode corrigir antes de aceitar.
 *
 * Do contrato, pelo mesmo motivo: renomear um campo no router não geraria erro
 * numa cópia manual — objeto em variável não passa por excess property check —,
 * e a edição do revisor seria descartada em silêncio.
 */
export type ProposalEdits = Parameters<typeof trpc.memory.approveProposal.mutate>[0];

/**
 * Resolver uma proposta invalida **tudo** de memória.
 *
 * Aprovar muda a lista, a inbox, a linha do tempo e os números. Invalidar três
 * de quatro é exatamente como uma tela passa a discordar de si mesma.
 */
export interface ResolveProposal {
  approve: UseMutationResult<unknown, Error, ProposalEdits>;
  reject: UseMutationResult<unknown, Error, { id: string; note?: string }>;
}

export function useResolveProposal(): ResolveProposal {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["memory"] });

  const approve = useMutation({
    mutationFn: (input: ProposalEdits) => trpc.memory.approveProposal.mutate(input),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; note?: string }) => trpc.memory.rejectProposal.mutate(input),
    onSuccess: invalidate,
  });

  return { approve, reject };
}
