import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ADAPTER_CATALOG_PREFIX,
  AGENT_ACCOUNT_PREFIX,
  agentAccountProbeKey,
  agentAccountsKey,
} from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/**
 * Uma conta de agente, do jeito que a tela a desenha (`034`).
 *
 * Estreitada aqui, e não repassada crua: `kind` e `state` são `text` no SQLite,
 * e o domínio tem dois valores de cada — o
 * [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md)
 * aplicado à resposta do daemon.
 */
export interface AgentAccountView {
  id: string;
  adapterId: string;
  label: string;
  kind: "subscription" | "api_key";
  state: "connected" | "disconnected";
  /** O que a última conferência leu. `null` é *nunca conferida* — a conta nunca entrou. */
  identity: { email: string | null; plan: string | null } | null;
  defaultModel: string | null;
  defaultEffort: string | null;
  isDefault: boolean;
  /** O login desta máquina, sem diretório próprio: desconecta, mas não se apaga de vez. */
  bare: boolean;
  /** Quantas conversas ela tem — a contagem que o *apagar de vez* exige. */
  sessionCount: number;
  /** O modelo padrão saiu da última lista que esta conta viu (Q9). */
  defaultsUnavailable: boolean;
}

type AccountRow = Awaited<ReturnType<typeof trpc.agentAccount.list.query>>[number];

function toAccountView(row: AccountRow): AgentAccountView {
  return {
    id: row.id,
    adapterId: row.adapterId,
    label: row.label,
    kind: row.kind === "api_key" ? "api_key" : "subscription",
    // Um estado que o produto não conhece não é `connected`: a conversa nova
    // nasceria numa conta que ninguém conferiu.
    state: row.state === "connected" ? "connected" : "disconnected",
    identity:
      row.identity === null
        ? null
        : { email: row.identity.email ?? null, plan: row.identity.plan ?? null },
    defaultModel: row.defaultModel,
    defaultEffort: row.defaultEffort,
    isDefault: row.isDefault,
    bare: row.bare,
    sessionCount: row.sessionCount,
    defaultsUnavailable: row.defaultsUnavailable,
  };
}

/** As contas de todos os agentes, na ordem em que foram conectadas. */
export function useAgentAccounts() {
  return useQuery({
    queryKey: agentAccountsKey(),
    queryFn: async () => (await trpc.agentAccount.list.query()).map(toAccountView),
  });
}

/**
 * Os seis gestos sobre contas, com a invalidação **dentro**.
 *
 * O daemon também avisa (`account.changed`), e o aviso chega a outras abas; a
 * invalidação aqui é o que faz esta aba não depender da assinatura estar viva
 * para ver o próprio gesto. O catálogo vai junto porque a padrão decide qual
 * leitura dele a pílula mostra primeiro.
 */
export function useAgentAccountMutations() {
  const queryClient = useQueryClient();
  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: AGENT_ACCOUNT_PREFIX });
    await queryClient.invalidateQueries({ queryKey: ADAPTER_CATALOG_PREFIX });
  };

  const connect = useMutation({
    mutationFn: (input: {
      adapterId: string;
      label: string;
      kind: "subscription" | "api_key";
      apiKey?: string;
    }) => trpc.agentAccount.connect.mutate(input),
    onSuccess: settle,
  });
  const disconnect = useMutation({
    mutationFn: (accountId: string) => trpc.agentAccount.disconnect.mutate({ accountId }),
    onSuccess: settle,
  });
  const purge = useMutation({
    mutationFn: (input: { accountId: string; sessionCount: number }) =>
      trpc.agentAccount.purge.mutate(input),
    onSuccess: settle,
  });
  const setDefault = useMutation({
    mutationFn: (accountId: string) => trpc.agentAccount.setDefault.mutate({ accountId }),
    onSuccess: settle,
  });
  const setDefaults = useMutation({
    mutationFn: (input: { accountId: string; model: string | null; effort: string | null }) =>
      trpc.agentAccount.setDefaults.mutate(input),
    onSuccess: settle,
  });

  const rename = useMutation({
    mutationFn: (input: { accountId: string; label: string }) => trpc.agentAccount.rename.mutate(input),
    onSuccess: settle,
  });

  return { connect, disconnect, purge, setDefault, setDefaults, rename };
}

/**
 * O handshake de **uma conta**, só quando alguém abre o login dela.
 *
 * Um probe é um processo; a lista de contas não pergunta um por linha. É este
 * probe, depois do login, que confere a identidade e vira a conta `connected`.
 */
export function useAccountProbe(target: { adapterId: string; accountId: string }, enabled: boolean) {
  return useQuery({
    queryKey: agentAccountProbeKey(target.accountId),
    queryFn: () =>
      trpc.setup.probe.query({ adapterId: target.adapterId, accountId: target.accountId }),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
