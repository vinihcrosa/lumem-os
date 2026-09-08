import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AddProjectDialog } from "./components/AddProjectDialog.js";
import { AgentLogin } from "./components/AgentLogin.js";
import { WorkspacePanel } from "./components/WorkspacePanel.js";
import { CheckoutFiles } from "./components/CheckoutFiles.js";
import { CreateWorktreeDialog } from "./components/CreateWorktreeDialog.js";
import { LocalPanel } from "./components/LocalPanel.js";
import { SidebarTree, type ProjectSummary } from "./components/SidebarTree.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreePanel } from "./components/WorktreePanel.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AwaitingPermissionProvider } from "./hooks/useAwaitingPermission.js";
import { OpenFilesProvider } from "./hooks/useOpenFiles.js";
import { useRightPanel } from "./hooks/useRightPanel.js";
import { useRunDock, widenColumnOnOpen } from "./hooks/useRunDock.js";
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
   * Uma conversa aberta **para** uma pergunta, e a pergunta.
   *
   * Hoje vem de um lugar só: o rodapé de execução, quando o projeto não declara
   * `[scripts]` e a pessoa pede para o agente escrever. Mora aqui porque as abas
   * são do painel central, e o rodapé é da coluna da direita.
   */
  const [ask, setAsk] = useState<{ sessionId: string; text: string } | null>(null);
  /**
   * The two dialogs of the tree, `sidebar-actions` F1.2 and F1.3.
   *
   * Held here rather than by the rows that open them: they are modals over the
   * whole window, and the worktree one has to land the selection on what it
   * created — which is this component's state. The project the `+` was pressed
   * on rides along, because the dialog says so in its header instead of asking.
   */
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [worktreeFor, setWorktreeFor] = useState<ProjectSummary | null>(null);
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
      <>
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
              onAddProject={() => setAddProjectOpen(true)}
              onCreateWorktree={setWorktreeFor}
            />
            <div className="sidebar__foot">
              {/*
                Conectar um agente: one line, one verb, and the connection's state
                where it can be read.

                Here because it is where the user is standing when they notice the
                agent is missing — they open "nova sessão" and it is not in the list.
                The placement still tells the small lie A16 named: `agent_config` is
                global and this footer is the workspace's.

                And it is all that is left down here (F1.6): the agent belongs to
                the workspace, not to the list of projects, so it is the one thing
                that did not move up into the tree.
              */}
              <AgentLogin />
            </div>
          </>
        }
      >
        {renderPanel(activeId, activeName)}
      </AppShell>

      {/*
        The two modals, outside the shell.

        They cover the window, so nesting them in a column would only give them
        a stacking context to fight with. `AddProjectDialog` stays mounted while
        closed on purpose: it holds the clone subscription, and that is what lets
        a page reloaded onto a clone in flight bring the dialog back (F1.9).
      */}
      <AddProjectDialog
        workspaceId={activeId}
        workspaceName={activeName}
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        onRequestOpen={() => setAddProjectOpen(true)}
        onAdded={(projectId) =>
          setSelection({
            projectId,
            scope: { scopeType: "project", scopeId: projectId },
          })
        }
      />

      {worktreeFor !== null && (
        <CreateWorktreeDialog
          // Keyed by project: the field is per dialog, and reopening on another
          // row must not inherit what was typed for the last one.
          key={worktreeFor.id}
          projectId={worktreeFor.id}
          projectName={worktreeFor.name}
          hasCommits={worktreeFor.hasCommits}
          open
          onClose={() => setWorktreeFor(null)}
          // Q5: escolher uma branch que outro checkout já tem leva PARA ele.
          // O destino é o mesmo de criar; o que não acontece é a criação.
          onOpenExisting={(worktreeId) => {
            expansion.expand(worktreeFor.id);
            setSelection({
              projectId: worktreeFor.id,
              scope: { scopeType: "worktree", scopeId: worktreeId },
            });
            setWorktreeFor(null);
          }}
          onCreated={(worktreeId) => {
            // F1.5: the same destination the old path delivered. Expanding is
            // part of it — a worktree selected inside a folded project is a
            // selection with nothing on screen to show for it.
            expansion.expand(worktreeFor.id);
            setSelection({
              projectId: worktreeFor.id,
              scope: { scopeType: "worktree", scopeId: worktreeId },
            });
            setWorktreeFor(null);
          }}
        />
      )}
      </>
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
        onAskAgent={(sessionId, text) => {
          setAsk({ sessionId, text });
          setOpenSessionId(sessionId);
        }}
        // Abrir o rodapé pelo chevron alarga a coluna quando ela é estreita demais
        // para um terminal (S1) — e é o único gesto que faz isso. Chegar não faz:
        // o rodapé já nasce aberto, então nunca passa por aqui.
        dock={widenColumnOnOpen(dock, rightPanel)}
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
          initialPrompt={ask ?? undefined}
          workspaceName={workspaceName}
          filesPanel={rightPanel}
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
        openSessionId={openSessionId}
        initialPrompt={ask ?? undefined}
        filesPanel={rightPanel}
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
