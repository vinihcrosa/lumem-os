/**
 * Every cache key in one place.
 *
 * Two components invalidating the same data with keys that differ by a
 * character is a bug that looks like a stale UI, and it is invisible in review.
 */
export const WORKSPACES_KEY = ["workspace", "list"] as const;

export const PTY_SESSIONS_KEY = ["pty", "list"] as const;

export function projectsKey(workspaceId: string) {
  return ["project", "listByWorkspace", workspaceId] as const;
}

export function worktreesKey(projectId: string) {
  return ["worktree", "listByProject", projectId] as const;
}

export function worktreeDetailKey(worktreeId: string) {
  return ["worktree", "detail", worktreeId] as const;
}

export function sessionsKey(scopeType: string, scopeId: string) {
  return ["session", "listByScope", scopeType, scopeId] as const;
}
