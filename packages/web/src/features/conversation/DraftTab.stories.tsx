import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import {
  CLAUDE_VIEW,
  CLAUDE_VIEW_WITH_COMMANDS,
  CODEX_NO_LOGIN_VIEW,
  CODEX_VIEW,
} from "../../test/adapter-catalog-fixtures.js";
import type { AgentModelChoice } from "./agent-model.js";
import { DraftTab } from "./DraftTab.js";

/**
 * A aba rascunho (`033` F5) — a conversa antes de existir sessão.
 *
 * Numa moldura com a altura da coluna do meio (`.sg__pane`), para o composer
 * ficar no pé e o menu abrir para cima sobre a conversa, como no produto.
 * Presentacional: nada sobe, nenhum `trpc` é chamado.
 */

const WORKTREE = "corrigir-o-login-no-safari";

const PROMPT =
  "O login quebra no Safari quando a sessão expira no meio de um formulário: o redirect para /login " +
  "perde o parâmetro `next`. Reproduza primeiro e escreva o teste que falha antes de mexer em qualquer coisa.";

function Stage({
  catalog,
  initialDraft = "",
  initialChoice = { adapterId: "claude", config: {} },
  opening = false,
  error = null,
}: {
  catalog: readonly AdapterCatalogView[];
  initialDraft?: string;
  initialChoice?: AgentModelChoice;
  opening?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [choice, setChoice] = useState(initialChoice);
  return (
    <div className="sg__pane">
      <DraftTab
        worktreeName={WORKTREE}
        catalog={catalog}
        choice={choice}
        onChoiceChange={setChoice}
        draft={draft}
        onDraftChange={setDraft}
        onSend={() => undefined}
        opening={opening}
        error={error}
        onLogin={() => undefined}
      />
    </div>
  );
}

const meta: Meta<typeof DraftTab> = {
  title: "Conversa/DraftTab",
  component: DraftTab,
};

export default meta;

type Story = StoryObj<typeof DraftTab>;

/**
 * Com os comandos do projeto no catálogo (Q4): o `/` já digitado abre o menu
 * com eles, sem sessão nenhuma viva.
 */
export const VazioComComandos: Story = {
  name: "Vazio, com comandos",
  render: () => <Stage catalog={[CLAUDE_VIEW_WITH_COMMANDS, CODEX_VIEW]} initialDraft="/" />,
};

/** Primeira conversa do projeto: o catálogo não tem comandos, e a dica diz por quê (F5.2). */
export const VazioSemComandos: Story = {
  name: "Vazio, sem comandos",
  render: () => <Stage catalog={[CLAUDE_VIEW, CODEX_NO_LOGIN_VIEW]} />,
};

/**
 * O primeiro envio, com o `createAgent` em voo (F5.3). No Claude isto fica na
 * tela de 2,5 a 4,4 s (M3) — é o estado que precisa existir.
 */
export const AbrindoClaude: Story = {
  name: "Abrindo claude…",
  render: () => (
    <Stage
      catalog={[CLAUDE_VIEW, CODEX_VIEW]}
      initialDraft={PROMPT}
      initialChoice={{ adapterId: "claude", config: { model: "sonnet", effort: "high" } }}
      opening
    />
  ),
};

/**
 * Criar falhou (F5.4): o texto fica, a frase do daemon aparece, e a pílula
 * reabre para escolher de novo. A frase é a do `createAgent` (§3.2) quando o
 * modelo sumiu do adaptador.
 */
export const Erro: Story = {
  name: "Erro",
  render: () => (
    <Stage
      catalog={[CLAUDE_VIEW, CODEX_VIEW]}
      initialDraft={PROMPT}
      initialChoice={{ adapterId: "claude", config: { model: "sonnet" } }}
      error={'o Claude Code não oferece mais "sonnet" em Model — escolha de novo'}
    />
  ),
};
