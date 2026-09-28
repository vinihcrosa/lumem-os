import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";
import {
  CLAUDE_TWENTY_MODELS_VIEW,
  CLAUDE_VIEW,
  CODEX_NO_LOGIN_VIEW,
  CODEX_VIEW,
} from "../../test/adapter-catalog-fixtures.js";
import { accountView } from "../../test/agent-account-fixtures.js";
import type { AgentModelChoice } from "./agent-model.js";
import { AgentModelPill } from "./AgentModelPill.js";

/**
 * A pílula de agente e modelo (`033` F3), no `composer__box` de verdade.
 *
 * A caixa tem catorze linhas de campo acima da barra de propósito: o menu abre
 * **para cima**, ancorado na pílula (`023`), e é sobre o campo que ele cai no
 * produto. Numa moldura sem esse espaço a story mediria um recorte que o
 * produto não tem.
 *
 * Presentacional, então sem `seededQueryClient`: o catálogo chega por prop,
 * com a forma que a M1 mediu (`test/adapter-catalog-fixtures.ts`).
 */

function Stage({
  catalog,
  accounts,
  initial,
  open = false,
}: {
  catalog: readonly AdapterCatalogView[];
  accounts?: readonly AgentAccountView[];
  initial: AgentModelChoice;
  open?: boolean;
}) {
  const [choice, setChoice] = useState(initial);
  return (
    <>
      <p className="sg__note">
        escolha: <code>{JSON.stringify(choice)}</code>
      </p>
      <div className="composer">
        <div className="composer__box">
          <textarea className="composer__in composer__in--empty" rows={14} placeholder="escreva, ou / para comandos" />
          <div className="composer__bar">
            <AgentModelPill
              catalog={catalog}
              {...(accounts === undefined ? {} : { accounts })}
              value={choice}
              onChange={setChoice}
              defaultOpen={open}
              onLogin={() => undefined}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const meta: Meta<typeof AgentModelPill> = {
  title: "Conversa/AgentModelPill",
  component: AgentModelPill,
};

export default meta;

type Story = StoryObj<typeof AgentModelPill>;

/** Claude e Codex logados, a pílula no padrão do ACP (Q8) e o menu aberto. */
export const Padrao: Story = {
  name: "Claude + Codex",
  render: () => <Stage catalog={[CLAUDE_VIEW, CODEX_VIEW]} initial={{ adapterId: "claude", config: {} }} open />,
};

/**
 * Vinte modelos num grupo — o teto `--size-menu-max-h` segura o menu, o
 * cabeçalho do grupo fica no topo enquanto rola, e o Codex continua embaixo.
 */
export const VinteModelos: Story = {
  name: "Vinte modelos",
  render: () => (
    <Stage catalog={[CLAUDE_TWENTY_MODELS_VIEW, CODEX_VIEW]} initial={{ adapterId: "claude", config: {} }} open />
  ),
};

/** O Codex instalado e sem login: grupo desabilitado, com o motivo e o caminho (F3.4). */
export const CodexSemLogin: Story = {
  name: "Codex sem login",
  render: () => (
    <Stage catalog={[CLAUDE_VIEW, CODEX_NO_LOGIN_VIEW]} initial={{ adapterId: "claude", config: {} }} open />
  ),
};

/** Opus: o modelo tem `effort` (M1), e a pílula dele aparece ao lado. */
export const ComEffort: Story = {
  name: "Com effort (Opus)",
  render: () => (
    <Stage catalog={[CLAUDE_VIEW, CODEX_VIEW]} initial={{ adapterId: "claude", config: { model: "opus[1m]" } }} />
  ),
};

/** Haiku: o modelo não tem `effort` (M1a), e a pílula some — nunca valor inventado (F3.3). */
export const SemEffort: Story = {
  name: "Sem effort (Haiku)",
  render: () => (
    <Stage catalog={[CLAUDE_VIEW, CODEX_VIEW]} initial={{ adapterId: "claude", config: { model: "haiku" } }} />
  ),
};

const PESSOAL = accountView();
const TRABALHO = accountView({
  id: "acct_trabalho",
  label: "trabalho",
  isDefault: false,
  bare: false,
  defaultModel: "claude-fable-5-1[1m]",
  defaultEffort: "medium",
});

/**
 * Uma conta só (`034` T14): a pílula é a de antes — nem no botão nem no menu
 * aparece conta. Comparar com *Claude + Codex*: é o mesmo pixel.
 */
export const UmaConta: Story = {
  name: "Uma conta",
  render: () => (
    <Stage
      catalog={[{ ...CLAUDE_VIEW, accountId: PESSOAL.id }, CODEX_VIEW]}
      accounts={[PESSOAL]}
      initial={{ adapterId: "claude", accountId: PESSOAL.id, config: {} }}
      open
    />
  ),
};

/**
 * Duas contas do Claude: a conta entra no botão e no topo do grupo, com a
 * padrão marcada. Trocar para `trabalho` mostra o trio dela (Fable 5.1 · medium).
 */
export const DuasContas: Story = {
  name: "Duas contas",
  render: () => (
    <Stage
      catalog={[
        { ...CLAUDE_VIEW, accountId: PESSOAL.id },
        { ...CLAUDE_VIEW, accountId: TRABALHO.id },
        CODEX_VIEW,
      ]}
      accounts={[PESSOAL, TRABALHO]}
      initial={{ adapterId: "claude", accountId: PESSOAL.id, config: {} }}
      open
    />
  ),
};

/** Duas contas, com a do trabalho escolhida: o botão diz a conta e o trio dela. */
export const DuasContasTrabalho: Story = {
  name: "Duas contas (trabalho escolhida)",
  render: () => (
    <Stage
      catalog={[
        { ...CLAUDE_VIEW, accountId: PESSOAL.id },
        { ...CLAUDE_VIEW, accountId: TRABALHO.id },
        CODEX_VIEW,
      ]}
      accounts={[PESSOAL, TRABALHO]}
      initial={{ adapterId: "claude", accountId: TRABALHO.id, config: {} }}
    />
  ),
};

/**
 * Duas contas, e a do trabalho ainda sem login: o chip dela aparece — é o que
 * diz que ela existe —, mas desabilitado, com `· sem login` e o caminho no
 * `title`. Escolhê-la dava uma conversa que morria no primeiro prompt.
 */
export const DuasContasUmaSemLogin: Story = {
  name: "Duas contas (uma sem login)",
  render: () => (
    <Stage
      catalog={[{ ...CLAUDE_VIEW, accountId: PESSOAL.id }, CODEX_VIEW]}
      accounts={[PESSOAL, { ...TRABALHO, state: "disconnected", identity: null }]}
      initial={{ adapterId: "claude", accountId: PESSOAL.id, config: {} }}
      open
    />
  ),
};
