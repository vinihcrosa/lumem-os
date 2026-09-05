import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useAwaitingPermission } from "../hooks/useAwaitingPermission.js";
import { useScripts } from "../hooks/useScripts.js";
import { useRunningAcross, useSessionsByScope, type Scope } from "../hooks/useSessionsByScope.js";
import type { TreeExpansion } from "../hooks/useTreeExpansion.js";
import { projectsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { EmptyState, Glyph, Row, Skeleton } from "../ui/index.js";
import { CloneStatus } from "./CloneStatus.js";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.js";

import "./run-dock.css";

/**
 * What the sidebar is pointing at.
 *
 * Always a scope — the project's own checkout or one of its worktrees. The
 * sessions moved into tabs, so the tree no longer has a third thing to point
 * at, and "where am I working" has one shape of answer.
 */
export interface TreeSelection {
  scopeType: Scope["scopeType"] | null;
  scopeId: string | null;
}

export interface SidebarTreeProps {
  workspaceId: string;
  expansion: TreeExpansion;
  selection: TreeSelection;
  onSelect: (projectId: string, scope: Scope) => void;
  /**
   * Abrir o diálogo de acrescentar projeto.
   *
   * A árvore pede; quem hospeda o diálogo é a tela. O `+` mora aqui porque o
   * botão fica no cabeçalho da coisa que ele acrescenta — e não no rodapé, de
   * onde ele se afastava da lista a cada projeto que ela ganhava.
   */
  onAddProject: () => void;
  /** Reabrir o diálogo com o endereço de um clone que falhou por credencial. */
  onCloneRetry?: (source: string) => void;
}

/** Projects and their worktrees — F3.1 through F3.3. */
export function SidebarTree(props: SidebarTreeProps) {
  const projects = useQuery({
    queryKey: projectsKey(props.workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId: props.workspaceId }),
  });

  const list = projects.data ?? [];

  /**
   * De qual projeto a worktree está sendo cortada.
   *
   * Um diálogo para a árvore toda, e não um por linha: o que muda entre eles é
   * só o projeto, e um `Modal` por projeto seriam N véus esperando a vez.
   */
  const [creatingIn, setCreatingIn] = useState<ProjectSummary | null>(null);

  return (
    <div className="tree" aria-label="árvore de projetos">
      {/*
        O cabeçalho existe em TODOS os estados — carregando, com erro, vazio e
        cheio —, e é o único `+` sempre visível dos dois.

        Ele é o caminho para o **primeiro** projeto, e com zero projetos não há
        linha onde passar o ponteiro: um botão que só aparece no hover, num
        estado em que não existe nada para apontar, é uma saída que não existe.
      */}
      <div className="tree__head">
        <p className="tree__label">Projetos</p>
        <button
          type="button"
          className="tree__act"
          // `＋` sozinho não é nome de nada.
          aria-label="adicionar projeto"
          onClick={props.onAddProject}
        >
          <span aria-hidden="true">＋</span>
        </button>
      </div>

      {/*
        O clone em andamento, acima da lista e dentro dela: é onde o projeto vai
        nascer, e é onde já se olha para saber se ele chegou (Q5).
      */}
      <CloneStatus
        workspaceId={props.workspaceId}
        {...(props.onCloneRetry === undefined ? {} : { onRetry: props.onCloneRetry })}
      />

      {projects.isError && (
        <p className="tree__message" role="alert">
          {projects.error.message}
        </p>
      )}

      {projects.isPending && (
        <Skeleton label="carregando os projetos" widths={["80%", "60%", "70%"]} />
      )}

      {/* Sem ação própria: o `+` do cabeçalho, logo acima, é o caminho — e é o
          mesmo em todos os estados. Uma segunda cópia aqui seriam dois botões
          para um trabalho, a uma mão de distância um do outro. */}
      {projects.isSuccess && list.length === 0 && (
        <EmptyState title="Nenhum projeto aqui">
          Aponte para a raiz de um repositório git no disco, ou cole uma URL para clonar.
        </EmptyState>
      )}

      {list.map((project) => (
        <ProjectNode
          key={project.id}
          project={project}
          onCreateWorktree={() => setCreatingIn(project)}
          {...props}
        />
      ))}

      {creatingIn !== null && (
        <CreateWorktreeDialog
          projectId={creatingIn.id}
          projectName={creatingIn.name}
          open
          onClose={() => setCreatingIn(null)}
          onCreated={(worktreeId) => {
            // F1.5: o mesmo destino que o caminho de hoje entrega. O projeto pode
            // estar fechado — foi de uma linha fechada que o `+` foi clicado —,
            // então abrir vem antes de selecionar.
            props.expansion.expand(creatingIn.id);
            props.onSelect(creatingIn.id, { scopeType: "worktree", scopeId: worktreeId });
          }}
        />
      )}
    </div>
  );
}

