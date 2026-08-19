import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AddProjectDialog } from "./components/AddProjectDialog.js";
import { CheckoutFiles } from "./components/CheckoutFiles.js";
import { FirstRun } from "./components/FirstRun.js";
import { LocalPanel } from "./components/LocalPanel.js";
import { SidebarTree } from "./components/SidebarTree.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreePanel } from "./components/WorktreePanel.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AwaitingPermissionProvider } from "./hooks/useAwaitingPermission.js";
import { OpenFilesProvider } from "./hooks/useOpenFiles.js";
import { useRightPanel } from "./hooks/useRightPanel.js";
import type { Scope } from "./hooks/useSessionsByScope.js";
import { useTreeExpansion } from "./hooks/useTreeExpansion.js";
import { AppShell } from "./layout/AppShell.js";
import { Topbar } from "./layout/Topbar.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";
import { Banner, Skeleton } from "./ui/index.js";

import "./components/sidebar.css";
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
  const expansion = useTreeExpansion();
  const rightPanel = useRightPanel();

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

    // PRD §5: no workspace, no app. Everything below is scoped to one.
    if (workspaces.data.length === 0 || activeId === null) {
      return (
        <FirstRun
          onCreated={async (id) => {
            await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
            select(id);
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
              {/* Adding a project is an action of the workspace, not an item of
                  the list it appends to. */}
              <AddProjectDialog
                workspaceId={activeId}
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
      />
    );
  }

  function renderPanel(workspaceId: string, workspaceName: string) {
    if (selection === null) {
      return (
        <div className="pane">
          <p>selecione uma worktree</p>
        </div>
      );
    }

    const { projectId, scope } = selection;

    if (scope.scopeType === "worktree") {
      return (
        <WorktreePanel
          key={scope.scopeId}
          worktreeId={scope.scopeId}
          projectId={projectId}
          workspaceName={workspaceName}
          onRemoved={() =>
            setSelection({
              projectId,
              scope: { scopeType: "project", scopeId: projectId },
            })
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
