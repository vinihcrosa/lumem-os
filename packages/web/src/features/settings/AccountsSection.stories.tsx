import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import type { AdapterCatalogView } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";
import { adapterCatalogKey, agentAccountsKey, setupAgentsKey } from "../../lib/queryKeys.js";
import { CLAUDE_VIEW, CODEX_VIEW } from "../../test/adapter-catalog-fixtures.js";
import { accountView } from "../../test/agent-account-fixtures.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { AccountsSection } from "./AccountsSection.js";

/**
 * `/settings` → Agentes, com as contas (`034` T13) — os estados nascem aqui
 * antes da fiação, pelo
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md).
 *
 * O cache chega semeado (`seededQueryClient`): o relatório de pré-voo, a lista
 * de contas e o catálogo por conta. Nenhuma chamada sai para `/trpc`.
 */

const INSTALLED = {
  adapters: [
    { id: "claude", label: "Claude Code", adapter: { path: "/state/adapters/claude", version: "0.75.1" }, cli: null, apiKeyEnv: null },
    { id: "codex", label: "Codex", adapter: { path: "/state/adapters/codex", version: "1.10.0" }, cli: null, apiKeyEnv: null },
  ],
};

const PESSOAL = accountView();
const TRABALHO = accountView({
  id: "acct_trabalho",
  label: "trabalho",
  isDefault: false,
  bare: false,
  identity: { email: "vini@empresa.com", plan: "team" },
  defaultModel: "claude-fable-5-1[1m]",
  defaultEffort: "medium",
  sessionCount: 4,
});

function catalogFor(accounts: readonly AgentAccountView[]): AdapterCatalogView[] {
  return accounts.map((account) => ({
    ...(account.adapterId === "codex" ? CODEX_VIEW : CLAUDE_VIEW),
    accountId: account.id,
  }));
}

function Stage({
  accounts,
  catalog = catalogFor(accounts),
  connecting,
}: {
  accounts: readonly AgentAccountView[];
  catalog?: readonly AdapterCatalogView[];
  connecting?: string;
}) {
  const client = seededQueryClient([
    [setupAgentsKey(), INSTALLED],
    [agentAccountsKey(), accounts],
    [adapterCatalogKey(null), catalog],
  ]);
  return (
    <QueryClientProvider client={client}>
      <div className="set">
        <AccountsSection {...(connecting === undefined ? {} : { defaultConnecting: connecting })} />
      </div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof AccountsSection> = {
  title: "Configurações/Contas",
  component: AccountsSection,
};

export default meta;

type Story = StoryObj<typeof AccountsSection>;

/** Quem tem uma conta só: a seção de antes, mais uma sub-linha. */
export const UmaConta: Story = {
  name: "Uma conta",
  render: () => <Stage accounts={[PESSOAL]} />,
};

/** Pessoal e trabalho no Claude, cada uma com o seu trio. */
export const DuasContas: Story = {
  name: "Duas contas",
  render: () => <Stage accounts={[PESSOAL, TRABALHO]} />,
};

/** A conta recém-conectada: nunca conferida, e `entrar` é o gesto. */
export const SemLogin: Story = {
  name: "Conta sem login",
  render: () => (
    <Stage
      accounts={[PESSOAL, { ...TRABALHO, state: "disconnected", identity: null, defaultModel: null, defaultEffort: null }]}
      catalog={catalogFor([PESSOAL])}
    />
  ),
};

/** Desconectada (Q8): as conversas ficam, `reconectar` e `apagar de vez`. */
export const Desconectada: Story = {
  name: "Conta desconectada",
  render: () => <Stage accounts={[PESSOAL, { ...TRABALHO, state: "disconnected" }]} />,
};

/** O modelo padrão saiu da lista que a conta viu (Q9). */
export const TrioIndisponivel: Story = {
  name: "Trio indisponível",
  render: () => (
    <Stage accounts={[PESSOAL, { ...TRABALHO, defaultModel: "claude-opus-4-1", defaultsUnavailable: true }]} />
  ),
};

/** O painel de conectar, com uma conta já no agente: a linha dos termos aparece. */
export const ConectarComTermos: Story = {
  name: "Conectar conta (com a linha dos termos)",
  render: () => <Stage accounts={[PESSOAL]} connecting="claude" />,
};

/**
 * Agente sem conta nenhuma: o gesto é adotar o login que já existe na máquina,
 * que entra como `principal`. O `＋ conectar conta` só aparece depois — ele cria
 * uma conta de diretório vazio, e a primeira não pode ser essa.
 */
export const SemConta: Story = {
  name: "Agente sem conta (adota o login da máquina)",
  render: () => <Stage accounts={[]} catalog={[]} />,
};
