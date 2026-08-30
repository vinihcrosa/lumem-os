import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AddProjectDialog } from "./components/AddProjectDialog.js";
import { AgentLogin } from "./components/AgentLogin.js";
import { WorkspacePanel } from "./components/WorkspacePanel.js";
import { CheckoutFiles } from "./components/CheckoutFiles.js";
import { CloneStatus } from "./components/CloneStatus.js";
import { LocalPanel } from "./components/LocalPanel.js";
import { SidebarTree } from "./components/SidebarTree.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreePanel } from "./components/WorktreePanel.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AwaitingPermissionProvider } from "./hooks/useAwaitingPermission.js";
import { OpenFilesProvider } from "./hooks/useOpenFiles.js";
import { useRightPanel } from "./hooks/useRightPanel.js";
import { RUN_DOCK_PANEL_WIDTH, useRunDock } from "./hooks/useRunDock.js";
import type { Scope } from "./hooks/useSessionsByScope.js";
import { useTreeExpansion } from "./hooks/useTreeExpansion.js";
import { AppShell } from "./layout/AppShell.js";
import { Topbar } from "./layout/Topbar.js";
import { SetupFlow } from "./setup/SetupFlow.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";
import { Banner, Skeleton } from "./ui/index.js";

import "./components/sidebar.css";
import "./components/clone.css";
import "./layout/layout.css";

/**
 * Where the user is working.
 *
 * One scope, not a tree position: the sessions became tabs, so the main area
 * always shows the same kind of thing — a checkout and what is open in it. The
 * project id rides along because a worktree's panel needs it for the crumb and
 * for invalidating the right list on removal.
 */
type Selection = { projectId: string; scope: Scope } | null;

