import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { worktreeDetailKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface WorktreeDetailProps {
  worktreeId: string;
  projectId: string;
  onRemoved: () => void;
  /** Sessions of this worktree, from T31 on. */
  children?: ReactNode;
}

/** Branch, path, cleanliness and distance from the base — F4.10. */
export function WorktreeDetail({
  worktreeId,
  projectId,
  onRemoved,
  children,
}: WorktreeDetailProps) {
  const queryClient = useQueryClient();
  const [confirmingForce, setConfirmingForce] = useState(false);

  const detail = useQuery({
    queryKey: worktreeDetailKey(worktreeId),
    queryFn: () => trpc.worktree.getDetail.query({ id: worktreeId }),
  });

  const remove = useMutation({
    mutationFn: (force: boolean) => trpc.worktree.remove.mutate({ id: worktreeId, force }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onRemoved();
    },
  });

  if (detail.isPending) return <p>carregando…</p>;
  if (detail.isError) return <p role="alert">{detail.error.message}</p>;

  const { name, branch, path, state, present, status, aheadBehind, baseBranch } = detail.data;

  return (
    <section className="worktree-detail">
      <h2>{name}</h2>
      <dl>
        <dt>branch</dt>
        <dd>{branch}</dd>
        <dt>caminho</dt>
        <dd>{path}</dd>
        <dt>estado</dt>
        <dd>
          {status === null
            ? "desconhecido"
            : status.clean
              ? "limpa"
              : `suja — ${status.changedFiles} arquivo(s) modificado(s)`}
        </dd>
        <dt>em relação a {baseBranch}</dt>
        <dd>
          {aheadBehind === null
            ? "desconhecido"
            : `${aheadBehind.ahead} à frente, ${aheadBehind.behind} atrás`}
        </dd>
      </dl>

      {(!present || state === "missing") && (
        <p role="alert">
          o diretório não está em {path}. Remover aqui só apaga o registro; a branch continua
          existindo.
        </p>
      )}

      {children}

      {confirmingForce ? (
        <div className="worktree-detail__confirm">
          {/* Explicit, and only after the daemon has already refused once: this
              is the click that can destroy uncommitted work. */}
          <p role="alert">{remove.error?.message ?? "isso descarta as alterações não salvas."}</p>
          <button type="button" onClick={() => remove.mutate(true)} disabled={remove.isPending}>
            remover mesmo assim
          </button>
          <button type="button" onClick={() => setConfirmingForce(false)}>
            cancelar
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
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
          </button>
          <p className="hint">a branch não é apagada</p>
        </>
      )}
    </section>
  );
}
