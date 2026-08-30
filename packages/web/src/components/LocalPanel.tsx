import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  if (confirming && project.data) {
    return (
      <RemoveProjectConfirm
        project={project.data}
        pending={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onCancel={() => {
          setConfirming(false);
          remove.reset();
        }}
        onConfirm={() => remove.mutate()}
      />
    );
  }

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
              onClick={() => setConfirming(true)}
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
                <CreateWorktreeDialog
                  projectId={projectId}
                  onCreated={onSelectWorktree}
                  hasCommits={project.data.hasCommits}
                />
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

/**
 * The most dangerous screen of the nine, F6.9.
 *
 * Two removals wearing one word. For a **cloned** project it deletes the
 * directory, because the daemon wrote those bytes into a directory the daemon
 * chose. For a project registered by path it takes it off the list and the disk
 * is untouched, exactly as F2.5 has always promised.
 *
 * The two texts have to be told apart at first reading — which is why they are
 * two texts and not one text with a conditional clause, and why the destructive
 * one prints the absolute path that is about to stop existing.
 */
function RemoveProjectConfirm({
  project,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  project: { name: string; path: string; managed: boolean };
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="pane">
      <div className="remove-confirm" role="alertdialog" aria-label="confirmar remoção">
        {project.managed ? (
          <>
            <h2 className="remove-confirm__title">apagar {project.name} do disco?</h2>
            <p className="remove-confirm__body">
              Este projeto foi clonado pelo Lumem. Remover tira do registro <strong>e apaga o
              diretório</strong>. Não dá para desfazer.
            </p>
            <p className="remove-confirm__path">{project.path}</p>
          </>
        ) : (
          <>
            <h2 className="remove-confirm__title">remover {project.name} da lista?</h2>
            <p className="remove-confirm__body">
              Este projeto aponta para um repositório <strong>seu</strong>. Sai da lista; o
              diretório fica exatamente onde está.
            </p>
          </>
        )}

        {/* Worktrees and running sessions refuse before anything is deleted, and
            the refusal shows here rather than after the confirmation — nobody
            should be asked to confirm something that is going to be refused. */}
        {error !== null && <Banner tone="danger">{error}</Banner>}

        <div className="remove-confirm__actions">
          <Button variant={project.managed ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending ? "removendo…" : project.managed ? "apagar" : "remover"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
