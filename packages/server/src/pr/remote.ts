import type { GitService } from "../git/GitService.js";

/**
 * De onde o host é descoberto (`013` F4.2).
 *
 * O banco vem primeiro porque é o que o clone gravou, e ele é o único caso em
 * que o endereço que interessa pode não ser o `origin` do disco. Quando ele é
 * nulo — que é o caso de **todo projeto adicionado por caminho** — a pergunta
 * vai ao git.
 *
 * **Mora aqui, e não dentro do router, porque a segunda metade já foi esquecida
 * duas vezes.** A primeira foi na `013`: a barra dizia *"sem integração"* para
 * um repositório do GitHub inteiramente comum, e foi o e2e que achou. A segunda
 * foi na esteira (`028` Parte 7), que lia `project.remoteUrl` cru em três
 * lugares — o portão, a abertura da PR e a publicação da anotação —, e por isso
 * **nunca abria PR nem comentava nada** num projeto adicionado por caminho.
 */
export function remoteOf(
  git: Pick<GitService, "getRemoteUrl">,
  project: { path: string; remoteUrl: string | null },
): Promise<string | null> {
  return project.remoteUrl !== null
    ? Promise.resolve(project.remoteUrl)
    : git.getRemoteUrl(project.path);
}
