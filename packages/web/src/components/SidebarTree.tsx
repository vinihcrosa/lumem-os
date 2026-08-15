import { useQuery } from "@tanstack/react-query";

import { useRunningAcross, useSessionsByScope, type Scope } from "../hooks/useSessionsByScope.js";
import type { TreeExpansion } from "../hooks/useTreeExpansion.js";
import { projectsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { EmptyState, Glyph, Row, Skeleton } from "../ui/index.js";

/** What the sidebar is pointing at. Mirrors `App`'s selection, minus the route. */
export interface TreeSelection {
  projectId: string | null;
  worktreeId: string | null;
  sessionId: string | null;
}

export interface SidebarTreeProps {
  workspaceId: string;
  expansion: TreeExpansion;
  selection: TreeSelection;
  onSelectProject: (projectId: string) => void;
  onSelectWorktree: (projectId: string, worktreeId: string) => void;
  onSelectSession: (projectId: string, scope: Scope, sessionId: string) => void;
}

/** Projects, worktrees and sessions as one tree — F3.1 through F3.4. */
export function SidebarTree(props: SidebarTreeProps) {
  const projects = useQuery({
    queryKey: projectsKey(props.workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId: props.workspaceId }),
  });

  if (projects.isError) {
    return (
      <p className="tree__message" role="alert">
        {projects.error.message}
      </p>
    );
  }

  const list = projects.data ?? [];

  if (projects.isPending) {
    return (
      <div className="tree">
        <Skeleton label="carregando os projetos" widths={["80%", "60%", "70%"]} />
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="tree">
        {/* No action of its own: `adicionar projeto` sits in the footer right
            below this, always visible. A second copy would be two buttons for
            one job, a hand's width apart. */}
        <EmptyState title="Nenhum projeto aqui">
          Aponte para a raiz de um repositório git que já está no disco. O Lumem não clona nada.
        </EmptyState>
      </div>
    );
  }

  return (
    // One label for the whole tree rather than one per level: projects,
    // worktrees and sessions are the same list at different depths now, and
    // three nested landmarks would be three things to walk past.
    <div className="tree" aria-label="árvore de projetos">
      {list.map((project) => (
        <ProjectNode key={project.id} project={project} {...props} />
      ))}
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
  onSelectProject,
  onSelectWorktree,
  onSelectSession,
}: SidebarTreeProps & { project: ProjectSummary }) {
  const expanded = expansion.isExpanded(project.id);

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
   * The children could each ask for their own, but then a folded project would
   * stop knowing that one of its worktrees has an agent running — and that pip
   * is the whole point of the sidebar. Hoisting it here keeps the answer alive
   * while the branch is shut; the keys are shared, so the rows below read the
   * same cache rather than fetching again.
   */
  const scopes: Scope[] = [
    { scopeType: "project", scopeId: project.id },
    ...list.map((worktree) => ({ scopeType: "worktree" as const, scopeId: worktree.id })),
  ];
  const running = useRunningAcross(scopes);

  return (
    <>
      <Row
        depth={0}
        emphasis
        label={project.name}
        glyph={<Glyph tone={project.available ? "project" : "off"}>■</Glyph>}
        // PRD §8: a repository off disk stays in the list. Vanishing would take
        // the worktrees registered under it out of sight too.
        muted={!project.available}
        meta={project.available ? undefined : "sem disco"}
        expanded={expanded}
        onToggle={() => expansion.toggle(project.id)}
        selected={selection.projectId === project.id && selection.worktreeId === null && selection.sessionId === null}
        onSelect={() => onSelectProject(project.id)}
        pip={!expanded && running > 0}
      />

      {expanded && (
        <>
          {/* F5.2 allows an agent in the project itself, with no worktree. A
              session that exists and is not in the tree is one the user loses. */}
          <SessionNodes
            depth={1}
            scope={{ scopeType: "project", scopeId: project.id }}
            selectedId={selection.sessionId}
            onSelect={(scope, sessionId) => onSelectSession(project.id, scope, sessionId)}
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
              expansion={expansion}
              selection={selection}
              onSelectWorktree={onSelectWorktree}
              onSelectSession={onSelectSession}
            />
          ))}
        </>
      )}
    </>
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
  expansion,
  selection,
  onSelectWorktree,
  onSelectSession,
}: {
  projectId: string;
  worktree: WorktreeSummary;
  expansion: TreeExpansion;
  selection: TreeSelection;
  onSelectWorktree: (projectId: string, worktreeId: string) => void;
  onSelectSession: SidebarTreeProps["onSelectSession"];
}) {
  const expanded = expansion.isExpanded(worktree.id);
  const missing = worktree.state === "missing";
  const scope: Scope = { scopeType: "worktree", scopeId: worktree.id };

  // Reads the cache the project already filled. Same key, no second request.
  const sessions = useSessionsByScope(scope);
  const running = (sessions.data ?? []).filter((session) => session.state === "running").length;

  return (
    <>
      <Row
        depth={1}
        label={worktree.name}
        glyph={<Glyph tone={missing ? "warn" : "worktree"}>{missing ? "⚠" : "◇"}</Glyph>}
        // F7.4: it stays visible and says so, instead of disappearing.
        muted={missing}
        meta={worktreeMeta(worktree)}
        expanded={expanded}
        onToggle={() => expansion.toggle(worktree.id)}
        selected={selection.worktreeId === worktree.id && selection.sessionId === null}
        onSelect={() => onSelectWorktree(projectId, worktree.id)}
        pip={!expanded && running > 0}
      />

      {expanded && (
        <SessionNodes
          depth={2}
          scope={scope}
          selectedId={selection.sessionId}
          onSelect={(sessionScope, sessionId) => onSelectSession(projectId, sessionScope, sessionId)}
        />
      )}
    </>
  );
}

function SessionNodes({
  depth,
  scope,
  selectedId,
  onSelect,
}: {
  depth: number;
  scope: Scope;
  selectedId: string | null;
  onSelect: (scope: Scope, sessionId: string) => void;
}) {
  const sessions = useSessionsByScope(scope);

  return (
    <>
      {(sessions.data ?? []).map((session) => (
        <Row
          key={session.id}
          depth={depth}
          label={session.agentName ?? "shell"}
          // F3.4 wants shell and agent told apart at a glance.
          glyph={
            <Glyph tone={session.kind === "agent" ? "agent" : "shell"}>
              {session.kind === "agent" ? "◆" : "●"}
            </Glyph>
          }
          muted={session.state === "exited"}
          meta={session.state === "exited" ? "saiu" : undefined}
          selected={selectedId === session.id}
          onSelect={() => onSelect(scope, session.id)}
        />
      ))}
    </>
  );
}
