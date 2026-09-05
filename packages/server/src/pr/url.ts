/**
 * Nenhuma URL vira link sem passar por aqui. **Ela veio da internet.**
 *
 * O §4.6 do PRD escreve a regra em uma frase: esquema `https`, e host **igual ao
 * host do remote** do projeto. Uma pull request pode conter link para qualquer
 * lugar — corpo, comentário, `detailsUrl` de um check de app de terceiro —, e o
 * `↗` do Lumem só leva ao host de onde o dado veio.
 *
 * O que uma URL recusada produz não é uma exceção: é uma linha **sem link**, que
 * é o que a F2.4 pede que aconteça.
 */

/**
 * A URL, ou `null`.
 *
 * `null` e não exceção porque recusar é o caso **normal** — um check do Vercel
 * aponta para `vercel.com`, e isso não é ataque, é a vida. A tela sabe desenhar
 * uma linha sem `↗`; ela não sabe desenhar um `throw`.
 */
export function safeUrl(candidate: string | null | undefined, host: string | null): string | null {
  if (candidate === null || candidate === undefined || candidate.trim() === "") return null;
  if (host === null || host === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return null;
  }

  // `https:` e só. `http:` é o mesmo host sem TLS, e `javascript:` é o motivo
  // pelo qual uma lista de permitidos é a única forma correta aqui.
  if (parsed.protocol !== "https:") return null;
  // Credencial numa URL que vai virar `href` é exatamente o que ninguém quer
  // ver num histórico de navegador.
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.hostname.toLowerCase() !== host.toLowerCase()) return null;

  return parsed.href;
}

/**
 * `org/repo`, e nada mais.
 *
 * `nameWithOwner` vem do `gh`, ou seja **da rede**, e ele é concatenado dentro
 * de uma URL. Sem esta forma, um valor com `@` no meio move o host da URL
 * montada para outro lugar — e a validação de `safeUrl` aprova, porque o host
 * que ela lê já é o outro. Foi o teste que achou.
 */
const NAME_WITH_OWNER = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A tela de comparação do host, montada **no daemon** (F5.4).
 *
 * Ela não vem do payload por um motivo simples: ela não existe no payload. É
 * uma URL que o Lumem sabe construir a partir de três coisas que ele já tem — o
 * host, a base e a head — e construir é mais seguro que confiar.
 *
 * `encodeURIComponent` em cada ref porque nome de branch aceita coisas que uma
 * URL não aceita: `feat/algo`, `fix#12`, `wip?`. Uma barra em `feat/algo` é
 * legítima como caminho e ilegítima como separador de compare — e é o tipo de
 * coisa que funciona com todo nome de branch que alguém testou à mão.
 */
export function compareUrl(input: {
  host: string | null;
  repo: string;
  base: string;
  head: string;
}): string | null {
  const { host, repo, base, head } = input;
  if (host === null || host === "" || base === "" || head === "") return null;
  if (!NAME_WITH_OWNER.test(repo)) return null;
  if (base === head) return null;

  const url = `https://${host}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1`;
  // Pela mesma porta que todo o resto: a URL que o daemon monta obedece a mesma
  // regra que a URL que ele recebeu. Um `repo` estranho vindo do `gh` não pode
  // sair daqui como link só porque fomos nós que concatenamos.
  return safeUrl(url, host);
}
