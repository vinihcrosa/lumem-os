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

export function projectDetailKey(projectId: string) {
  return ["project", "detail", projectId] as const;
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
 * As quatro perguntas da memória.
 *
 * Prefixadas por `memory` para que aprovar uma proposta possa invalidar
 * `["memory"]` inteiro de uma vez: aprovar muda a lista, muda a inbox, muda a
 * linha do tempo e muda os números — e invalidar três de quatro é como uma tela
 * passa a discordar de si mesma.
 */
export function memoryListKey(workspaceId: string | null, projectId: string | null) {
  return ["memory", "list", workspaceId ?? "-", projectId ?? "-"] as const;
}

export function memoryProposalsKey(status: string) {
  return ["memory", "proposals", status] as const;
}

/** A marca d'água do núcleo, por escopo — muda quando alguém fixa ou desfixa. */
export function memoryCoreKey(workspaceId: string | null, projectId: string | null) {
  return ["memory", "core", workspaceId ?? "-", projectId ?? "-"] as const;
}

export const MEMORY_DECISIONS_KEY = ["memory", "decisions"] as const;
export const MEMORY_USAGE_KEY = ["memory", "usage"] as const;
export const MEMORY_SETTINGS_KEY = ["memory", "settings"] as const;
