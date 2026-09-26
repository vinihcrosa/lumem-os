import type { GitService } from "../git/GitService.js";

/**
 * O `Done` que limpa (`028` §6, Parte 4 — T40 · [Q27] e [Q58]).
 *
 * **Quem remove é o gesto**, e não a esteira: o §4 é explícito em que `Done` é
 * **seu**, e não existe caminho em que uma tarefa chegue lá sem alguém a ter
 * posto. A esteira para em `ready_to_merge` de propósito.
 *
 * **E o daemon recusa; quem oferece o que fazer com a recusa é a tela.** É a
 * mesma forma do portão de confiança da [`012`](../../../../docs/features/012-project-scripts/prd.md),
 * e é o que impede o diálogo de virar o que a Q27 recusou: *"um modal que
 * aparece sempre é um modal que se aprende a clicar sem ler"*.
 */

export type CleanupDecision =
  /** Some sem perguntar: não há nada a perder. */
  | { kind: "remove"; reason: string }
  /** Fica, e a frase diz por quê — em uma linha, e com número quando há. */
  | { kind: "keep"; reason: string };

export interface CleanupFacts {
  /** `git status` está limpo. */
  clean: boolean;
  /** Quantos arquivos têm mudança. É o número que a frase precisa. */
  changedFiles: number;
  /** A branch foi mesclada — pela PR ou pelo `git`. */
  merged: boolean;
  /** O interruptor do workspace: *"PR mesclada sempre remove"*. */
  alwaysRemovesWhenMerged: boolean;
}

/**
 * Função pura, e é onde a Q27 mora inteira.
 *
 * Os três casos que ela decidiu, em ordem de risco:
 *
 * 1. **limpo e mesclado** → remove sem perguntar. Não há nada a perder;
 * 2. **sujo e mesclado, com o interruptor ligado** → remove. Você autorizou,
 *    lendo, e o texto do interruptor diz o que você autorizou;
 * 3. **qualquer outra coisa** → fica, e a frase diz o quê.
 */
export function decideCleanup(facts: CleanupFacts): CleanupDecision {
  /*
   * Não mesclada **nunca** remove, nem com o interruptor.
   *
   * O interruptor se chama *"PR mesclada sempre remove"*, e estendê-lo para o
   * não mesclado seria o produto fazendo mais do que a frase que você leu
   * autorizava. Um commit que só existe naquela branch é trabalho perdido do
   * mesmo jeito que um arquivo não commitado.
   */
  if (!facts.merged) {
    return {
      kind: "keep",
      reason: facts.clean
        ? "a branch ainda não foi mesclada"
        : `a branch ainda não foi mesclada, e há ${filesLabel(facts.changedFiles)}`,
    };
  }

  if (facts.clean) return { kind: "remove", reason: "mesclada e sem nada pendente" };

  if (facts.alwaysRemovesWhenMerged) {
    return { kind: "remove", reason: `mesclada — ${filesLabel(facts.changedFiles)} descartados` };
  }

  // A frase **diz o que se perde**, que é a emenda inteira da Q27: um aviso que
  // não nomeia o custo é um aviso que se aprende a aceitar.
  return { kind: "keep", reason: `há ${filesLabel(facts.changedFiles)} na worktree` };
}

function filesLabel(count: number): string {
  return count === 1 ? "1 arquivo não commitado" : `${String(count)} arquivos não commitados`;
}

/** O que o disco responde, para a decisão acima. */
export async function cleanupFactsOf(
  git: GitService,
  { path, branch, baseBranch }: { path: string; branch: string; baseBranch: string },
): Promise<Omit<CleanupFacts, "alwaysRemovesWhenMerged">> {
  const status = await git.getStatus(path);
  /*
   * Mesclada é *"a base já tem o que esta branch tem"*, e é o que
   * `getAheadBehind` responde: `ahead === 0` quer dizer que não há commit aqui
   * que lá não tenha.
   *
   * Ler assim é de propósito e é mais forte que perguntar ao `gh`: vale para
   * quem mesclou pela PR, para quem mesclou na mão, e para quem nunca abriu PR
   * nenhuma — e não depende de o `gh` estar instalado, o que o
   * [ADR de 2026-08-30](../../../../docs/adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)
   * deixa ser uma ausência legítima.
   */
  const ahead = await git
    .getAheadBehind(path, baseBranch)
    .catch(() => ({ ahead: 1, behind: 0 }));
  void branch;
  return { clean: status.clean, changedFiles: status.changedFiles, merged: ahead.ahead === 0 };
}
