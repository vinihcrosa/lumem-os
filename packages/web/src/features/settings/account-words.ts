import type { AcpConfigOption, AdapterCatalogView } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";
import { effortOptionOf, modelOptionOf, optionsForModel } from "../conversation/index.js";

/**
 * A tradução de uma conta para o que a sub-linha diz (`034` T13), no molde de
 * `agent-words.ts`: pura, testável sem montar nada.
 */

/**
 * Três estados na tela, e o banco tem dois.
 *
 * `disconnected` no banco quer dizer duas coisas que pedem gestos diferentes: a
 * conta que **nunca entrou** (a de assinatura nasce assim, e só a conferência a
 * conecta) e a que alguém **desconectou** (Q8). O que as separa é a identidade:
 * a conferência só a grava com login, e desconectar não a apaga. A conta
 * `connected` cujo adaptador respondeu `authRequired` também pede login — o
 * login foi desfeito fora do Lumem.
 */
export type AccountStatus = "connected" | "needs-login" | "disconnected";

export function accountStatus(account: AgentAccountView, reading: AdapterCatalogView | null): AccountStatus {
  if (account.state === "disconnected") return account.identity === null ? "needs-login" : "disconnected";
  if (reading?.authRequired === true) return "needs-login";
  return "connected";
}

/**
 * A leitura do catálogo desta conta.
 *
 * A padrão também aceita a leitura sem conta: é a de antes da `034` (ou do
 * primeiro acesso), e ela descreve o login desta máquina — que é a padrão até
 * alguém trocar.
 */
export function readingFor(
  catalog: readonly AdapterCatalogView[],
  account: AgentAccountView,
): AdapterCatalogView | null {
  const own = catalog.find((view) => view.accountId === account.id);
  if (own !== undefined) return own;
  if (!account.isDefault) return null;
  return catalog.find((view) => view.adapterId === account.adapterId && view.accountId === null) ?? null;
}

/** A segunda linha — e-mail e plano, o que a conferência leu (nota da Q2). */
export function identityLine(account: AgentAccountView): string | null {
  const parts = [account.identity?.email, account.identity?.plan].filter(
    (part): part is string => part !== null && part !== undefined && part !== "",
  );
  return parts.length === 0 ? null : parts.join(" · ");
}

/** A frase que autoriza apagar: é a contagem nela que o daemon exige de volta. */
export function purgeSentence(count: number): string {
  if (count === 0) return "apaga a conta — ela não tem conversa nenhuma";
  return `apaga a conta e as ${String(count)} ${count === 1 ? "conversa" : "conversas"} dela`;
}

/** Os modelos que a conta viu, ou `null` quando ninguém leu a lista dela ainda. */
export function modelChoicesOf(reading: AdapterCatalogView | null): AcpConfigOption | null {
  if (reading === null) return null;
  const option = modelOptionOf(reading.configOptions);
  return option === null || option.choices.length === 0 ? null : option;
}

/**
 * O *effort* que o modelo padrão oferece, ou `null` quando ele não tem (Q9).
 *
 * Sem modelo padrão, o modelo é o que o adaptador escolhe — o `currentValue` do
 * `session/new` —, e o *effort* é o dele.
 */
export function effortChoicesOf(reading: AdapterCatalogView | null, model: string | null): AcpConfigOption | null {
  if (reading === null) return null;
  const effective = model ?? modelOptionOf(reading.configOptions)?.currentValue ?? null;
  if (effective === null) return null;
  const options = optionsForModel(reading, effective);
  return options === null ? null : effortOptionOf(options);
}