export function App() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>(null);
  /**
   * Whether the first-access flow is on screen.
   *
   * `null` until the workspace list has answered once, and then decided **once**:
   * derived state would be wrong here, because the flow creates the workspace at
   * step 3 and would then unmount itself two steps before the end (onboarding
   * F1.3). No flag on disk either (D2) — what answers "already set up?" is a
   * workspace existing, which is exactly what this reads.
   */
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null);
  /** A session the setup flow opened, for the tabs to bring to the front once. */
  const [openSessionId, setOpenSessionId] = useState<string | undefined>(undefined);
  /**
   * A URL handed back to the dialog, F6.10 of project-from-url.
   *
   * The way out of an authentication failure is the same address spelled for
   * ssh, and the person should not have to retype it. It lives here because the
   * failure is shown by one component and answered by another.
   */
  const [prefill, setPrefill] = useState<string | null>(null);
  const expansion = useTreeExpansion();
  const rightPanel = useRightPanel();
  const dock = useRunDock();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => trpc.health.query(),
    // Asked once, "daemon inacessível" was a state the UI could draw and never
    // reach: the daemon going down mid-session left the topbar reporting the
    // version it saw at boot. PRD §8 wants the client to notice and say so.
    refetchInterval: 5_000,
    // A failed poll is the answer, not a glitch to retry around.
    retry: false,
  });

  const workspaces = useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: () => trpc.workspace.list.query(),
  });

  const { activeId, select } = useActiveWorkspace(workspaces.data ?? []);

  useEffect(() => {
    if (setupOpen !== null || !workspaces.isSuccess) return;
    setSetupOpen(workspaces.data.length === 0);
  }, [setupOpen, workspaces.isSuccess, workspaces.data]);

  // F3.7: the daemon pushes, the sidebar follows. Everything below still polls
  // as a backstop, but this is what makes a change show up at once.
  useLiveState();

  return (
    // `AwaitingPermissionProvider` is installed once, here. A conversation that
    // thought it reported a pending permission and did not is the one failure
    // this must never have, and that is not something a caller should be able to
    // forget per tab.
    <AwaitingPermissionProvider>
      <OpenFilesProvider>
        <div className="app">
          <Topbar
            version={health.data?.version ?? null}
            unreachable={health.isError}
            // Nothing to show the files of until a checkout is selected.
            filesPanel={selection === null ? undefined : rightPanel}
          />
          {/* The topbar dot says it quietly; this says what it means. Every action
          below is a call to a daemon that is not answering, and a sidebar that
          merely looks stale gives no reason for why nothing works. */}
          {health.isError && (
            <div className="app__banner">
              <Banner tone="danger">
                <strong>Daemon inacessível.</strong> Nada aqui responde até ele
                voltar. As sessões continuam rodando no servidor — o que caiu é
                a conexão com ele.
              </Banner>
            </div>
          )}
          {renderBody()}
        </div>
      </OpenFilesProvider>
    </AwaitingPermissionProvider>
  );

  function renderBody() {
    if (workspaces.isPending) {
      return (
        <div className="pane">
          <Skeleton label="conectando ao daemon" />
        </div>
      );
    }
    if (workspaces.isError) {
      return (
        <div className="pane">
          <p role="alert">{workspaces.error.message}</p>
        </div>
      );
    }

    // Waiting on the one decision that cannot be derived (see `setupOpen`).
    if (setupOpen === null) {
      return (
        <div className="pane">
          <Skeleton label="conectando ao daemon" />
        </div>
      );
    }

    // PRD §5: no workspace, no app. What used to be `FirstRun` — one field and a
    // button — is the whole first-access flow now, and it is the only way in.
    if (setupOpen || workspaces.data.length === 0 || activeId === null) {
      return (
        <SetupFlow
          daemonVersion={health.data?.version ?? null}
          daemonUnreachable={health.isError}
          onFinish={async (result) => {
            await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
            if (result.workspaceId !== undefined) select(result.workspaceId);
            // Land on what was created, not on "selecione uma worktree": the
            // flow just made the thing the person came here to use.
            setOpenSessionId(result.sessionId);
            if (result.projectId !== undefined) {
              setSelection({
                projectId: result.projectId,
                scope:
                  result.worktreeId === undefined
                    ? { scopeType: "project", scopeId: result.projectId }
                    : { scopeType: "worktree", scopeId: result.worktreeId },
              });
            }
            setSetupOpen(false);
          }}
        />
      );
    }

    // Bound here so `renderPanel` can read it: the narrowing above does not
    // survive into a nested function.
    const list = workspaces.data;
    const activeName =
      list.find((workspace) => workspace.id === activeId)?.name ?? "";

    return (
      <AppShell
        // The panel owns its own scrolling: the terminal inside it has to be
        // able to measure a box with a height.
        fill
        right={renderRightPanel()}
        rightWidth={rightPanel.width}
        sidebar={
          <>
            <WorkspaceSelector
              workspaces={list}
              activeId={activeId}
              onSelect={(id) => {
                select(id);
                // Nothing selected in the old workspace belongs to the new one.
                setSelection(null);
              }}
            />
            <SidebarTree
              workspaceId={activeId}
              expansion={expansion}
              selection={{
                scopeType: selection?.scope.scopeType ?? null,
                scopeId: selection?.scope.scopeId ?? null,
              }}
              onSelect={(projectId, scope) =>
                setSelection({ projectId, scope })
              }
            />
            <div className="sidebar__foot">
              {/*
                Conectar um agente: one line, one verb, and the connection's state
                where it can be read.

                Here because it is where the user is standing when they notice the
                agent is missing — they open "nova sessão" and it is not in the list.
                The placement still tells the small lie A16 named: `agent_config` is
                global and this footer is the workspace's.
              */}
              <AgentLogin />
              {/* The clone sits right above the button that starts one, which
                  is also where the project it produces will appear. */}
              <CloneStatus workspaceId={activeId} onRetry={setPrefill} />
              {/* Adding a project is an action of the workspace, not an item of
                  the list it appends to. */}
              <AddProjectDialog
                workspaceId={activeId}
                prefill={prefill}
                onPrefillConsumed={() => setPrefill(null)}
                onAdded={(projectId) =>
                  setSelection({
                    projectId,
                    scope: { scopeType: "project", scopeId: projectId },
                  })
                }
              />
            </div>
          </>
        }
      >
        {renderPanel(activeId, activeName)}
      </AppShell>
    );
  }

  /** The checkout's files, when there is a checkout and the user wants them. */
  function renderRightPanel() {
    if (selection === null || !rightPanel.open) return undefined;

    return (
      <CheckoutFiles
        // Keyed by checkout: a path from one worktree does not exist in
        // another, so the tree's expansion starts over on purpose (F2.6).
        key={`${selection.scope.scopeType}:${selection.scope.scopeId}`}
        scope={selection.scope}
        onClose={rightPanel.toggle}
        onResize={rightPanel.setWidth}
        dock={{
          ...dock,
          // Abrir o rodapé alarga a coluna quando ela é estreita demais para um
          // terminal (S1). Só para cima, e só uma vez: quem já escolheu uma
          // largura maior não é corrigido, e fechar não desfaz o que a pessoa
          // arrastou depois.
          toggle: () => {
            if (!dock.open && rightPanel.width < RUN_DOCK_PANEL_WIDTH) {
              rightPanel.setWidth(RUN_DOCK_PANEL_WIDTH);
            }
            dock.toggle();
          },
        }}
      />
    );
  }

  function renderPanel(workspaceId: string, workspaceName: string) {
    if (selection === null) {
      /*
       * A tela do workspace (`workspace-screen`, W1).
       *
       * O que estava aqui era a frase "selecione uma worktree" — a única resposta
       * do produto a "onde eu estou" que era uma instrução. E era também o motivo
       * pelo qual a memória de workspace só existia através de um projeto: sem
       * checkout selecionado não há painel direito, então não havia porta.
       */
      return (
        <WorkspacePanel
          key={workspaceId}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          onRemoved={async () => {
            await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
          }}
        />
      );
    }

    const { projectId, scope } = selection;

    if (scope.scopeType === "worktree") {
      return (
        <WorktreePanel
          key={scope.scopeId}
          worktreeId={scope.scopeId}
          projectId={projectId}
          openSessionId={openSessionId}
          workspaceName={workspaceName}
          onRemoved={() =>
            setSelection({
              projectId,
              scope: { scopeType: "project", scopeId: projectId },
            })
          }
          /*
           * O caminho de volta (W7). `setSelection(null)` é o que faz o painel do
           * workspace aparecer — e era o que nada chamava: quem entrava num
           * projeto só voltava trocando de workspace e voltando.
           */
          onOpenWorkspace={() => setSelection(null)}
          onOpenProject={() =>
            setSelection({ projectId, scope: { scopeType: "project", scopeId: projectId } })
          }
        />
      );
    }

    return (
      <LocalPanel
        key={projectId}
        projectId={projectId}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        onRemoved={() => setSelection(null)}
        onOpenWorkspace={() => setSelection(null)}
        onSelectWorktree={(worktreeId) =>
          setSelection({
            projectId,
            scope: { scopeType: "worktree", scopeId: worktreeId },
          })
        }
      />
    );
  }
}
