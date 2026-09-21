import { useEffect, useState } from "react";

import { AddProjectDialog } from "./features/workspace/index.js";
import { AgentLogin } from "./features/agent/index.js";
import { SettingsPanel } from "./features/settings/index.js";
import { SidebarNav } from "./features/workspace/index.js";
import { WorkspacePanel } from "./features/workspace/index.js";
import { CheckoutFiles } from "./features/checkout/index.js";
import { CreateWorktreeDialog } from "./features/workspace/index.js";
import { LocalPanel } from "./features/checkout/index.js";
import { SidebarTree, type ProjectSummary } from "./features/workspace/index.js";
import { WorkspaceSelector, type WorkspaceOption } from "./features/workspace/index.js";
import { WorktreePanel } from "./features/checkout/index.js";
import { useActiveWorkspace } from "./features/workspace/index.js";
import { useHealth } from "./hooks/useHealth.js";
import { useLiveState } from "./hooks/useLiveState.js";
import { AwaitingPermissionProvider } from "./hooks/useAwaitingPermission.js";
import { OpenFilesProvider } from "./hooks/useOpenFiles.js";
import { RightPanelProvider, useRightPanel } from "./features/checkout/index.js";
import { useRunDock, widenColumnOnOpen } from "./features/checkout/index.js";
import { useTreeExpansion, type TreeExpansion } from "./features/workspace/index.js";
import { useInvalidateWorkspaces, useWorkspaces } from "./features/workspace/index.js";
import { AppShell } from "./layout/AppShell.js";
import { Topbar } from "./layout/Topbar.js";
import { SetupFlow } from "./features/setup/index.js";
import { arrive, clear as clearSelection, select as selectScope, useNavigation } from "./lib/navigation.js";
import { navigate, useRoute } from "./lib/route.js";
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
          `032` T23: o mesmo estado precisa ser lido tanto pelo `AppShell` (a
          largura da coluna) quanto pela faixa de abas de cada checkout (o
          botão) — e o `App` não pode consumir um contexto que ele mesmo está
          montando. `WorkspaceShell`, um nível abaixo, é quem lê.
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
        invalidateWorkspaces={invalidateWorkspaces}
      />
    );
  }
}

interface WorkspaceShellProps {
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
  invalidateWorkspaces(): Promise<unknown>;
}

/**
 * O corpo da tela depois do primeiro acesso: a coluna do meio e a de arquivos.
 *
 * Descolado do `App` (`032` T23) porque as duas colunas do `AppShell`
 * precisam do `useRightPanel()` — a largura da coluna é uma prop do
 * `AppShell` em si, no mesmo nível do conteúdo, e não algo que um filho possa
 * decidir por conta própria depois. `selection` e `route` também são lidos
 * aqui, direto do store, pelo mesmo motivo que valia para o `App`: são a
 * resposta a "onde eu estou", e não precisam de mais um nível de prop.
 */
function WorkspaceShell({
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
  invalidateWorkspaces,
}: WorkspaceShellProps) {
  const { selection } = useNavigation();
  const route = useRoute();
  const rightPanel = useRightPanel();
  const dock = useRunDock();

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
              onSelect={(projectId, scope) =>
                selectScope({ projectId, scope })
              }
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
        {renderPanel()}
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
          arrive({ sessionId, text, send: true });
        }}
        // Abrir o rodapé pelo chevron alarga a coluna quando ela é estreita demais
        // para um terminal (S1) — e é o único gesto que faz isso. Chegar não faz:
        // o rodapé já nasce aberto, então nunca passa por aqui.
        dock={widenColumnOnOpen(dock, rightPanel)}
      />
    );
  }

  function renderPanel() {
    /*
     * A ordem é `selection` primeiro, e ela é a regra inteira da coluna do meio.
     *
     * `selectScope` leva a rota para `home` junto com a seleção, então
     * `selection !== null` implica `route === "home"` — as duas nunca discordam,
     * e a tela tem uma fonte só. Ler a rota primeiro exigiria decidir quem ganha
     * quando elas divergirem, e a resposta seria uma divergência que não deve
     * existir.
     */
    if (selection === null && route === "settings") {
      return (
        <SettingsPanel
          key={workspaceId}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
        />
      );
    }

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
          view={route === "tasks" ? "board" : "home"}
          onView={(view) => navigate(view === "board" ? "tasks" : "home")}
          onRemoved={async () => {
            await invalidateWorkspaces();
          }}
          onWorkOnTask={(target) => {
            arrive({ sessionId: target.sessionId, text: target.draft, send: false });
            selectScope({
              projectId: target.projectId,
              scope:
                target.worktreeId === null
                  ? { scopeType: "project", scopeId: target.projectId }
                  : { scopeType: "worktree", scopeId: target.worktreeId },
            });
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
          workspaceName={workspaceName}
          onRemoved={() =>
            selectScope({
              projectId,
              scope: { scopeType: "project", scopeId: projectId },
            })
          }
          /*
           * O caminho de volta (W7). `clearSelection()` é o que faz o painel do
           * workspace aparecer — e era o que nada chamava: quem entrava num
           * projeto só voltava trocando de workspace e voltando.
           */
          onOpenWorkspace={() => clearSelection()}
          onOpenProject={() =>
            selectScope({ projectId, scope: { scopeType: "project", scopeId: projectId } })
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
        onRemoved={() => clearSelection()}
        onOpenWorkspace={() => clearSelection()}
        onSelectWorktree={(worktreeId) =>
          selectScope({
            projectId,
            scope: { scopeType: "worktree", scopeId: worktreeId },
          })
        }
      />
    );
  }
}
