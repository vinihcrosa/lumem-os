import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface ProjectDetailProps {
  projectId: string;
  workspaceId: string;
  onRemoved: () => void;
  /** Worktree actions, from T24 on. Hidden while the repository is missing. */
  children?: ReactNode;
}

/** What the main area shows for a selected project, F3.6. */
export function ProjectDetail({
  projectId,
  workspaceId,
  onRemoved,
  children,
}: ProjectDetailProps) {
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
  });

  const remove = useMutation({
    mutationFn: () => trpc.project.remove.mutate({ id: projectId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
      onRemoved();
    },
  });

  if (project.isPending) return <p>carregando…</p>;
  if (!project.data) return <p>projeto não encontrado</p>;

  const { name, path, defaultBranch, available } = project.data;

  return (
    <section className="project-detail">
      <h2>{name}</h2>
      <dl>
        <dt>caminho</dt>
        <dd>{path}</dd>
        <dt>branch default</dt>
        <dd>{defaultBranch}</dd>
      </dl>

      {!available && (
        <p role="alert">
          o repositório não está mais em {path}. As ações sobre ele ficam bloqueadas até
          que ele volte; o registro continua aqui.
        </p>
      )}

      {/* Blocked, not hidden-and-forgotten: the registration is still the
          user's, and removing it is exactly how they recover. */}
      {available && children}

      <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending}>
        {remove.isPending ? "removendo…" : "remover projeto"}
      </button>
      <p className="hint">remover não apaga nada do disco</p>

      {remove.isError && <p role="alert">{remove.error.message}</p>}
    </section>
  );
}
