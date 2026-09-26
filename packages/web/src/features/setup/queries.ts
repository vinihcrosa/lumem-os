import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PREFLIGHT_KEY, projectInspectKey, sessionsKey, worktreePlanKey, worktreesKey } from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/** O que `setup.preflight` devolve — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface PreflightReport {
  checks: {
    id: string;
    label: string;
    state: "ok" | "warn" | "fail";
    value: string;
    fix: string | null;
  }[];
  paths: {
    databasePath: string;
    workspacesDir: string;
    transcriptsDir: string;
  };
}

/** As cinco verificações locais do primeiro acesso (`032` T16). */
export function useSetupPreflight() {
  return useQuery({
    queryKey: PREFLIGHT_KEY,
    queryFn: (): Promise<PreflightReport> => trpc.setup.preflight.query(),
    // Lido na chegada e sob pedido. Nada aqui muda por conta própria, e um poll
    // rodaria cinco processos de novo sem motivo.
    refetchOnWindowFocus: false,
  });
}

/** O que `project.inspect` devolve — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface ProjectInspection {
  root: string;
  commits: number;
  head: { branch: string | null; shortSha: string | null };
  origin: string | null;
  clean: boolean;
  changedFiles: number;
  worktrees: { path: string }[];
  alreadyRegistered: { id: string; name: string } | null;
}

/** O que o daemon entende de um caminho, antes de registrar o projeto. */
export function useProjectInspect(path: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: projectInspectKey(path),
    queryFn: (): Promise<ProjectInspection> => trpc.project.inspect.query({ path }),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** O que `worktree.plan` devolve — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface WorktreePlanPreview {
  refusal: string | null;
  branch: string;
  baseBranch: string;
  baseSha: string | null;
  path: string;
  command: string;
}

/** O que `git worktree add` faria — branch, pasta e o comando, antes de rodar. */
export function useWorktreePlan(projectId: string, name: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: worktreePlanKey(projectId, name),
    queryFn: (): Promise<WorktreePlanPreview> => trpc.worktree.plan.query({ projectId, name }),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * A primeira worktree do primeiro acesso, com a sessão opcional que abre
 * junto — dois recursos numa mutação porque a tela pede os dois de uma vez, e
 * o componente não vê `useQueryClient` mesmo assim.
 */
export function useCreateFirstWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      name: string;
      agentConfigId?: string;
    }) => {
      const worktree = await trpc.worktree.create.mutate({
        projectId: input.projectId,
        name: input.name,
      });

      // O segundo passo não desfaz o primeiro: a worktree já existe no disco e
      // no registro, e voltar atrás por causa de um agente que não subiu
      // apagaria um checkout que a pessoa pediu.
      let sessionId: string | undefined;
      if (input.agentConfigId !== undefined) {
        const session = await trpc.session.createAgent.mutate({
          scopeType: "worktree",
          scopeId: worktree.id,
          agentConfigId: input.agentConfigId,
        });
        sessionId = session.id;
      }

      return { worktree, sessionId };
    },
    onSuccess: async ({ worktree }, input) => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(input.projectId) });
      await queryClient.invalidateQueries({ queryKey: sessionsKey("worktree", worktree.id) });
    },
  });
}
