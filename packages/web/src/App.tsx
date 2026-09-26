import { useEffect, useState } from "react";

import { type ProjectSummary } from "./features/workspace/index.js";
import { useActiveWorkspace } from "./features/workspace/index.js";
import { useHealth } from "./hooks/useHealth.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AwaitingPermissionProvider } from "./hooks/useAwaitingPermission.js";
import { OpenFilesProvider } from "./hooks/useOpenFiles.js";
import { RightPanelProvider } from "./features/checkout/index.js";
import { useTreeExpansion } from "./features/workspace/index.js";
import { useInvalidateWorkspaces, useWorkspaces } from "./features/workspace/index.js";
import { Topbar } from "./layout/Topbar.js";
import { SetupFlow } from "./features/setup/index.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import { arrive, select as selectScope } from "./lib/navigation.js";
import { Banner, Skeleton } from "./ui/index.js";

import "./layout/layout.css";

export function App() {
  const invalidateWorkspaces = useInvalidateWorkspaces();
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

  const health = useHealth();
  const workspaces = useWorkspaces();

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
        {/*
          `032` T23: o `App` não pode consumir um contexto que ele mesmo está
          montando, então o provider mora aqui e quem lê é o `WorkspaceShell`,
          um nível abaixo.
        */}
        <RightPanelProvider>
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
        </RightPanelProvider>
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
            await invalidateWorkspaces();
            if (result.workspaceId !== undefined) select(result.workspaceId);
            // Land on what was created, not on "selecione uma worktree": the
            // flow just made the thing the person came here to use.
            if (result.sessionId !== undefined) arrive({ sessionId: result.sessionId, send: false });
            if (result.projectId !== undefined) {
              selectScope({
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

    // Bound here so `WorkspaceShell` can read it: the narrowing above does not
    // survive into a nested function.
    const list = workspaces.data;
    const activeName =
      list.find((workspace) => workspace.id === activeId)?.name ?? "";

    return (
      <WorkspaceShell
        workspaceId={activeId}
        workspaceName={activeName}
        workspaces={list}
        select={select}
        expansion={expansion}
        addProjectOpen={addProjectOpen}
        onOpenAddProject={() => setAddProjectOpen(true)}
        onCloseAddProject={() => setAddProjectOpen(false)}
        worktreeFor={worktreeFor}
        onCreateWorktree={setWorktreeFor}
        onCloseCreateWorktree={() => setWorktreeFor(null)}
      />
    );
  }
}
