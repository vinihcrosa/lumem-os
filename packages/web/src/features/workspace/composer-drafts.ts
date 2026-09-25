/**
 * O rascunho por projeto do compositor de nova worktree (`033` F4.3, Q1).
 *
 * Memória de módulo, e não `localStorage` — a resposta literal da Q1: fechar o
 * MODAL guarda o texto por projeto enquanto a aba do navegador estiver aberta;
 * `F5` perde. O molde é o de `lib/navigation.ts`: um estado de módulo, não um
 * contexto React, porque `worktree.start` nasce fora de qualquer componente —
 * a worktree só existe depois do `Create`, e até lá não há nada para guardar o
 * texto dentro.
 */

const projectDrafts = new Map<string, string>();

/** O que ficou digitado para este projeto, ou vazio se nada ficou. */
export function draftFor(projectId: string): string {
  return projectDrafts.get(projectId) ?? "";
}

/** Vazio some do mapa — um projeto sem rascunho não deve crescer para sempre. */
export function setDraftFor(projectId: string, text: string): void {
  if (text === "") projectDrafts.delete(projectId);
  else projectDrafts.set(projectId, text);
}

/**
 * Só para teste: devolve o mapa ao estado inicial entre `it`s.
 *
 * A mesma armadilha do `lib/navigation.ts`: estado de módulo é o que faz
 * `draftFor`/`setDraftFor` chamáveis de qualquer lugar sem contexto, e é
 * exatamente isso que vaza um rascunho de um teste para o seguinte dentro do
 * mesmo arquivo sem este reset no `afterEach` global.
 */
export function resetComposerDraftsForTests(): void {
  projectDrafts.clear();
}
