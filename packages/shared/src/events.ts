/**
 * What the daemon tells the client changed, PRD F3.7.
 *
 * Coarse on purpose: the event says *which list* is stale, not what the new
 * contents are. Sending the data would mean two sources of truth for the same
 * rows, and the client already knows how to fetch — it just does not know when.
 *
 * Named here, and not in `server/` or `web/`, so a variant nobody handles on
 * either side is a typecheck failure on **that** side and not a redeclaration
 * quietly drifting from the original (`032` T7) — the same property `AcpEvent`
 * already has.
 */
export type LumemEvent =
  | { type: "workspace.changed" }
  | { type: "project.changed"; workspaceId: string }
  | { type: "worktree.changed"; projectId: string }
  /**
   * O estado das pull requests deste projeto mudou (pull-request-status F6.3).
   *
   * Emitido quando a leitura do host **renova com dado diferente** — e não a
   * cada renovação: o poll acontece de minuto em minuto e quase sempre traz o
   * mesmo instantâneo, e um evento por leitura seria a tela redesenhando por
   * nada. Ele existe para a barra não depender só do relógio dela, que é o que
   * faz um merge feito em outra aba aparecer nesta.
   */
  | { type: "pr.changed"; projectId: string }
  | { type: "session.changed"; scopeType: "project" | "worktree"; scopeId: string }
  /**
   * As tarefas deste workspace mudaram (`022-workspace-tasks` F1).
   *
   * Por workspace e não por projeto, ao contrário do `worktree.changed`: a lista
   * é do workspace e atravessa projetos, e um evento por projeto faria a tela
   * que mostra todos recarregar por um que ela não está mostrando.
   */
  | { type: "task.changed"; workspaceId: string };
