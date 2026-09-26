import { useSyncExternalStore } from "react";

/**
 * O roteamento do produto, e ele é este arquivo inteiro (`030-settings`, F1).
 *
 * Até aqui o aplicativo **não tinha rota nenhuma**: `/styleguide` era o único
 * caminho lido, e só em DEV, no `main.tsx`. Tudo o mais era estado React, e o
 * daemon já devolvia o mesmo shell para qualquer caminho — as duas pontas
 * estavam prontas e faltava o meio.
 *
 * **Três endereços, escritos à mão** ([Q2](../../../../docs/features/030-settings/open-questions.md)).
 * A pergunta tinha três níveis dentro dela e esta é a resposta do primeiro: só a
 * tela. Workspace, projeto e checkout na URL são o N3, e viraram feature própria
 * — a `LUM-63`, que é onde as ADRs de roteamento vão nascer.
 *
 * **Sem biblioteca, e a razão é a assimetria:** com três caminhos literais e
 * zero parâmetros, o que uma biblioteca entrega a mais é exatamente o que o N3
 * vai precisar. Trocar este arquivo por `wouter` (77 KB, zero dependências)
 * depois é uma tarde; tirar `react-router` (4,79 MB e duas dependências) depois
 * não é.
 *
 * **Nada de casamento genérico de padrão aqui.** Uma função que entendesse
 * `:param` seria metade do N3 escrita antes das perguntas dele — id opaco na
 * URL, link morto para worktree removida, quem manda quando a URL e o
 * `localStorage` discordam.
 */

/** As três telas que têm endereço. O checkout não é uma delas — ver `navigate`. */
export type Route = "home" | "tasks" | "settings";

/**
 * O caminho de cada uma, em inglês.
 *
 * Convenção de **2026-09-14** do `CLAUDE.md`: caminho é identificador, como nome
 * de arquivo e nome de variável — o rótulo `Configurações` é que se traduz. A
 * alternativa é caminho localizado, e ela custa o mesmo lugar com dois endereços.
 */
export const ROUTE_PATH: Record<Route, string> = {
  home: "/",
  tasks: "/tasks",
  settings: "/settings",
};

/**
 * Que tela um caminho pede.
 *
 * Qualquer coisa que não seja `/tasks` ou `/settings` é `home`, inclusive um
 * caminho que ninguém escreveu. É a mesma escolha que o daemon já fez ao servir
 * o shell para qualquer rota: um endereço desconhecido abre o aplicativo, e não
 * uma página de erro que o produto não tem.
 */
export function routeOf(pathname: string): Route {
  const path = normalize(pathname);
  if (path === ROUTE_PATH.tasks) return "tasks";
  if (path === ROUTE_PATH.settings) return "settings";
  return "home";
}

/** Sem a barra final, para `/tasks/` e `/tasks` serem o mesmo lugar. */
function normalize(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * O que avisa a aplicação de que o caminho mudou.
 *
 * `popstate` só dispara quando **o navegador** navega — voltar, avançar. Um
 * `pushState` nosso não dispara nada, então sem este evento a barra de endereço
 * mudaria e a tela não: o defeito mais comum de um roteador escrito à mão, e
 * ele é silencioso.
 */
const ROUTE_EVENT = "lumem:route";

export interface NavigateOptions {
  /**
   * Substituir em vez de empilhar.
   *
   * É o que o gesto de **selecionar um checkout** usa. O checkout é seleção, não
   * lugar: com `push`, o botão voltar viraria *desfazer seleção*, e uma sessão
   * normal de trabalho encheria o histórico de entradas que ninguém pediu.
   */
  replace?: boolean;
}

export function navigate(route: Route, { replace = false }: NavigateOptions = {}): void {
  const path = ROUTE_PATH[route];
  if (normalize(window.location.pathname) === path) return;

  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);

  window.dispatchEvent(new Event(ROUTE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
}

/**
 * Onde a aplicação está, lida do caminho.
 *
 * `useSyncExternalStore` e não `useState` mais `useEffect`: o valor do
 * **primeiro** render precisa ser o caminho de verdade. Com estado e efeito,
 * abrir `/settings` direto na barra de endereço desenharia o Home por um quadro
 * antes de trocar — a piscada que a F1 existe para não ter.
 */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, currentRoute, currentRoute);
}

function currentRoute(): Route {
  return routeOf(window.location.pathname);
}
