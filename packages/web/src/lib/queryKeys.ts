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

/** Uma busca. A pergunta entra na chave, senão duas buscas dividem cache. */
export function memorySearchKey(workspaceId: string | null, projectId: string | null, query: string) {
  return ["memory", "search", workspaceId ?? "-", projectId ?? "-", query] as const;
}

export const MEMORY_DECISIONS_KEY = ["memory", "decisions"] as const;
export const MEMORY_USAGE_KEY = ["memory", "usage"] as const;
export const MEMORY_SETTINGS_KEY = ["memory", "settings"] as const;

/**
 * O consumo de um escopo numa janela.
 *
 * A janela entra na chave porque ela é a pergunta: `7d` e `1m` são dois
 * resultados diferentes, e compartilhar cache entre eles mostraria o número de
 * uma janela sob o rótulo da outra.
 */
export function usageByProjectKey(workspaceId: string, period: string) {
  return ["usage", "byProject", workspaceId, period] as const;
}

export function usageByWorktreeKey(projectId: string, period: string) {
  return ["usage", "byWorktree", projectId, period] as const;
}

/** Os playbooks de um escopo. `archived` é filtro, e por isso entra na chave. */
export function playbooksKey(workspaceId: string | null, archived: boolean) {
  return ["memory", "playbooks", workspaceId ?? "-", archived ? "arquivados" : "ativos"] as const;
}

/**
 * The clone jobs of a workspace, F5 of project-from-url.
 *
 * Only the first render reads it: from there the dedicated subscription
 * carries the progress, because the coarse `events.onChange` channel says
 * which list is stale and progress is data with no list to invalidate.
 */
export function cloneJobsKey(workspaceId: string) {
  return ["project", "cloneJobs", workspaceId] as const;
}
