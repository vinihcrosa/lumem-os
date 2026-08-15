import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AddProjectDialog } from "./AddProjectDialog.js";
import { projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface ProjectListProps {
  workspaceId: string;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  /** Rendered under each project — the worktree tree. */
  renderChildren?: (project: { id: string; available: boolean }) => ReactNode;
}

/** The projects of the active workspace, F3.1. */
export function ProjectList({
  workspaceId,
  selectedId,
  onSelect,
  renderChildren,
}: ProjectListProps) {
  const projects = useQuery({
    queryKey: projectsKey(workspaceId),
    queryFn: () => trpc.project.listByWorkspace.query({ workspaceId }),
  });

  const list = projects.data ?? [];

  return (
    <div className="project-list">
      <h2>Projetos</h2>

      {projects.isError && <p role="alert">{projects.error.message}</p>}
      {!projects.isPending && list.length === 0 && <p>nenhum projeto ainda</p>}

      <ul aria-label="projetos">
        {list.map((project) => (
          <li key={project.id} data-available={project.available}>
            <button
              type="button"
              aria-current={project.id === selectedId}
              onClick={() => onSelect(project.id)}
            >
              {project.name}
              {/* PRD §8: it stays in the list. Vanishing would take the
                  worktrees registered under it out of sight too. */}
              {!project.available && <span title="repositório não está no disco"> (indisponível)</span>}
            </button>
            {renderChildren?.({ id: project.id, available: project.available })}
          </li>
        ))}
      </ul>

      <AddProjectDialog workspaceId={workspaceId} onAdded={onSelect} />
    </div>
  );
}
