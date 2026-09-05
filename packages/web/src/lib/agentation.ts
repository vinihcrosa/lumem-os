import type { AgentationProps } from "agentation";
import type { FunctionComponent } from "react";

/**
 * O anotador visual (https://www.agentation.com) montado só no dev.
 *
 * Ele é uma barra que fica por cima da aplicação: clicar num elemento vira uma
 * anotação com seletor, componente React e estilo computado, e o agente lê isso
 * pelo MCP `agentation-mcp` em vez de receber "o botão está torto" por texto.
 *
 * Fica fora do `App` de propósito. É ferramenta de desenvolvimento, não tela do
 * produto — montar na árvore da aplicação colocaria um portal de terceiro
 * dentro de cada teste de componente e dentro do `StrictMode` do produto.
 */

/** Porta padrão do `agentation-mcp server`, que serve o HTTP da barra. */
const DEFAULT_ENDPOINT = "http://127.0.0.1:4747";

/** Onde o portal da barra ancora. Fora do `#root`, para não entrar no diff da app. */
const CONTAINER_ID = "agentation-root";

type AgentationEnv = {
  DEV: boolean;
  VITE_AGENTATION?: string;
  VITE_AGENTATION_ENDPOINT?: string;
};

/**
 * Ligado no dev, desligado em qualquer outro lugar.
 *
 * O `VITE_AGENTATION=off` existe para o e2e: a barra é um elemento fixo que
 * captura clique, e o playwright não tem por que disputar a tela com ela.
 */
export function wantsAgentation(env: AgentationEnv): boolean {
  return env.DEV && env.VITE_AGENTATION !== "off";
}

/**
 * `undefined` desliga a sincronia e a barra passa a guardar só no localStorage —
 * é o que `VITE_AGENTATION_ENDPOINT=off` pede.
 */
export function agentationEndpoint(env: AgentationEnv): string | undefined {
  const configured = env.VITE_AGENTATION_ENDPOINT;
  if (configured === "off") return undefined;
  return configured === undefined || configured === "" ? DEFAULT_ENDPOINT : configured;
}

/**
 * Monta a barra, se for para montar.
 *
 * O `import()` é dinâmico e o guarda é estático: assim o rollup derruba o
 * pacote inteiro do build de produção, em vez de embarcar uma ferramenta de
 * dev no que o daemon serve.
 */
export async function mountAgentation(env: AgentationEnv = import.meta.env): Promise<void> {
  // O guarda estático primeiro, e o configurável depois: `import.meta.env.DEV`
  // vira `false` literal no build, o `return` vira código morto, e o rollup
  // derruba o `import()` abaixo junto com o pacote inteiro. Um teste da suíte
  // confere que o bundle de produção não menciona o agentation.
  if (!import.meta.env.DEV) return;
  if (!wantsAgentation(env)) return;

  const [{ Agentation }, { createRoot }, { createElement }] = await Promise.all([
    import("agentation"),
    import("react-dom/client"),
    import("react"),
  ]);

  /*
   * O componente é declarado com as props inteiras opcionais, e aí o
   * `createElement` infere `Attributes` e recusa `endpoint`. O tipo abaixo é o
   * mesmo contrato, escrito de um jeito que a inferência aceita.
   */
  const Toolbar = Agentation as FunctionComponent<AgentationProps>;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.append(container);

  createRoot(container).render(createElement(Toolbar, { endpoint: agentationEndpoint(env) }));
}
