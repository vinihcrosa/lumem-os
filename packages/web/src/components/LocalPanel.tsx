import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Scope } from "../hooks/useSessionsByScope.js";
import { projectsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Chip, Glyph, Item, MetaGrid, SectionHead, Skeleton } from "../ui/index.js";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.js";
import { ScopePanel } from "./ScopePanel.js";

import "./detail.css";

export interface LocalPanelProps {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  onRemoved: () => void;
  onSelectWorktree: (worktreeId: string) => void;
}

/**
 * The project's own checkout, as a worktree named `local`.
 *
 * It carries what used to be the project detail — path, base branch, the list
 * of worktrees, and the actions on the registration — because that is where a
 * user standing in the main checkout would look for them.
 */
export function LocalPanel({
  projectId,
  workspaceId,
  workspaceName,
  onRemoved,
  onSelectWorktree,
}: LocalPanelProps) {
  const queryClient = useQueryClient();
  const scope: Scope = { scopeType: "project", scopeId: projectId };

  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  const worktrees = useQuery({
    queryKey: worktreesKey(projectId),
    queryFn: () => trpc.worktree.listByProject.query({ projectId }),
    enabled: project.data?.available === true,
  });

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  if (project.isPending) {
    return (
      <div className="pane">
        <Skeleton label="carregando o projeto" />
      </div>
    );
  }
  if (!project.data) {
    return (
      <div className="pane">
        <p role="alert">projeto não encontrado</p>
      </div>
    );
  }

  const { name, path, defaultBranch, available } = project.data;
  const list = worktrees.data ?? [];

  return (
    <ScopePanel
      scope={scope}
      cwd={path}
      header={
        <>
          <nav className="crumb">
            {workspaceName}
            <span className="crumb__sep" aria-hidden="true">
              /
            </span>
            {name}
            <span className="crumb__sep" aria-hidden="true">
              /
            </span>
            <span className="crumb__here">local</span>
          </nav>

          <div className="detail__title">
            <h2>
              <Glyph tone={available ? "project" : "off"}>▭</Glyph> local
            </h2>
            <span className="actions__spacer" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "removendo…" : "remover projeto"}
            </Button>
          </div>

          <div className="chips">
            {/* No clean/dirty chip: the daemon reports status for a worktree it
                created, not for the checkout it merely registered. Saying
                nothing beats guessing. */}
            <Chip tone="branch" dot>
              {defaultBranch}
            </Chip>
            {available && (
              <Chip>
                {list.length} {list.length === 1 ? "worktree" : "worktrees"}
              </Chip>
            )}
          </div>
        </>
      }
      context={
        <>
          {available ? (
            <div className="detail__banner">
              <Banner tone="info">
                <strong>Este é o repositório em si, não uma worktree do Lumem.</strong> Remover o
                projeto tira o registro — o diretório e o que está dentro dele ficam no disco.
              </Banner>
            </div>
          ) : (
            <div className="detail__banner">
              <Banner tone="danger">
                <strong>O repositório não está mais em {path}.</strong> As ações sobre ele ficam
                bloqueadas até que ele volte; o registro continua aqui.
              </Banner>
            </div>
          )}

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

          {available && (
            <>
              <div className="actions">
                <CreateWorktreeDialog projectId={projectId} onCreated={onSelectWorktree} />
              </div>

              <section className="section">
                <SectionHead title="Worktrees deste projeto" count={list.length} />
                {list.length === 0 ? (
                  <p className="detail__hint">nenhuma worktree ainda</p>
                ) : (
                  list.map((worktree) => (
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
            </>
          )}
        </>
      }
    />
  );
}
