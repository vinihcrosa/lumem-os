import { describe, expect, it } from "vitest";

import * as keys from "./queryKeys.js";

/**
 * O sensor de `queryKeys.ts` (`032` T6): a lista de prefixos é fechada, e nenhum
 * deles existe só do lado de quem invalida — um prefixo que ninguém lê é a lista
 * mentindo para o outro lado.
 *
 * A prova de que o login **alcança** quem lê `agentConfigsKey()` é um teste de
 * componente, e por isso não mora aqui: este arquivo é `lib/`, e a regra 2 do
 * sensor (`architecture.test.ts`) proíbe `lib/` de importar tela. Ela está em
 * `components/agent-login.test.tsx`, ao lado da fixture que já monta o rodapé.
 */
const CLOSED_PREFIXES = [
  "workspace",
  "project",
  "worktree",
  "task",
  "session",
  "scripts",
  "files",
  "changes",
  "memory",
  "usage",
  "pr",
  "agentConfig",
  "secrets",
  "setup",
  "health",
  "pty",
] as const;

/**
 * O primeiro elemento de cada chave de leitura — a chamada real, com um
 * argumento qualquer: o prefixo é literal no corpo da função, e nunca depende
 * do valor passado.
 */
const READ_PREFIX: Readonly<Record<string, string>> = {
  WORKSPACES_KEY: keys.WORKSPACES_KEY[0],
  PTY_SESSIONS_KEY: keys.PTY_SESSIONS_KEY[0],
  projectsKey: keys.projectsKey("x")[0],
  worktreesKey: keys.worktreesKey("x")[0],
  tasksKey: keys.tasksKey("x")[0],
  taskDetailKey: keys.taskDetailKey("x")[0],
  boardKey: keys.boardKey("x", "y")[0],
  taskSettingsKey: keys.taskSettingsKey("x")[0],
  worktreeBranchesKey: keys.worktreeBranchesKey("x")[0],
  worktreeHostOriginsKey: keys.worktreeHostOriginsKey("x")[0],
  projectDetailKey: keys.projectDetailKey("x")[0],
  worktreeDetailKey: keys.worktreeDetailKey("x")[0],
  sessionsKey: keys.sessionsKey("x", "y")[0],
  scriptsKey: keys.scriptsKey("x", "y")[0],
  fileListKey: keys.fileListKey("x", "y", "z")[0],
  fileListingKey: keys.fileListingKey("x", "y", "z", undefined)[0],
  fileReadKey: keys.fileReadKey("x", "y", "z")[0],
  filePreviewKey: keys.filePreviewKey("x", "y", "z")[0],
  changesKey: keys.changesKey("x", "y", "z")[0],
  patchKey: keys.patchKey("x", "y", "z", "w")[0],
  memoryListKey: keys.memoryListKey(null, null)[0],
  memoryProposalsKey: keys.memoryProposalsKey("pending")[0],
  memoryCoreKey: keys.memoryCoreKey(null, null)[0],
  memorySearchKey: keys.memorySearchKey(null, null, "x")[0],
  MEMORY_DECISIONS_KEY: keys.MEMORY_DECISIONS_KEY[0],
  MEMORY_USAGE_KEY: keys.MEMORY_USAGE_KEY[0],
  MEMORY_SETTINGS_KEY: keys.MEMORY_SETTINGS_KEY[0],
  usageByProjectKey: keys.usageByProjectKey("x", "7d")[0],
  usageByWorktreeKey: keys.usageByWorktreeKey("x", "7d")[0],
  usageByProjectAndAgentKey: keys.usageByProjectAndAgentKey("x", "7d")[0],
  playbooksKey: keys.playbooksKey(null, false)[0],
  cloneJobsKey: keys.cloneJobsKey("x")[0],
  prStatusKey: keys.prStatusKey("x")[0],
  prMarksKey: keys.prMarksKey("x")[0],
  prDraftKey: keys.prDraftKey("x")[0],
  HEALTH_KEY: keys.HEALTH_KEY[0],
  agentConfigsKey: keys.agentConfigsKey()[0],
  secretsKey: keys.secretsKey()[0],
  setupAgentsKey: keys.setupAgentsKey()[0],
  setupProbeKey: keys.setupProbeKey()[0],
  PREFLIGHT_KEY: keys.PREFLIGHT_KEY[0],
  authStateKey: keys.authStateKey("x")[0],
  projectInspectKey: keys.projectInspectKey("x")[0],
  worktreePlanKey: keys.worktreePlanKey("x", "y")[0],
  parseSourceKey: keys.parseSourceKey("x", "y", "z")[0],
  taskByWorktreeKey: keys.taskByWorktreeKey("x")[0],
  sessionsByTaskKey: keys.sessionsByTaskKey("x")[0],
  usageByTaskKey: keys.usageByTaskKey("x")[0],
};

/** Os prefixos que só existem do lado de quem invalida. */
const INVALIDATION_PREFIX: Readonly<Record<string, string>> = {
  MEMORY_PREFIX: keys.MEMORY_PREFIX[0],
  PR_PREFIX: keys.PR_PREFIX[0],
  FILES_PREFIX: keys.FILES_PREFIX[0],
  CHANGES_PREFIX: keys.CHANGES_PREFIX[0],
  WORKTREE_PREFIX: keys.WORKTREE_PREFIX[0],
  SESSION_PREFIX: keys.SESSION_PREFIX[0],
  SECRETS_PREFIX: keys.SECRETS_PREFIX[0],
  PROJECT_DETAIL_PREFIX: keys.PROJECT_DETAIL_PREFIX[0],
  TASK_DETAIL_PREFIX: keys.TASK_DETAIL_PREFIX[0],
  TASK_BOARD_PREFIX: keys.TASK_BOARD_PREFIX[0],
  TASK_SETTINGS_PREFIX: keys.TASK_SETTINGS_PREFIX[0],
};

describe("os prefixos de queryKeys.ts", () => {
  it("toda chave exportada começa por um prefixo da lista fechada", () => {
    for (const [name, prefix] of [
      ...Object.entries(READ_PREFIX),
      ...Object.entries(INVALIDATION_PREFIX),
    ]) {
      expect(CLOSED_PREFIXES, `${name} usa o prefixo "${prefix}"`).toContain(prefix);
    }
  });

  it("nenhum prefixo existe só em invalidação", () => {
    const read = new Set(Object.values(READ_PREFIX));
    for (const [name, prefix] of Object.entries(INVALIDATION_PREFIX)) {
      expect(read.has(prefix), `${name}: nenhuma chave de leitura usa "${prefix}"`).toBe(true);
    }
  });
});
