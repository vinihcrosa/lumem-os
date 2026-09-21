import type { LumemEvent } from "@lumem/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { trpc } from "../lib/trpc.js";
import {
  CHANGES_PREFIX,
  FILES_PREFIX,
  PR_PREFIX,
  PROJECT_DETAIL_PREFIX,
  SESSION_PREFIX,
  TASK_BOARD_PREFIX,
  TASK_DETAIL_PREFIX,
  TASK_SETTINGS_PREFIX,
  WORKSPACES_KEY,
  WORKTREE_PREFIX,
  projectsKey,
  sessionsKey,
  tasksKey,
  worktreesKey,
} from "../lib/queryKeys.js";

export type { LumemEvent };

/**
 * O tipo mora em `@lumem/shared` (`032` T7): uma variante nova lá **derruba o
 * typecheck** deste `switch` no `default` — o mesmo comportamento que
 * `AcpEvent` já tem, e o oposto do que uma redeclaração local permitia (uma
 * variante nova no daemon passava por aqui sem ninguém notar).
 *
 * O daemon ainda não emite `agent_config.changed` nem `secret.changed` (`032`
 * T5). Um login de agente ou uma credencial nova só chegam a outra aba pela
 * invalidação manual de quem escreveu — nenhuma delas atravessa este switch.
 * Fica no [backlog](../../../../docs/project/backlog.md), com o gatilho "a
 * primeira tela que precisar ver um login feito em outra aba".
 */
export function invalidateFor(queryClient: QueryClient, event: LumemEvent): void {
  switch (event.type) {
    case "workspace.changed":
      void queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
      return;
    case "project.changed":
      void queryClient.invalidateQueries({ queryKey: projectsKey(event.workspaceId) });
      void queryClient.invalidateQueries({ queryKey: PROJECT_DETAIL_PREFIX });
      return;
    case "worktree.changed":
      void queryClient.invalidateQueries({ queryKey: worktreesKey(event.projectId) });
      void queryClient.invalidateQueries({ queryKey: WORKTREE_PREFIX });
      // The files column reads the same disk the worktree lives on. It has no
      // watcher of its own (Q6), so every signal the daemon does send counts.
      void queryClient.invalidateQueries({ queryKey: FILES_PREFIX });
      void queryClient.invalidateQueries({ queryKey: CHANGES_PREFIX });
      return;
    case "pr.changed":
      // A barra e o marcador da sidebar saem do mesmo cache do daemon, e o
      // evento é por projeto: invalidar `["pr"]` inteiro é o que impede os dois
      // de discordarem por um ciclo.
      void queryClient.invalidateQueries({ queryKey: PR_PREFIX });
      return;
    case "session.changed":
      void queryClient.invalidateQueries({
        queryKey: sessionsKey(event.scopeType, event.scopeId),
      });
      void queryClient.invalidateQueries({ queryKey: SESSION_PREFIX });
      return;
    case "task.changed":
      // Prefixo, e não a chave exata: a lista é filtrada por status e por
      // projeto, então existem N chaves vivas para o mesmo workspace — e o
      // detalhe lê por id. `in_progress` é derivado do primeiro prompt, então
      // este evento chega **enquanto** alguém olha a lista.
      void queryClient.invalidateQueries({ queryKey: tasksKey(event.workspaceId) });
      void queryClient.invalidateQueries({ queryKey: TASK_DETAIL_PREFIX });
      /*
       * O quadro e os interruptores, que não estão sob `listByWorkspace`.
       *
       * O quadro é a tela que **fica aberta enquanto ninguém olha** — selo,
       * relógio de encalhe e a contagem de *precisa de mim* saem todos da mesma
       * leitura —, e ele não tem `refetchInterval`. Sem esta linha, e com
       * `refetchOnWindowFocus` desligado no cliente inteiro, ele só se atualiza
       * pelas próprias mutações: a esteira anda e o quadro congela.
       */
      void queryClient.invalidateQueries({ queryKey: TASK_BOARD_PREFIX });
      void queryClient.invalidateQueries({ queryKey: TASK_SETTINGS_PREFIX });
      return;
    default:
      // Fecha o switch de propósito, no molde do `assertNeverScope` do
      // servidor: sem este ramo, um evento fora da união de hoje passaria em
      // silêncio — nem invalidação, nem aviso — em vez de reprovar aqui.
      return assertNeverEvent(event);
  }
}

function assertNeverEvent(event: never): never {
  throw new Error(`evento sem tradução para invalidação: ${JSON.stringify(event)}`);
}

/**
 * Keeps the sidebar in step with the daemon, PRD F3.7.
 *
 * The events carry no data — only which list went stale. Sending the rows
 * would mean two sources of truth for the same state; the client already knows
 * how to fetch, it just did not know when.
 */
export function useLiveState(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = trpc.events.onChange.subscribe(undefined, {
      onData: (event) => invalidateFor(queryClient, event),
      onConnectionStateChange: (state) => {
        // "idle" is tRPC's word for connected-and-listening; "connecting" is
        // the gap. Any event during a gap is gone for good — the daemon does
        // not replay — so refetching once on every (re)connect is the cheap
        // way to be right instead of quietly stale.
        if (state.state === "idle") void queryClient.invalidateQueries();
      },
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);
}
