import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { cloneJobsKey, parseSourceKey, projectDetailKey, projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/** O que `project.parseSource` entende — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface ClonePlan {
  kind: "path" | "url" | "refused";
  path?: string;
  scheme?: string;
  url?: string;
  insecure?: boolean;
  name?: string;
  targetPath?: string;
  message?: string;
}

/** Os projetos de um workspace (`032` T13). */
export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: projectsKey(workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId }),
  });
}

export function useProjectDetail(projectId: string) {
  return useQuery({
    queryKey: projectDetailKey(projectId),
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });
}

/**
 * `add`, `clone`, `cloneCancel` e `remove` — e o gatilho manual que o `F1.9`
 * de `AddProjectDialog` precisa fora de uma mutação (um clone que terminou
 * enquanto a pessoa não olhava).
 */
export function useProjectMutations(workspaceId: string) {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: (input: { path: string; name?: string }): Promise<{ id: string; path: string }> =>
      trpc.project.add.mutate({ workspaceId, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
    },
  });

  const clone = useMutation({
    mutationFn: (input: { source: string; name?: string }): Promise<{ id: string }> =>
      trpc.project.clone.mutate({ workspaceId, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) });
    },
  });

  const cloneCancel = useMutation({
    mutationFn: (jobId: string): Promise<{ ok: true }> =>
      trpc.project.cloneCancel.mutate({ jobId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) });
    },
  });

  const remove = useMutation({
    mutationFn: (projectId: string) => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
    },
  });

  /** F1.9: um clone que terminou fecha o diálogo, fora do ciclo de uma mutação. */
  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });

  return { add, clone, cloneCancel, remove, invalidateProjects };
}

/** Longo o bastante para não perguntar a cada tecla, curto o bastante para parecer imediato. */
const ECHO_DEBOUNCE_MS = 250;

/**
 * O que `project.parseSource` entende, perguntado um instante depois de
 * parar de digitar — a mesma regra que o daemon aplica, e não uma segunda
 * implementação dela que poderia discordar.
 */
export function useParseSource(workspaceId: string, source: string, name: string) {
  const [settled, setSettled] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSettled(source.trim()), ECHO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

  return useQuery({
    queryKey: parseSourceKey(workspaceId, settled, name.trim()),
    queryFn: (): Promise<ClonePlan> =>
      trpc.project.parseSource.query({
        workspaceId,
        source: settled,
        ...(name.trim() === "" ? {} : { name: name.trim() }),
      }),
    enabled: settled !== "",
  });
}
