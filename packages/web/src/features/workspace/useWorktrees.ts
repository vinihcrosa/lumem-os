import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  worktreeBranchesKey,
  worktreeDetailKey,
  worktreeHostOriginsKey,
  worktreesKey,
} from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/** As worktrees de um projeto (`032` T13). */
export function useWorktrees(projectId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: worktreesKey(projectId),
    queryFn: () => trpc.worktree.listByProject.query({ projectId }),
    enabled: options.enabled ?? true,
  });
}

export function useWorktreeDetail(worktreeId: string) {
  return useQuery({
    queryKey: worktreeDetailKey(worktreeId),
    queryFn: () => trpc.worktree.getDetail.query({ id: worktreeId }),
  });
}

/**
 * As origens de uma worktree nova, em duas chaves — disco (branches, ~10 ms)
 * e rede (host, ~730 ms), para a aba `branch` nunca esperar um `gh` que talvez
 * nem esteja instalado.
 */
export function useWorktreeBranches(projectId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: worktreeBranchesKey(projectId),
    queryFn: () => trpc.worktree.branches.query({ projectId }),
    enabled: options.enabled ?? true,
  });
}

/** O que `worktree.hostOrigins` devolve — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface HostOrigins {
  host: string | null;
  issues: {
    failure: { kind: string; message: string } | null;
    items: { number: number; title: string }[];
  };
  pulls: {
    failure: { kind: string; message: string } | null;
    items: {
      number: number;
      title: string;
      headRefName: string;
      onDisk: boolean;
      crossRepository: boolean;
    }[];
  };
}

export function useWorktreeOrigins(projectId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: worktreeHostOriginsKey(projectId),
    queryFn: (): Promise<HostOrigins> => trpc.worktree.hostOrigins.query({ projectId }),
    enabled: options.enabled ?? true,
  });
}

type CreateWorktreeInput = Omit<Parameters<typeof trpc.worktree.create.mutate>[0], "projectId">;

/** `create` e `remove`, com a invalidação de `worktreesKey(projectId)` dentro. */
export function useWorktreeMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });

  const create = useMutation({
    mutationFn: (input: CreateWorktreeInput) => trpc.worktree.create.mutate({ projectId, ...input }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (input: { id: string; force: boolean }) => trpc.worktree.remove.mutate(input),
    onSuccess: invalidate,
  });

  return { create, remove };
}
