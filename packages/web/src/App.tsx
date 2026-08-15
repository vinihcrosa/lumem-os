import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FirstRun } from "./components/FirstRun.js";
import { NewSessionMenu } from "./components/NewSessionMenu.js";
import { ProjectDetail } from "./components/ProjectDetail.js";
import { ProjectList } from "./components/ProjectList.js";
import { SessionDetail } from "./components/SessionDetail.js";
import { SessionList } from "./components/SessionList.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreeDetail } from "./components/WorktreeDetail.js";
import { WorktreeTree } from "./components/WorktreeTree.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AppShell } from "./layout/AppShell.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";

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
      <header className="app__header">
        <h1>Lumem-OS</h1>
        {health.isError && <span role="alert">daemon inacessível</span>}
        {health.data && <span>daemon v{health.data.version}</span>}
      </header>
      {renderBody()}
    </div>
  );

  function selectedSessionId(scopeType: ScopeType, scopeId: string): string | null {
    return selection.kind === "session" &&
      selection.scopeType === scopeType &&
      selection.scopeId === scopeId
      ? selection.sessionId
      : null;
  }

  function renderBody() {
    if (workspaces.isPending) return <p>conectando ao daemon…</p>;
    if (workspaces.isError) return <p role="alert">{workspaces.error.message}</p>;

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

    return (
      <AppShell
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
            <ProjectList
              workspaceId={activeId}
              selectedId={selection.kind === "none" ? null : selection.projectId}
              onSelect={(projectId) => setSelection({ kind: "project", projectId })}
              renderChildren={(project) => (
                <>
                  <SessionList
                    scopeType="project"
                    scopeId={project.id}
                    selectedId={selectedSessionId("project", project.id)}
                    onSelect={(sessionId) =>
                      setSelection({
                        kind: "session",
                        projectId: project.id,
                        scopeType: "project",
                        scopeId: project.id,
                        sessionId,
                      })
                    }
                  />
                  <WorktreeTree
                    projectId={project.id}
                    projectAvailable={project.available}
                    selectedId={selection.kind === "worktree" ? selection.worktreeId : null}
                    onSelect={(worktreeId) =>
                      setSelection({ kind: "worktree", projectId: project.id, worktreeId })
                    }
                    renderChildren={(worktreeId) => (
                      <SessionList
                        scopeType="worktree"
                        scopeId={worktreeId}
                        selectedId={selectedSessionId("worktree", worktreeId)}
                        onSelect={(sessionId) =>
                          setSelection({
                            kind: "session",
                            projectId: project.id,
                            scopeType: "worktree",
                            scopeId: worktreeId,
                            sessionId,
                          })
                        }
                      />
                    )}
                  />
                </>
              )}
            />
          </>
        }
      >
        {renderDetail()}
      </AppShell>
    );
  }

  function renderDetail() {
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
          onRemoved={() => setSelection({ kind: "none" })}
        >
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

    return <p>selecione um projeto</p>;
  }
}
