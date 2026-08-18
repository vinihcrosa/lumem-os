import { useQuery } from "@tanstack/react-query";

import { projectDetailKey, worktreeDetailKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

import type { Scope } from "./useSessionsByScope.js";

export interface ScopeIds {
  workspaceId: string | null;
  projectId: string | null;
}

/**
 * Do escopo do checkout para os ids que a memória usa.
 *
 * O `Scope` carrega `scopeType` e `scopeId` e nada mais — foi desenhado para o
 * terminal, que só precisa saber em qual diretório rodar. A memória precisa de
 * **workspace** e **projeto**, e resolvê-los aqui evita que cada consumidor
 * invente a própria tradução: duas traduções do mesmo escopo é como duas telas
 * passam a discordar sobre o que está sendo mostrado.
 *
 * Uma worktree resolve para o projeto dela, e não para si mesma — worktree é
 * origem, nunca escopo (Q5).
 */
export function useScopeIds(scope: Scope): ScopeIds {
  const worktree = useQuery({
    queryKey: worktreeDetailKey(scope.scopeId),
    queryFn: () => trpc.worktree.getDetail.query({ id: scope.scopeId }),
    enabled: scope.scopeType === "worktree",
  });

  const projectId =
    scope.scopeType === "project" ? scope.scopeId : (worktree.data?.projectId ?? null);

  const project = useQuery({
    queryKey: projectDetailKey(projectId ?? "-"),
    queryFn: () => trpc.project.get.query({ id: projectId as string }),
    enabled: projectId !== null,
  });

  return { workspaceId: project.data?.workspaceId ?? null, projectId };
}
