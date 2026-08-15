import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useRunningAcross, useSessionsByScope, type Scope } from "../hooks/useSessionsByScope.js";
import { projectsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  Chip,
  Glyph,
  Item,
  MetaGrid,
  SectionHead,
  Skeleton,
} from "../ui/index.js";

import "./detail.css";

export interface ProjectDetailProps {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  onRemoved: () => void;
  onSelectWorktree: (worktreeId: string) => void;
  onSelectSession: (scope: Scope, sessionId: string) => void;
  /** Actions on the repository. Hidden while it is missing from disk. */
  children?: ReactNode;
}

/** What the main area shows for a selected project, F3.6. */
export function ProjectDetail({
  projectId,
  workspaceId,
  workspaceName,
  onRemoved,
  onSelectWorktree,
  onSelectSession,
  children,
}: ProjectDetailProps) {
  const queryClient = useQueryClient();
  const projectScope: Scope = { scopeType: "project", scopeId: projectId };

  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  const worktrees = useQuery({
    queryKey: worktreesKey(projectId),
    queryFn: () => trpc.worktree.listByProject.query({ projectId }),
    enabled: project.data?.available === true,
  });

  const sessions = useSessionsByScope(projectScope);

  // Same keys the sidebar already filled — the counts cost nothing to read.
  const running = useRunningAcross([
    projectScope,
    ...(worktrees.data ?? []).map((worktree) => ({
      scopeType: "worktree" as const,
      scopeId: worktree.id,
    })),
  ]);

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  if (project.isPending) {
    return (
      <div className="detail">
        <Skeleton label="carregando o projeto" />
      </div>
    );
  }
  if (!project.data) {
    return (
      <div className="detail">
        <p role="alert">projeto não encontrado</p>
      </div>
    );
  }

  const { name, path, defaultBranch, available } = project.data;
  const worktreeList = worktrees.data ?? [];
  const sessionList = sessions.data ?? [];

  return (
    <section className="detail">
      <nav className="crumb">
        {workspaceName}
        <span className="crumb__sep" aria-hidden="true">
          /
        </span>
        <span className="crumb__here">{name}</span>
      </nav>

      <div className="detail__title">
        <h2>
          <Glyph tone={available ? "project" : "off"}>■</Glyph> {name}
        </h2>
      </div>

      {/* No branch chip here. For a project the base branch is a fact of
          record, not a live state, and it already has a row in the grid below
          — a worktree is where the branch earns a chip. */}
      <div className="chips">
        {available && (
          <Chip>
            {worktreeList.length} {worktreeList.length === 1 ? "worktree" : "worktrees"}
          </Chip>
        )}
        {running > 0 && (
          <Chip tone="running" dot>
            {running} {running === 1 ? "sessão rodando" : "sessões rodando"}
          </Chip>
        )}
      </div>

      {!available && (
        <div className="detail__banner">
          <Banner tone="danger">
            <strong>O repositório não está mais em {path}.</strong> As ações sobre ele ficam
            bloqueadas até que ele volte; o registro continua aqui.
          </Banner>
        </div>
      )}

      <div className="actions">
        {/* Blocked, not hidden-and-forgotten: the registration is still the
            user's, and removing it is exactly how they recover. */}
        {available && children}
        <span className="actions__spacer" />
        <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
          {remove.isPending ? "removendo…" : "remover projeto"}
        </Button>
      </div>

      {remove.isError && (
        <div className="detail__banner">
          <Banner tone="danger">{remove.error.message}</Banner>
        </div>
      )}

      <MetaGrid
        entries={[
          { label: "caminho", value: path, title: path },
          {
            label: "branch base",
            value: (
              <>
                {defaultBranch} <span className="dim">· resolvida na adição</span>
              </>
            ),
          },
        ]}
      />
      <p className="detail__hint">remover não apaga nada do disco</p>

      {available && (
        <section className="section">
          <SectionHead title="Worktrees" count={worktreeList.length} />
          {worktreeList.length === 0 ? (
            <p className="detail__hint">nenhuma worktree ainda</p>
          ) : (
            worktreeList.map((worktree) => (
              <Item
                key={worktree.id}
                name={worktree.name}
                glyph={
                  <Glyph tone={worktree.state === "missing" ? "warn" : "worktree"}>
                    {worktree.state === "missing" ? "⚠" : "◇"}
                  </Glyph>
                }
                detail={worktree.path}
                state={
                  worktree.state === "missing"
                    ? { label: "ausente", tone: "missing" }
                    : undefined
                }
                onSelect={() => onSelectWorktree(worktree.id)}
              />
            ))
          )}
        </section>
      )}

      <section className="section">
        <SectionHead title="Sessões no projeto" count={sessionList.length} />
        {sessionList.length === 0 ? (
          <p className="detail__hint">nenhuma sessão aberta aqui</p>
        ) : (
          sessionList.map((session) => (
            <Item
              key={session.id}
              name={session.agentName ?? "shell"}
              glyph={
                <Glyph tone={session.kind === "agent" ? "agent" : "shell"}>
                  {session.kind === "agent" ? "◆" : "●"}
                </Glyph>
              }
              detail={session.command}
              state={
                session.state === "running"
                  ? { label: "running", tone: "running" }
                  : {
                      label: `exited (${session.exitCode ?? "?"})`,
                      tone: session.exitCode === 0 ? "exited" : "failed",
                    }
              }
              onSelect={() => onSelectSession(projectScope, session.id)}
            />
          ))
        )}
      </section>
    </section>
  );
}
