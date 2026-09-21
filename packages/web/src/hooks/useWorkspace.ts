import { useMutation, useQueryClient } from "@tanstack/react-query";

import { tasksKey, taskSettingsKey, WORKSPACES_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

/** `workspace.create` — sem `workspaceId`, porque nenhum existe ainda (`032` T15). */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => trpc.workspace.create.mutate({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
    },
  });
}

/**
 * `rename`, `remove` e os três tetos da esteira (`setAutonomy`, `setCleanup`,
 * `setBudget`) — todos de um workspace que já existe.
 *
 * As duas primeiras invalidam `WORKSPACES_KEY`: o seletor do topo e a tela
 * têm que concordar na hora, ou um nome novo em dois lugares é o começo de uma
 * tela discordando de si mesma. Os três tetos invalidam o par
 * `taskSettingsKey`/`tasksKey` — é lá que eles são lidos, não numa chave de
 * detalhe de workspace que não existe.
 */
export function useWorkspaceMutations(workspaceId: string) {
  const queryClient = useQueryClient();

  const rename = useMutation({
    mutationFn: (name: string) => trpc.workspace.rename.mutate({ id: workspaceId, name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: () => trpc.workspace.remove.mutate({ id: workspaceId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
    },
  });

  const refreshTaskSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: taskSettingsKey(workspaceId) });
    await queryClient.invalidateQueries({ queryKey: tasksKey(workspaceId) });
  };

  const setAutonomy = useMutation({
    mutationFn: (input: { autonomy: "manual" | "assistido" | "autonomo"; maxParallel: number }) =>
      trpc.workspace.setAutonomy.mutate({ id: workspaceId, ...input }),
    onSettled: refreshTaskSettings,
  });

  const setCleanup = useMutation({
    mutationFn: (mergedAlwaysRemoves: boolean) =>
      trpc.workspace.setCleanup.mutate({ id: workspaceId, mergedAlwaysRemoves }),
    onSettled: refreshTaskSettings,
  });

  /*
   * O daemon exige os três tetos de uma vez, e isso é do contrato dele: um
   * `PATCH` de um campo só precisaria distinguir *"não mexi"* de *"apaguei"*, e
   * os dois são `null` no corpo. Quem manda os três sempre não tem essa
   * ambiguidade.
   */
  const setBudget = useMutation({
    mutationFn: (caps: {
      costPerTask: number | null;
      costPerDay: number | null;
      turnsPerSession: number | null;
    }) => trpc.workspace.setBudget.mutate({ id: workspaceId, ...caps }),
    onSettled: refreshTaskSettings,
  });

  return { rename, remove, setAutonomy, setCleanup, setBudget };
}
