import { useAgentAccounts, useAgentConfigs } from "../agent/index.js";
import type { SpendAccount, SpendAgent, SpendRow } from "./SpendList.js";
import {
  useUsageByProject,
  useUsageByProjectAndAccount,
  useUsageByProjectAndAgent,
  type ProjectAccountUsage,
  type ProjectAgentUsage,
  type UsageWindow,
} from "./useUsage.js";

/**
 * O consumo de cada projeto do workspace, já montado em linhas da `SpendList` —
 * com a divisão por agente e, embaixo dela, por conta (`034` T16).
 *
 * Saiu do `WorkspacePanel` quando a conta chegou: a tela estava no teto de
 * linhas, e a montagem é dado, não desenho.
 */
export function useProjectSpend(workspaceId: string, period: NonNullable<UsageWindow>) {
  const usage = useUsageByProject(workspaceId, period);

  /*
   * A divisão por agente só é perguntada quando há o que dividir (`second-agent`,
   * C5): dois agentes — ou um agente com duas contas, porque é embaixo da linha
   * do agente que a conta mora (`034` §6). A por conta, só no segundo caso.
   */
  const configs = useAgentConfigs();
  const accounts = useAgentAccounts().data ?? [];
  const multiAccount = accounts.some(
    (account) => accounts.filter((other) => other.adapterId === account.adapterId).length > 1,
  );
  const byAgent = useUsageByProjectAndAgent(workspaceId, period, (configs.data ?? []).length > 1 || multiAccount);
  const byAccount = useUsageByProjectAndAccount(workspaceId, period, multiAccount);

  const rows: SpendRow[] = (usage.data ?? []).map((row) => ({
    id: row.projectId,
    name: row.name,
    tokens: row.tokens,
    cost: row.cost,
    currency: row.currency,
    turns: row.turns,
    kind: "project",
    ...agentsOf(byAgent.data, byAccount.data, row.projectId),
  }));

  return { usage, rows };
}

/**
 * As sub-linhas de um projeto, quando a consulta agrupada respondeu.
 *
 * Devolve `{}` — e não `{ agents: [] }` — quando não há divisão: a `SpendList`
 * decide abrir pela **presença** do campo, e um array vazio faria a lista ganhar a
 * coluna do `▸` para não mostrar nada dentro dela.
 */
function agentsOf(
  rows: readonly ProjectAgentUsage[] | undefined,
  accountRows: readonly ProjectAccountUsage[] | undefined,
  projectId: string,
): { agents?: readonly SpendAgent[] } {
  const mine = (rows ?? [])
    .filter((row) => row.projectId === projectId)
    .map(
      (row): SpendAgent => ({
        // O id da linha é o do agente, e `sem-agente` para o turno que não tem um:
        // duas linhas sem chave estável reordenariam a cada resposta.
        id: row.agentConfigId ?? "sem-agente",
        name: row.name,
        tokens: row.tokens,
        cost: row.cost,
        currency: row.currency,
        turns: row.turns,
        ...accountsOf(accountRows, projectId, row.agentConfigId),
      }),
    );

  return mine.length > 0 ? { agents: mine } : {};
}

/** As contas de um agente num projeto — só com duas ou mais: com uma, o agente já é a conta. */
function accountsOf(
  rows: readonly ProjectAccountUsage[] | undefined,
  projectId: string,
  agentConfigId: string | null,
): { accounts?: readonly SpendAccount[] } {
  const mine = (rows ?? [])
    .filter((row) => row.projectId === projectId && row.agentConfigId === agentConfigId)
    .map(
      (row): SpendAccount => ({
        id: row.agentAccountId ?? "sem-conta",
        label: row.label,
        tokens: row.tokens,
        cost: row.cost,
        currency: row.currency,
        turns: row.turns,
      }),
    );
  return mine.length > 1 ? { accounts: mine } : {};
}
