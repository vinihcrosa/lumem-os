import { SettingsPanel } from "./features/settings/index.js";
import { LocalPanel, WorktreePanel } from "./features/checkout/index.js";
import {
  WorkspacePanel,
  useInvalidateWorkspaces,
} from "./features/workspace/index.js";
import {
  arrive,
  clear as clearSelection,
  select as selectScope,
  useNavigation,
} from "./lib/navigation.js";
import { navigate, useRoute } from "./lib/route.js";

export interface MainColumnProps {
  workspaceId: string;
  workspaceName: string;
}

/**
 * Qual tela está na frente, `032` T24.
 *
 * Lê `selection` e `route` direto do store em vez de receber os dois por prop
 * do `App`: as duas são a resposta a "onde eu estou", e um componente que
 * decide isso sozinho não precisa de mais um nível de repasse.
 */
export function MainColumn({ workspaceId, workspaceName }: MainColumnProps) {
  const { selection } = useNavigation();
  const route = useRoute();
  const invalidateWorkspaces = useInvalidateWorkspaces();

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
    return <SettingsPanel key={workspaceId} workspaceId={workspaceId} workspaceName={workspaceName} />;
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
