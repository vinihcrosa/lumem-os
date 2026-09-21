import type { Preview } from "@storybook/react-vite";

// Mesma ordem do `main.tsx`: tokens antes da base, porque a base os consome.
import "../src/styles/tokens.css";
import "../src/styles/fonts.css";
import "../src/styles/base.css";
import "../src/ui/ui.css";
import "../src/ui/modal.css";
import "../src/components/board.css";
import "../src/ui/stories.css";

import { mountAgentation } from "../src/lib/agentation.js";

/**
 * O anotador visual, montado aqui pelo mesmo motivo que no `main.tsx`: clicar
 * num elemento vira anotação com seletor, componente e estilo computado, e o
 * agente lê pelo MCP em vez de receber "o botão está torto" por texto.
 *
 * Fora do `decorators` de propósito. Ele é um portal de terceiro no `body`, e
 * montá-lo por story o remontaria a cada troca de story.
 */
void mountAgentation();

const preview: Preview = {
  parameters: {
    // O fundo é `--color-bg-base`, aplicado no `body` pela `base.css`. O
    // seletor de fundo do Storybook pintaria por cima com um cinza que não é
    // token nenhum, e aí a galeria deixaria de ser o que o produto mostra.
    backgrounds: { disable: true },
    controls: { disable: true },
  },
  decorators: [
    /*
     * A mesma moldura que a `/styleguide` dava a cada bloco. Está aqui, e não
     * em cada story, porque uma primitiva medida numa faixa larga demais mente
     * sobre onde ela quebra — e "lembrar de embrulhar" é o tipo de regra que
     * a próxima story esquece.
     */
    (Story) => (
      <div className="sg__body">
        <Story />
      </div>
    ),
  ],
};

export default preview;
