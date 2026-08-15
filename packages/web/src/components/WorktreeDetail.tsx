import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { useSessionsByScope } from "../hooks/useSessionsByScope.js";
import { worktreeDetailKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Chip, Glyph, Item, MetaGrid, SectionHead, Skeleton } from "../ui/index.js";

import "./detail.css";

export interface WorktreeDetailProps {
  worktreeId: string;
  projectId: string;
  workspaceName: string;
  onRemoved: () => void;
  onSelectSession: (sessionId: string) => void;
  /** Actions for this worktree — the new-session menu. */
  children?: ReactNode;
}

/** Branch, path, cleanliness and distance from the base — F4.10. */
export function WorktreeDetail({
  worktreeId,
  projectId,
  workspaceName,
  onRemoved,
  onSelectSession,
  children,
}: WorktreeDetailProps) {
  const queryClient = useQueryClient();
  const [confirmingForce, setConfirmingForce] = useState(false);

  const detail = useQuery({
    queryKey: worktreeDetailKey(worktreeId),
    queryFn: () => trpc.worktree.getDetail.query({ id: worktreeId }),
  });

  // Same key the project detail uses, so the crumb costs a cache read.
  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  // Same key the sidebar filled, so the list below costs a cache read.
  const sessions = useSessionsByScope({ scopeType: "worktree", scopeId: worktreeId });

  const remove = useMutation({
    mutationFn: (force: boolean) => trpc.worktree.remove.mutate({ id: worktreeId, force }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onRemoved();
    },
  });

  if (detail.isPending) {
    return (
      <div className="detail">
        <Skeleton label="carregando a worktree" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="detail">
        <Banner tone="danger">{detail.error.message}</Banner>
      </div>
    );
  }

  const { name, branch, path, state, present, status, aheadBehind, baseBranch } = detail.data;
  const gone = !present || state === "missing";
  const sessionList = sessions.data ?? [];
  const runningCount = sessionList.filter((item) => item.state === "running").length;

  return (
    <section className="detail">
      <nav className="crumb">
        {workspaceName}
        <span className="crumb__sep" aria-hidden="true">
          /
        </span>
        {project.data?.name ?? "…"}
        <span className="crumb__sep" aria-hidden="true">
          /
        </span>
        <span className="crumb__here">{name}</span>
      </nav>

      <div className="detail__title">
        <h2>
          <Glyph tone={gone ? "warn" : "worktree"}>{gone ? "⚠" : "◇"}</Glyph> {name}
        </h2>
      </div>

      <div className="chips">
        <Chip tone="branch" dot>
          {branch}
        </Chip>
        {gone ? (
          <Chip tone="missing" dot>
            ausente do disco
          </Chip>
        ) : (
          <>
            {status === null ? (
              <Chip>estado desconhecido</Chip>
            ) : status.clean ? (
              <Chip tone="clean" dot>
                limpa
              </Chip>
            ) : (
              <Chip tone="dirty" dot>
                suja · {status.changedFiles}{" "}
                {status.changedFiles === 1 ? "arquivo" : "arquivos"}
              </Chip>
            )}
            {/* Zero behind is not information; zero ahead is not either. A
                chip that always says "↓0" teaches the eye to skip the row. */}
            {aheadBehind !== null && (aheadBehind.ahead > 0 || aheadBehind.behind > 0) && (
              <Chip>
                {aheadBehind.ahead > 0 && <span className="ahead">↑{aheadBehind.ahead}</span>}
                {aheadBehind.ahead > 0 && aheadBehind.behind > 0 && " "}
                {aheadBehind.behind > 0 && <span className="behind">↓{aheadBehind.behind}</span>}
                <span className="dim"> de {baseBranch}</span>
              </Chip>
            )}
          </>
        )}
      </div>

      {gone && (
        <div className="detail__banner">
          <Banner tone="warning">
            O diretório não está em <code>{path}</code>. Remover aqui só apaga o registro; a branch{" "}
            <code>{branch}</code> continua existindo.
          </Banner>
        </div>
      )}

      <div className="actions">
        {children}
        <span className="actions__spacer" />
        {confirmingForce ? null : (
          <Button
            variant="danger"
            onClick={() =>
              remove.mutate(false, {
                // The daemon decides whether it is blocked; the UI never
                // second-guesses it by reading the status itself.
                onError: () => setConfirmingForce(true),
              })
            }
            disabled={remove.isPending}
          >
            {remove.isPending ? "removendo…" : "remover worktree"}
          </Button>
        )}
      </div>

      {confirmingForce && (
        <div className="detail__banner">
          {/* Explicit, and only after the daemon has already refused once: this
              is the click that can destroy uncommitted work. */}
          <Banner
            tone="danger"
            actions={
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => remove.mutate(true)}
                  disabled={remove.isPending}
                >
                  remover mesmo assim
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingForce(false)}>
                  cancelar
                </Button>
              </>
            }
          >
            {remove.error?.message ?? "isso descarta as alterações não salvas."}
          </Banner>
        </div>
      )}

      <MetaGrid
        entries={[
          { label: "caminho", value: path, title: path },
          {
            label: "branch",
            value: (
              <>
                {branch} <span className="dim">nasceu de {baseBranch}</span>
              </>
            ),
          },
          {
            label: "em relação a " + baseBranch,
            value:
              aheadBehind === null
                ? "desconhecido"
                : `${aheadBehind.ahead} à frente, ${aheadBehind.behind} atrás`,
          },
        ]}
      />
      <p className="detail__hint">a branch não é apagada</p>

      <section className="section">
        <SectionHead
          title="Sessões"
          count={
            sessionList.length === 0
              ? 0
              : `${sessionList.length} · ${runningCount} rodando`
          }
        />
        {sessionList.length === 0 ? (
          <p className="detail__hint">nenhuma sessão aberta aqui</p>
        ) : (
          sessionList.map((item) => (
            <Item
              key={item.id}
              name={item.agentName ?? "shell"}
              glyph={
                <Glyph tone={item.kind === "agent" ? "agent" : "shell"}>
                  {item.kind === "agent" ? "◆" : "●"}
                </Glyph>
              }
              detail={item.command}
              state={
                item.state === "running"
                  ? { label: "running", tone: "running" }
                  : {
                      label: `exited (${item.exitCode ?? "?"})`,
                      tone: item.exitCode === 0 ? "exited" : "failed",
                    }
              }
              onSelect={() => onSelectSession(item.id)}
            />
          ))
        )}
      </section>
    </section>
  );
}
