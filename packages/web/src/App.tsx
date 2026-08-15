import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AddProjectDialog } from "./components/AddProjectDialog.js";
import { CreateWorktreeDialog } from "./components/CreateWorktreeDialog.js";
import { FirstRun } from "./components/FirstRun.js";
import { NewSessionMenu } from "./components/NewSessionMenu.js";
import { ProjectDetail } from "./components/ProjectDetail.js";
import { SessionDetail } from "./components/SessionDetail.js";
import { SidebarTree } from "./components/SidebarTree.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreeDetail } from "./components/WorktreeDetail.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { useTreeExpansion } from "./hooks/useTreeExpansion.js";
import { AppShell } from "./layout/AppShell.js";
import { Topbar } from "./layout/Topbar.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";
import { Skeleton } from "./ui/index.js";

import "./components/sidebar.css";
import "./layout/layout.css";

type ScopeType = "project" | "worktree";

/**
 * What the main area is showing.
 *
 * One value rather than an id per kind: with three, "a worktree of another
 * project is selected" is representable, and every render has to decide which
 * one wins.
 */
type Selection =
  | { kind: "none" }
  | { kind: "project"; projectId: string }
  | { kind: "worktree"; projectId: string; worktreeId: string }
  | { kind: "session"; projectId: string; scopeType: ScopeType; scopeId: string; sessionId: string };

export function App() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const expansion = useTreeExpansion();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => trpc.health.query(),
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
    <div className="app">
      <Topbar version={health.data?.version ?? null} unreachable={health.isError} />
      {renderBody()}
    </div>
  );

  function renderBody() {
    if (workspaces.isPending) {
      return (
        <div className="detail">
          <Skeleton label="conectando ao daemon" />
        </div>
      );
    }
    if (workspaces.isError) {
      return (
        <div className="detail">
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

    // Bound here so `renderDetail` can read it: the narrowing above does not
    // survive into a nested function.
    const list = workspaces.data;
    const activeName = list.find((workspace) => workspace.id === activeId)?.name ?? "";

    return (
      <AppShell
        // A session hands the pane over to the terminal, which has to be able
        // to measure its own height.
        fill={selection.kind === "session"}
        sidebar={
          <>
            <WorkspaceSelector
              workspaces={workspaces.data}
              activeId={activeId}
              onSelect={(id) => {
                select(id);
                // Nothing selected in the old workspace belongs to the new one.
                setSelection({ kind: "none" });
              }}
            />
            <SidebarTree
              workspaceId={activeId}
              expansion={expansion}
              selection={{
                projectId: selection.kind === "none" ? null : selection.projectId,
                worktreeId: selection.kind === "worktree" ? selection.worktreeId : null,
                sessionId: selection.kind === "session" ? selection.sessionId : null,
              }}
              onSelectProject={(projectId) => setSelection({ kind: "project", projectId })}
              onSelectWorktree={(projectId, worktreeId) =>
                setSelection({ kind: "worktree", projectId, worktreeId })
              }
              onSelectSession={(projectId, scope, sessionId) =>
                setSelection({
                  kind: "session",
                  projectId,
                  scopeType: scope.scopeType,
                  scopeId: scope.scopeId,
                  sessionId,
                })
              }
            />
            <div className="sidebar__foot">
              {/* Adding a project is an action of the workspace, not an item of
                  the list it appends to. */}
              <AddProjectDialog
                workspaceId={activeId}
                onAdded={(projectId) => setSelection({ kind: "project", projectId })}
              />
            </div>
          </>
        }
      >
        {renderDetail(activeName)}
      </AppShell>
    );
  }

  function renderDetail(activeName: string) {
    if (selection.kind === "session") {
      const { projectId, scopeType, scopeId } = selection;
      return (
        <SessionDetail
          key={selection.sessionId}
          sessionId={selection.sessionId}
          onClosed={() =>
            setSelection(
              scopeType === "worktree"
                ? { kind: "worktree", projectId, worktreeId: scopeId }
                : { kind: "project", projectId },
            )
          }
        />
      );
    }

    if (selection.kind === "worktree") {
      const { projectId, worktreeId } = selection;
      return (
        <WorktreeDetail
          key={worktreeId}
          worktreeId={worktreeId}
          projectId={projectId}
          onRemoved={() => setSelection({ kind: "project", projectId })}
        >
          <NewSessionMenu
            scopeType="worktree"
            scopeId={worktreeId}
            onCreated={(sessionId) =>
              setSelection({
                kind: "session",
                projectId,
                scopeType: "worktree",
                scopeId: worktreeId,
                sessionId,
              })
            }
          />
        </WorktreeDetail>
      );
    }

    if (selection.kind === "project") {
      const { projectId } = selection;
      return (
        <ProjectDetail
          key={projectId}
          projectId={projectId}
          workspaceId={activeId!}
          workspaceName={activeName}
          onRemoved={() => setSelection({ kind: "none" })}
          onSelectWorktree={(worktreeId) =>
            setSelection({ kind: "worktree", projectId, worktreeId })
          }
          onSelectSession={(scope, sessionId) =>
            setSelection({
              kind: "session",
              projectId,
              scopeType: scope.scopeType,
              scopeId: scope.scopeId,
              sessionId,
            })
          }
        >
          {/* Creating a worktree is an action of the project it comes from,
              not of the list it will appear in. */}
          <CreateWorktreeDialog
            projectId={projectId}
            onCreated={(worktreeId) => setSelection({ kind: "worktree", projectId, worktreeId })}
          />
          {/* F5.2: an agent may run in the project itself, with no worktree. */}
          <NewSessionMenu
            scopeType="project"
            scopeId={projectId}
            onCreated={(sessionId) =>
              setSelection({
                kind: "session",
                projectId,
                scopeType: "project",
                scopeId: projectId,
                sessionId,
              })
            }
          />
        </ProjectDetail>
      );
    }

    return (
      <div className="detail">
        <p>selecione um projeto</p>
      </div>
    );
  }
}
