import {
  AddProjectDialog,
  CreateWorktreeDialog,
  SidebarNav,
  SidebarTree,
  WorkspaceSelector,
  type ProjectSummary,
  type TreeExpansion,
  type WorkspaceOption,
} from "./features/workspace/index.js";
import { AgentLogin } from "./features/agent/index.js";
import { useRightPanel } from "./features/checkout/index.js";
import { AppShell } from "./layout/AppShell.js";
import { MainColumn } from "./MainColumn.js";
import { RightColumn } from "./RightColumn.js";
import { clear as clearSelection, select as selectScope, useNavigation } from "./lib/navigation.js";
import { navigate, useRoute } from "./lib/route.js";

export interface WorkspaceShellProps {
  workspaceId: string;
  workspaceName: string;
  workspaces: readonly WorkspaceOption[];
  select(id: string): void;
  expansion: TreeExpansion;
  addProjectOpen: boolean;
  onOpenAddProject(): void;
  onCloseAddProject(): void;
  worktreeFor: ProjectSummary | null;
  onCreateWorktree(project: ProjectSummary | null): void;
  onCloseCreateWorktree(): void;
}

/**
 * O corpo da tela depois do primeiro acesso: a coluna do meio e a de arquivos.
 *
 * Descolado do `App` (`032` T23) porque as duas colunas do `AppShell`
 * precisam do `useRightPanel()` — a largura da coluna é uma prop do
 * `AppShell` em si, no mesmo nível do conteúdo, e o `App` não pode consumir
 * um contexto que ele mesmo está montando. `MainColumn` e `RightColumn`
 * (`032` T24) leem `selection`/`route`/`rightPanel` cada um por conta
 * própria; o que sobra aqui é montar o `AppShell` — sidebar, largura, os dois
 * diálogos —, que é o único lugar que precisa dos três ao mesmo tempo: a
 * largura e a presença da coluna são props do `AppShell` em si, não algo que
 * um filho decida por dentro.
 */
export function WorkspaceShell({
  workspaceId,
  workspaceName,
  workspaces,
  select,
  expansion,
  addProjectOpen,
  onOpenAddProject,
  onCloseAddProject,
  worktreeFor,
  onCreateWorktree,
  onCloseCreateWorktree,
}: WorkspaceShellProps) {
  const { selection } = useNavigation();
  const route = useRoute();
  const rightPanel = useRightPanel();

  return (
    <>
      <AppShell
        // The panel owns its own scrolling: the terminal inside it has to be
        // able to measure a box with a height.
        fill
        right={selection !== null && rightPanel.open ? <RightColumn /> : undefined}
        rightWidth={rightPanel.width}
        sidebar={
          <>
            <WorkspaceSelector
              workspaces={workspaces}
              activeId={workspaceId}
              onSelect={(id) => {
                select(id);
                // Nothing selected in the old workspace belongs to the new one.
                clearSelection();
              }}
            />
            <SidebarNav
              workspaceId={workspaceId}
              /*
               * `/tasks` é o caminho e `board` é o lugar, e eles têm nomes
               * diferentes de propósito: a linha da sidebar diz o **assunto**
               * (tarefas) e a tela diz a **forma** (quadro), que é a distinção
               * que a Q3a da `029` comprou. A tradução acontece aqui, uma vez.
               */
              place={selection !== null ? "scope" : route === "tasks" ? "board" : route}
              onHome={() => {
                navigate("home");
                clearSelection();
              }}
              onBoard={() => {
                navigate("tasks");
                clearSelection();
              }}
              onSettings={() => {
                navigate("settings");
                clearSelection();
              }}
            />
            <SidebarTree
              workspaceId={workspaceId}
              expansion={expansion}
              selection={{
                scopeType: selection?.scope.scopeType ?? null,
                scopeId: selection?.scope.scopeId ?? null,
              }}
              onSelect={(projectId, scope) => selectScope({ projectId, scope })}
              onAddProject={onOpenAddProject}
              onCreateWorktree={onCreateWorktree}
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
        <MainColumn workspaceId={workspaceId} workspaceName={workspaceName} />
      </AppShell>

      {/*
        The two modals, outside the shell.

        They cover the window, so nesting them in a column would only give them
        a stacking context to fight with. `AddProjectDialog` stays mounted while
        closed on purpose: it holds the clone subscription, and that is what lets
        a page reloaded onto a clone in flight bring the dialog back (F1.9).
      */}
      <AddProjectDialog
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        open={addProjectOpen}
        onClose={onCloseAddProject}
        onRequestOpen={onOpenAddProject}
        onAdded={(projectId) =>
          selectScope({
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
          onClose={onCloseCreateWorktree}
          // Q5: escolher uma branch que outro checkout já tem leva PARA ele.
          // O destino é o mesmo de criar; o que não acontece é a criação.
          onOpenExisting={(worktreeId) => {
            expansion.expand(worktreeFor.id);
            selectScope({
              projectId: worktreeFor.id,
              scope: { scopeType: "worktree", scopeId: worktreeId },
            });
            onCloseCreateWorktree();
          }}
          onCreated={(worktreeId) => {
            // F1.5: the same destination the old path delivered. Expanding is
            // part of it — a worktree selected inside a folded project is a
            // selection with nothing on screen to show for it.
            expansion.expand(worktreeFor.id);
            selectScope({
              projectId: worktreeFor.id,
              scope: { scopeType: "worktree", scopeId: worktreeId },
            });
            onCloseCreateWorktree();
          }}
        />
      )}
    </>
  );
}
