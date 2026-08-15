import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FirstRun } from "./components/FirstRun.js";
import { ProjectDetail } from "./components/ProjectDetail.js";
import { ProjectList } from "./components/ProjectList.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { WorktreeDetail } from "./components/WorktreeDetail.js";
import { WorktreeTree } from "./components/WorktreeTree.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { AppShell } from "./layout/AppShell.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";
import { TerminalSpike } from "./pages/TerminalSpike.js";

/**
 * What the main area is showing.
 *
 * One value rather than a selected-project id plus a selected-worktree id:
 * with two, "a worktree of another project is selected" is representable, and
 * every render has to decide which one wins.
 */
type Selection =
  | { kind: "none" }
  | { kind: "project"; projectId: string }
  | { kind: "worktree"; projectId: string; worktreeId: string };

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
                <WorktreeTree
                  projectId={project.id}
                  projectAvailable={project.available}
                  selectedId={selection.kind === "worktree" ? selection.worktreeId : null}
                  onSelect={(worktreeId) =>
                    setSelection({ kind: "worktree", projectId: project.id, worktreeId })
                  }
                />
              )}
            />
          </>
        }
      >
        {renderDetail()}
        {/* Scope-free and temporary; T31 replaces it with sessions that hang
            off a project or a worktree. */}
        <TerminalSpike />
      </AppShell>
    );
  }

  function renderDetail() {
    if (selection.kind === "worktree") {
      return (
        <WorktreeDetail
          key={selection.worktreeId}
          worktreeId={selection.worktreeId}
          projectId={selection.projectId}
          onRemoved={() => setSelection({ kind: "project", projectId: selection.projectId })}
        />
      );
    }

    if (selection.kind === "project") {
      return (
        <ProjectDetail
          key={selection.projectId}
          projectId={selection.projectId}
          workspaceId={activeId!}
          onRemoved={() => setSelection({ kind: "none" })}
        />
      );
    }

    return <p>selecione um projeto</p>;
  }
}
