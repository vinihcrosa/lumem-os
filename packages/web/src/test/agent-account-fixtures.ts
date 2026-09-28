import type { AgentAccountView } from "../features/agent/index.js";

/**
 * Contas de agente (`034`) para os testes e as stories.
 *
 * Duas formas, porque são duas pontas: `accountView` é o que a tela desenha (e o
 * que a story semeia no cache), `accountRow` é o que o daemon responde em
 * `agentAccount.list` (e o que o teste põe no mock do transporte). A segunda é a
 * primeira mais as colunas que a tela não lê.
 */

export function accountView(overrides: Partial<AgentAccountView> = {}): AgentAccountView {
  return {
    id: "acct_pessoal",
    adapterId: "claude",
    label: "pessoal",
    kind: "subscription",
    state: "connected",
    identity: { email: "vini@exemplo.com", plan: "max" },
    defaultModel: null,
    defaultEffort: null,
    isDefault: true,
    bare: true,
    sessionCount: 12,
    defaultsUnavailable: false,
    ...overrides,
  };
}

export function accountRow(overrides: Partial<AgentAccountView> = {}) {
  const view = accountView(overrides);
  return {
    ...view,
    agentConfigId: `ac_${view.adapterId}`,
    configDir: view.bare ? null : `/state/_system/agents/${view.adapterId}/${view.id}`,
    identity: view.identity === null ? null : { ...view.identity, checkedAt: 1_790_000_000_000 },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
