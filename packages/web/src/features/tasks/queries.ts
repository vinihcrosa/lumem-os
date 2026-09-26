import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BoardColumn, BoardStatus } from "./board-columns.js";
import {
  boardKey,
  taskByWorktreeKey,
  taskDetailKey,
  taskSettingsKey,
  tasksKey,
  worktreesKey,
} from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/** O quadro de um workspace, opcionalmente de um projeto só (`028` Parte 1, `032` T12). */
export function useBoard(workspaceId: string, projectId: string | undefined) {
  return useQuery({
    queryKey: boardKey(workspaceId, projectId ?? null),
    queryFn: () =>
      trpc.task.board.query({
        workspaceId,
        ...(projectId === undefined ? {} : { projectId }),
      }) as Promise<BoardColumn[]>,
  });
}

/** As mutações do quadro — arrastar, parar, mandar, assumir e terminar. */
export function useBoardMutations(workspaceId: string, projectId: string | undefined) {
  const queryClient = useQueryClient();
  const key = boardKey(workspaceId, projectId ?? null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  /*
   * Nenhuma delas é otimista (§4.3). Quem renumera a coluna, quem abre o
   * adaptador e quem custa dinheiro é o daemon, numa transação — pintar um
   * palpite antes da resposta seria desenhar sobre a única coisa desta tela
   * que tem dono.
   */
  const move = useMutation({
    mutationFn: (target: { id: string; status: BoardStatus; index: number }) =>
      trpc.task.move.mutate(target),
    onSettled: invalidate,
  });

  const stop = useMutation({
    mutationFn: (taskId: string) => trpc.task.stop.mutate({ id: taskId }),
    onSettled: invalidate,
  });

  const send = useMutation({
    mutationFn: (taskId: string) => trpc.task.sendPrepared.mutate({ id: taskId }),
    onSettled: invalidate,
  });

  /** Assumir o volante (UC7, T39 · Q59) — não interrompe, só desliga a autonomia. */
  const takeOver = useMutation({
    mutationFn: (taskId: string) => trpc.task.setAutonomy.mutate({ id: taskId, autonomy: "off" }),
    onSettled: invalidate,
  });

  const finish = useMutation({
    mutationFn: (taskId: string) => trpc.task.finish.mutate({ id: taskId }) as Promise<{
      cleanup: { kind: string; reason?: string };
    }>,
    onSettled: invalidate,
  });

  return { move, stop, send, takeOver, finish };
}

/** O detalhe de uma tarefa. */
export function useTaskDetail(taskId: string) {
  return useQuery({
    queryKey: taskDetailKey(taskId),
    queryFn: () => trpc.task.get.query({ id: taskId }),
  });
}

/** `open`, `done`, `dropped` — muda o estado, e invalida a lista e o detalhe. */
export function useTaskStatusMutation(workspaceId: string, taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { status: string; reason?: string }) =>
      trpc.task.setStatus.mutate({ id: taskId, ...input } as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKey(workspaceId) });
      await queryClient.invalidateQueries({ queryKey: taskDetailKey(taskId) });
    },
  });
}

/** A lista de tarefas do workspace, opcionalmente filtrada por projeto e/ou status. */
export function useTasksByWorkspace(
  workspaceId: string,
  filter?: { projectId?: string; status?: string },
) {
  return useQuery({
    queryKey: tasksKey(workspaceId, filter),
    queryFn: () =>
      trpc.task.listByWorkspace.query({
        workspaceId,
        ...(filter?.projectId === undefined ? {} : { projectId: filter.projectId }),
        ...(filter?.status === undefined ? {} : { status: filter.status as never }),
      }),
  });
}

/** A medida de cerimônia — `sessões com tarefa ÷ sessões` (`030` T13 · Q9). */
export function useTaskSettings(workspaceId: string) {
  return useQuery({
    queryKey: taskSettingsKey(workspaceId),
    queryFn: () => trpc.task.settings.query({ workspaceId }),
  });
}

/** A tarefa de um checkout, se houver (`022` T11). */
export function useTaskByWorktree(worktreeId: string) {
  return useQuery({
    queryKey: taskByWorktreeKey(worktreeId),
    queryFn: () => trpc.task.getByWorktree.query({ worktreeId }),
  });
}

/**
 * "Trabalhar nesta tarefa" (F2, T10) — worktree nova ou existente, depois a
 * sessão. Três recursos numa mutação só porque a orquestração **é** o que a
 * tela pede; o componente não vê `useQueryClient` mesmo assim.
 */
export function useWorkOnTaskMutation(taskId: string, projectId: string, draft: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      mode: "new" | "existing";
      name: string;
      checkout: string | null;
      agentConfigId: string | null;
    }) => {
      const target =
        input.mode === "new"
          ? (await trpc.worktree.create.mutate({ projectId, name: input.name, taskId })).id
          : input.checkout;
      if (target === null) throw new Error("escolha um checkout");
      if (input.agentConfigId === null) throw new Error("nenhum agente configurado");

      if (input.mode === "existing") {
        await trpc.task.attachWorktree.mutate({ id: taskId, worktreeId: target });
      }
      const session = await trpc.session.createAgent.mutate({
        scopeType: "worktree",
        scopeId: target,
        agentConfigId: input.agentConfigId,
        taskId,
      });
      return { worktreeId: target, sessionId: session.id, draft };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      await queryClient.invalidateQueries({ queryKey: taskDetailKey(taskId) });
    },
  });
}
