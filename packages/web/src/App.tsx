import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FirstRun } from "./components/FirstRun.js";
import { ProjectDetail } from "./components/ProjectDetail.js";
import { ProjectList } from "./components/ProjectList.js";
import { WorkspaceSelector } from "./components/WorkspaceSelector.js";
import { useActiveWorkspace } from "./hooks/useActiveWorkspace.js";
import { AppShell } from "./layout/AppShell.js";
import { WORKSPACES_KEY } from "./lib/queryKeys.js";
import { trpc } from "./lib/trpc.js";
import { TerminalSpike } from "./pages/TerminalSpike.js";

export function App() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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
                // A project of the old workspace has no place in the new one.
                setSelectedProjectId(null);
              }}
            />
            <ProjectList
              workspaceId={activeId}
              selectedId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />
          </>
        }
      >
        {selectedProjectId ? (
          <ProjectDetail
            key={selectedProjectId}
            projectId={selectedProjectId}
            workspaceId={activeId}
            onRemoved={() => setSelectedProjectId(null)}
          />
        ) : (
          <p>selecione um projeto</p>
        )}
        {/* Scope-free and temporary; T31 replaces it with sessions that hang
            off a project or a worktree. */}
        <TerminalSpike />
      </AppShell>
    );
  }
}