interface ProjectSummary {
  id: string;
  name: string;
  available: boolean;
}

function ProjectNode({
  project,
  expansion,
  selection,
  onSelect,
  onCreateWorktree,
}: SidebarTreeProps & { project: ProjectSummary; onCreateWorktree: () => void }) {
  const expanded = expansion.isExpanded(project.id);
  const localScope: Scope = { scopeType: "project", scopeId: project.id };

  const worktrees = useQuery({
    queryKey: worktreesKey(project.id),
    queryFn: () => trpc.worktree.listByProject.query({ projectId: project.id }),
    // A repository that left the disk cannot answer, and asking would only put
    // an error in the sidebar for a state the row already reports.
    enabled: project.available,
  });

  const list = worktrees.data ?? [];

  /**
   * Every scope under this project, asked for at this level.
   *
   * The rows below read the same cache rather than fetching again, and a folded
   * project still knows how much is running inside it.
   */
  const scopes: Scope[] = [
    localScope,
    ...list.map((worktree) => ({ scopeType: "worktree" as const, scopeId: worktree.id })),
  ];
  const running = useRunningAcross(scopes);

  return (
    <>
      <div data-kind="project" data-state={project.available ? "available" : "missing"}>
        <Row
          depth={0}
          emphasis
          label={project.name}
          glyph={<Glyph tone={project.available ? "project" : "off"}>■</Glyph>}
          // PRD §8: a repository off disk stays in the list. Vanishing would
          // take the worktrees registered under it out of sight too.
          muted={!project.available}
          meta={project.available ? undefined : "sem disco"}
          count={!expanded && running > 0 ? running : undefined}
          expanded={expanded}
          onToggle={() => expansion.toggle(project.id)}
          // The project row has no panel of its own any more — everything it
          // used to show moved into `local`. Pointing it there keeps the row
          // from being a target that goes nowhere.
          selected={false}
          onSelect={() => onSelect(project.id, localScope)}
          // F1.8: um projeto sem disco não oferece o `+` — não há de onde cortar
          // worktree —, e o espaço fica, para a coluna continuar alinhada.
          action={
            project.available
              ? {
                  label: `nova worktree em ${project.name}`,
                  glyph: "＋",
                  onClick: onCreateWorktree,
                }
              : null
          }
        />
      </div>

      {expanded && project.available && (
        <>
          <LocalNode
            projectId={project.id}
            selected={selection.scopeType === "project" && selection.scopeId === project.id}
            onSelect={() => onSelect(project.id, localScope)}
          />

          {worktrees.isError && (
            <p className="tree__message" role="alert">
              {worktrees.error.message}
            </p>
          )}

          {list.map((worktree) => (
            <WorktreeNode
              key={worktree.id}
              projectId={project.id}
              worktree={worktree}
              selected={
                selection.scopeType === "worktree" && selection.scopeId === worktree.id
              }
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * The project's own checkout, listed as the first worktree.
 *
 * It is not a `git worktree`, and its glyph says so — but it is a directory
 * with a branch where sessions run, which is everything the sidebar needs it to
 * be. Leaving it out would mean two shapes of answer to one question.
 */
function LocalNode({
  projectId,
  selected,
  onSelect,
}: {
  projectId: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const scope: Scope = { scopeType: "project", scopeId: projectId };
  const running = useRunningAcross([scope]);

  return (
    <div data-kind="local" data-state="active">
      <Row
        depth={1}
        label="local"
        glyph={<Glyph tone="project">▭</Glyph>}
        meta={<ScriptMark scope={scope} />}
        count={running > 0 ? running : undefined}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

interface WorktreeSummary {
  id: string;
  name: string;
  branch: string;
  state: string;
}

/**
 * F3.3 asks the row to show name and branch. In this version F4.2 makes them
 * the same string, so printing both would be printing one twice — the branch
 * appears only when it is something the name does not already say.
 */
/**
 * O que este checkout tem de pé, visto de fora do rodapé.
 *
 * O rodapé pode estar fechado, ou você em outra worktree — e sem um sinal aqui
 * "tem um dev server nesta worktree" vira coisa que só o `lsof` sabe, até a
 * próxima vez que você rodar e a porta já estiver ocupada por você mesmo.
 *
 * Sem requisição nova por linha: é a **mesma chave de cache** que o rodapé usa, e
 * ela só volta a perguntar enquanto houver algo vivo.
 */
function ScriptMark({ scope }: { scope: Scope }) {
  const status = useScripts(scope);
  const run = status.data?.run.last;
  const setup = status.data?.setup.last;

  if (run?.running === true) {
    const port = status.data?.port ?? null;
    return (
      <span className="runmark">
        <span className="runmark__glyph">▶</span>
        {port === null ? "run" : `:${String(port.port)}`}
      </span>
    );
  }

  // O mesmo lugar onde `ausente` já aparece hoje: um estado do checkout, escrito
  // onde os estados do checkout são escritos.
  if (setup && !setup.running && setup.exitCode !== 0) return <>setup falhou</>;
  return null;
}

function worktreeMeta(worktree: WorktreeSummary): string | undefined {
  const parts = [
    worktree.branch === worktree.name ? null : worktree.branch,
    worktree.state === "missing" ? "ausente" : null,
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? undefined : parts.join(" · ");
}

function WorktreeNode({
  projectId,
  worktree,
  selected,
  onSelect,
}: {
  projectId: string;
  worktree: WorktreeSummary;
  selected: boolean;
  onSelect: SidebarTreeProps["onSelect"];
}) {
  const missing = worktree.state === "missing";
  const scope: Scope = { scopeType: "worktree", scopeId: worktree.id };
  const running = useRunningAcross([scope]);
  const awaiting = useAwaitingPermission();
  const sessions = useSessionsByScope(scope);
  // Only what is waiting on a person. A worktree with one blocked session and two
  // busy ones has to report the blocked one: it is the only one that will not
  // finish on its own (A10).
  const asking = awaiting.countIn((sessions.data ?? []).map((session) => session.id));

  return (
    <div data-kind="worktree" data-state={worktree.state}>
      <Row
        depth={1}
        label={worktree.name}
        glyph={<Glyph tone={missing ? "warn" : "worktree"}>{missing ? "⚠" : "◇"}</Glyph>}
        // F7.4: it stays visible and says so, instead of disappearing.
        muted={missing}
        meta={
          worktreeMeta(worktree) ?? (missing ? undefined : <ScriptMark scope={scope} />) ?? undefined
        }
        count={asking > 0 ? asking : running > 0 ? running : undefined}
        countTone={asking > 0 ? "asking" : "running"}
        selected={selected}
        onSelect={() => onSelect(projectId, scope)}
      />
    </div>
  );
}
