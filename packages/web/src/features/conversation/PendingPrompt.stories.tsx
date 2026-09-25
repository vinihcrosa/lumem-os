import type { Meta, StoryObj } from "@storybook/react-vite";

import { Glyph } from "../../ui/index.js";
import { PendingPrompt, type PendingPromptProps } from "./PendingPrompt.js";

/**
 * O primeiro prompt segurado pelo `setup` (`033` F4.5, F4.6), dentro da
 * conversa que o `Create` do compositor abriu.
 *
 * O composer da moldura está travado como a T21 o deixa enquanto há
 * pendência: o prompt já foi escrito, e um segundo texto não tem para onde ir
 * antes de o primeiro sair.
 */

const PROMPT =
  "O login quebra no Safari quando a sessão expira no meio de um formulário: o redirect para /login " +
  "perde o parâmetro `next`, e quem volta cai na home.\n\n" +
  "Reproduza primeiro com o cookie de sessão encurtado para um minuto, e escreva o teste que falha " +
  "antes de mexer em qualquer coisa.";

function Frame(props: PendingPromptProps) {
  return (
    <div className="sg__pane">
      <div className="conv">
        <div className="conv__head">
          <span className="conv__who">
            <Glyph tone="agent">◆</Glyph>
            Claude Code
          </span>
          <span className="conv__adapter">sessão d81b05ee · opus[1m] · default</span>
        </div>
        <div className="conv__scroll">
          <PendingPrompt {...props} />
        </div>
        <div className="composer">
          <div className="composer__box">
            <textarea
              className="composer__in composer__in--empty"
              disabled
              aria-label="mensagem para o agente"
              placeholder="o primeiro prompt espera o setup"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof PendingPrompt> = {
  title: "Conversa/PendingPrompt",
  component: PendingPrompt,
};

export default meta;

type Story = StoryObj<typeof PendingPrompt>;

/** O `setup` rodando: o texto esmaecido, e o atalho para acompanhar no rodapé. */
export const Preparando: Story = {
  name: "Preparando worktree",
  render: () => <Frame prompt={PROMPT} reason={null} onShowSetup={() => undefined} />,
};

/** O `setup` saiu com 1: o prompt não saiu, e a decisão é de quem escreveu. */
export const SetupFalhou: Story = {
  name: "Setup falhou",
  render: () => (
    <Frame
      prompt={PROMPT}
      reason="setup_failed"
      setupExit={1}
      onShowSetup={() => undefined}
      onSendAnyway={() => undefined}
      onEdit={() => undefined}
    />
  ),
};
