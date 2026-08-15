import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { CreateWorktreeDialog } from "./CreateWorktreeDialog.js";
import { worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface WorktreeTreeProps {
  projectId: string;
  /** False when the repository left the disk: creating from it cannot work. */
  projectAvailable: boolean;
  selectedId: string | null;
  onSelect: (worktreeId: string) => void;
  /** Rendered under each worktree — the session list, from T31 on. */
  renderChildren?: (worktreeId: string) => ReactNode;
}

/** Worktrees nested under their project, F3.2 and F3.3. */
export function WorktreeTree({
  projectId,
  projectAvailable,
  selectedId,
  onSelect,
  renderChildren,
}: WorktreeTreeProps) {
  const worktrees = useQuery({
    queryKey: worktreesKey(projectId),
    queryFn: () => trpc.worktree.listByProject.query({ projectId }),
    enabled: projectAvailable,
  });

  if (!projectAvailable) {
    return <p className="worktree-tree__blocked">repositório indisponível</p>;
  }

  const list = worktrees.data ?? [];

  return (
    <div className="worktree-tree">
      <ul aria-label={`worktrees de ${projectId}`}>
        {list.map((worktree) => (
          <li key={worktree.id} data-state={worktree.state}>
            <button
              type="button"
              aria-current={worktree.id === selectedId}
              onClick={() => onSelect(worktree.id)}
            >
              {worktree.name} <small>{worktree.branch}</small>
              {/* F7.4: it stays visible and says so, instead of disappearing. */}
              {worktree.state === "missing" && <span> (ausente)</span>}
            </button>
            {renderChildren?.(worktree.id)}
          </li>
        ))}
      </ul>

      {worktrees.isError && <p role="alert">{worktrees.error.message}</p>}

      <CreateWorktreeDialog projectId={projectId} onCreated={onSelect} />
    </div>
  );
}
