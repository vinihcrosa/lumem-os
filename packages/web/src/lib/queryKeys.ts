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

/**
 * The right panel's three questions.
 *
 * Prefixed by kind so the column's reload button can invalidate `["files"]` and
 * `["changes"]` wholesale — it means "read the disk again", not "read this one
 * directory again".
 */
export function fileListKey(scopeType: string, scopeId: string, path: string) {
  return ["files", "listDir", scopeType, scopeId, path] as const;
}

export function fileReadKey(scopeType: string, scopeId: string, path: string) {
  return ["files", "read", scopeType, scopeId, path] as const;
}

/**
 * What the confirmation of a delete asks before it asks the person (F5.7).
 *
 * Under the same `files` prefix as the rest, so the column's reload button
 * reaches it too — it describes the disk, and "read the disk again" includes it.
 */
export function filePreviewKey(scopeType: string, scopeId: string, path: string) {
  return ["files", "deletePreview", scopeType, scopeId, path] as const;
}

export function changesKey(scopeType: string, scopeId: string, ref: string) {
  return ["changes", "list", scopeType, scopeId, ref] as const;
}

export function patchKey(scopeType: string, scopeId: string, ref: string, path: string) {
  return ["changes", "patch", scopeType, scopeId, ref, path] as const;
}

/**
 * The clone jobs of a workspace, F5 of the PRD.
 *
 * Only the first render reads it: from there the dedicated subscription
 * carries the progress, because the coarse `events.onChange` channel says
 * which list is stale and progress is data with no list to invalidate.
 */
export function cloneJobsKey(workspaceId: string) {
  return ["project", "cloneJobs", workspaceId] as const;
}
