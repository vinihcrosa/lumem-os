import { eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import type { GitService } from "../git/GitService.js";
import { project, worktree } from "../db/schema.js";
import type { PrCache } from "../pr/PrCache.js";
import { remoteOf } from "../pr/remote.js";
import { decide, type GhPullRequest } from "../pr/verdict.js";

import type { PrLike } from "./conveyor-ports.js";

/**
 * As duas costuras que a esteira precisa e que ninguém mais precisa
 * (`028` Parte 2, T26 e T28).
 *
 * Elas moram fora do `conveyor-ports.ts` porque as duas dependem de coisas que
 * a esteira não deveria conhecer — o git e o cache de PR —, e o arquivo de
 * portas já é a fronteira. Aqui é a costura da costura. A terceira, a
 * configuração de agente por adaptador, foi para o repositório dela (`033` T4).
 */

/**
 * O veredito da PR **desta worktree**, ou `null`.
 *
 * `null` quer dizer *não há PR*, e é a resposta da maioria dos turnos. Nenhum
 * dos caminhos de falha vira exceção: o portão trata ausência como *não segura
 * nada*, e derrubar a passada da esteira porque o `gh` não está instalado seria
 * transformar uma metade opcional do portão num requisito.
 *
 * A consulta é **por projeto**, que é a decisão da [`013`]: oito worktrees
 * custam um processo, não oito. O que sobra aqui é achar, entre as PRs do
 * projeto, a que tem a branch deste checkout.
 */
export async function verdictOfWorktree(
  db: Db,
  git: Pick<GitService, "getRemoteUrl">,
  pr: PrCache,
  worktreeId: string,
): Promise<PrLike> {
  const found = await pullOfWorktree(db, git, pr, worktreeId);
  return found === null ? null : decide(found).verdict;
}

/**
 * O **número** da PR desta worktree, ou `null` (`028` Parte 7 — T55).
 *
 * Duas perguntas sobre o mesmo instantâneo: o portão pergunta *"está verde?"* e
 * a publicação da anotação pergunta *"em qual PR eu escrevo?"*. Sai da mesma
 * leitura por projeto, e por isso não custa um segundo processo.
 */
export async function numberOfWorktree(
  db: Db,
  git: Pick<GitService, "getRemoteUrl">,
  pr: PrCache,
  worktreeId: string,
): Promise<number | null> {
  const found = await pullOfWorktree(db, git, pr, worktreeId);
  return found?.number ?? null;
}

/** A PR cuja head é a branch deste checkout, no instantâneo do projeto. */
async function pullOfWorktree(
  db: Db,
  git: Pick<GitService, "getRemoteUrl">,
  pr: PrCache,
  worktreeId: string,
): Promise<GhPullRequest | null> {
  try {
    const checkout = await db.query.worktree.findFirst({ where: eq(worktree.id, worktreeId) });
    if (!checkout) return null;
    const owner = await db.query.project.findFirst({ where: eq(project.id, checkout.projectId) });
    if (!owner) return null;

    const entry = await pr.get({
      id: owner.id,
      path: owner.path,
      /*
       * Resolvido como a barra resolve, e não lido cru do banco: `remoteUrl` é
       * nulo em **todo projeto adicionado por caminho**, e ler a coluna fazia a
       * esteira nunca ver PR nenhuma nesses projetos — que são a maioria.
       */
      remoteUrl: await remoteOf(git, owner),
    });
    return entry.snapshot?.pulls.find((pull) => pull.headRefName === checkout.branch) ?? null;
  } catch {
    return null;
  }
}
