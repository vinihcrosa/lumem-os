import type { StorybookConfig } from "@storybook/react-vite";

/**
 * A galeria das primitivas.
 *
 * Substituiu a rota `/styleguide`, que fazia a mesma coisa à mão: uma página só
 * com toda primitiva em todo estado. O motivo da troca não é a galeria — é o
 * isolamento. Estado caro de alcançar no app de verdade (workspace sem acervo,
 * orçamento bloqueado, vinte modelos no seletor) vira uma story, e a anotação
 * visual do agentation funciona em cima dela igual funciona no produto.
 *
 * **Não tem `viteFinal`, e isso é a decisão e não a falta de uma.** O instinto
 * é escrever um: o `vite.config.ts` deste pacote é do aplicativo — prende a
 * porta e faz proxy de `/trpc`, `/pty` e `/acp` —, e parece que o Storybook
 * herdaria isso. Ele herda, e não dói: a porta vem do `-p` da linha de comando,
 * e um proxy para uma rota que a galeria nunca chama é inerte.
 *
 * Mexer aí custou caro uma vez. Um `delete config.server` de três palavras
 * derrubou o plugin que injeta o `vite-app.js` do preview, e o sintoma não
 * aponta para nada disso: o canvas gira **para sempre**, o console culpa
 * `allowedHosts`, e o `build-storybook` **passa** — o build não usa dev server.
 * O que estava quebrado era um 404 num script que o `iframe.html` deixou de
 * pedir.
 */
const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },

  stories: ["../src/**/*.stories.tsx"],

  // Este produto é local-first, e a `013` gastou meia PRD dizendo que o Lumem
  // não vê, não pede e não grava o que é seu. Uma ferramenta de dev que manda
  // telemetria por default contradiz isso dentro do próprio repositório.
  core: { disableTelemetry: true },
};

export default config;
