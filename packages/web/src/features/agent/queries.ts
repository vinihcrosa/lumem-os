import type { AdapterSpec } from "@lumem/shared";
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adapterCatalogKey,
  agentConfigsKey,
  agentProbeKey,
  authStateKey,
  setupAgentsKey,
  SETUP_PROBE_KEY,
} from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/**
 * A configuração da consulta, sem o `useQuery` em volta — para o `useQueries`
 * de `Done.tsx` (`setup`), que precisa de uma entrada por recurso num array
 * literal e não de um hook a mais no meio dele.
 */
export function agentConfigsQueryOptions(options: { enabled?: boolean } = {}) {
  return {
    queryKey: agentConfigsKey(),
    queryFn: () => trpc.agentConfig.list.query(),
    enabled: options.enabled ?? true,
  };
}

/** A lista de agentes configurados — lida em oito telas, invalidada em uma (`032` T11). */
export function useAgentConfigs(options: { enabled?: boolean } = {}) {
  return useQuery(agentConfigsQueryOptions(options));
}

/**
 * `agentConfig.create` e `agentConfig.remove`, com a invalidação **dentro**.
 *
 * O componente nunca vê `useQueryClient`: as duas mutações invalidam
 * `agentConfigsKey()` sozinhas, e o chamador só compõe o `onSuccess` dele por
 * cima, via segundo argumento de `.mutate()`.
 */
export function useAgentConfigMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (input: {
      name: string;
      command: string;
      args: string[];
      adapterVersion: string;
    }) => trpc.agentConfig.create.mutate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentConfigsKey() });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => trpc.agentConfig.remove.mutate({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentConfigsKey() });
    },
  });

  return { create, remove };
}

/**
 * O handshake de **uma** configuração.
 *
 * Uma consulta por agente, e a chave é o comando mais os argumentos — que é o
 * que faz a linha e o painel do mesmo agente dividirem uma resposta em vez de
 * subirem dois processos. Mandar só o comando já foi um defeito de verdade: uma
 * configuração cujo comando é `node` e o argumento é um script sobe, sem o
 * argumento, um REPL que não responde handshake nenhum e pendura até o limite.
 */
export function useAgentProbe(config: { command: string; args: readonly string[] }) {
  return useQuery({
    queryKey: agentProbeKey(config.command, config.args),
    queryFn: () => trpc.setup.probe.query({ command: config.command, args: [...config.args] }),
    retry: false,
    refetchOnWindowFocus: false,
    // Não é perguntado de novo a cada montagem: um probe é um processo (sobe o
    // adaptador, aperta a mão, mata), e a resposta muda com a frequência com que
    // uma credencial expira. "Verificar de novo" é o botão para quando muda.
    staleTime: 5 * 60_000,
  });
}

/** O probe do primeiro acesso: um agente, um handshake, sem argumento — `SETUP_PROBE_KEY`. */
export function useSetupHandshakeProbe() {
  return useQuery({
    queryKey: SETUP_PROBE_KEY,
    queryFn: () => trpc.setup.probe.query(),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * "Verificar de novo": invalida o prefixo inteiro de probes, não só um.
 *
 * `SETUP_PROBE_KEY` é o prefixo de `agentProbeKey`, então um reprobe aqui
 * alcança a linha do rodapé, o painel do agente e o passo de handshake do
 * primeiro acesso — os três leem o mesmo processo, de chaves diferentes.
 */
export function useReprobeAgents() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: SETUP_PROBE_KEY }),
    [queryClient],
  );
}

/** O relatório de pré-voo do daemon — o catálogo do que já está na máquina. */
export function useSetupAgentsReport() {
  return useQuery({
    queryKey: setupAgentsKey(),
    queryFn: () => trpc.setup.agents.query(),
    refetchOnWindowFocus: false,
  });
}

/** Instala um adaptador do catálogo — sem `adapterId`, o padrão (`032` T16). */
export function useInstallAdapter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adapterId?: string) => trpc.setup.installAdapter.mutate({ adapterId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: setupAgentsKey() });
    },
  });
}

/** Uma entrada do relatório de pré-voo, do jeito que o rodapé a lê. */
export interface AdapterEntry {
  id: string;
  label: string;
  adapter: { path: string | null; version: string | null };
  cli: { command: string; path: string | null; version: string | null } | null;
  apiKeyEnv: string | null;
}

export function entryOf(
  report: { adapters: readonly AdapterEntry[] } | undefined,
  id: string | undefined,
): AdapterEntry | undefined {
  if (id === undefined) return undefined;
  return report?.adapters.find((entry) => entry.id === id);
}

/**
 * O `＋`: instala se precisar, faz o handshake, cria a configuração.
 *
 * Estar instalado não é estar na versão que o produto mediu (LUM-54): só
 * decide instalar quando a versão é **conhecida** e diverge do pino —
 * `null` é "não deu para ler", e reinstalar por desconhecimento baixaria
 * 255 MB a cada conexão.
 */
export function useConnectAgent(
  report: ReturnType<typeof useSetupAgentsReport>["data"],
  // O painel de "preparando…" precisa saber em qual das duas etapas o pedido
  // está, e um `useMutation` só relata pendente-ou-não — daí o retrato sair por
  // callback, e não por um segundo estado que o hook teria que inventar.
  onStageChange?: (stage: "installing" | "handshaking") => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spec: AdapterSpec) => {
      const found = entryOf(report, spec.id);
      let command = found?.adapter.path ?? null;
      const stale =
        found?.adapter.version != null && found.adapter.version !== spec.pinnedVersion;

      if (command === null || stale) {
        onStageChange?.("installing");
        const installed = await trpc.setup.installAdapter.mutate({ adapterId: spec.id });
        command = installed.path;
      }

      onStageChange?.("handshaking");
      const probe = await trpc.setup.probe.query({ command });
      const created = await trpc.agentConfig.create.mutate({
        // Curto, porque ele nomeia a aba da sessão.
        name: spec.id,
        command,
        args: [],
        // A versão é **detectada**, nunca digitada: ela vem do handshake.
        adapterVersion: probe.agentInfo?.version ?? spec.pinnedVersion,
      });
      return created.id;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: agentConfigsKey() });
      await queryClient.invalidateQueries({ queryKey: setupAgentsKey() });
    },
  });
}

/**
 * O passo de handshake do primeiro acesso: reusa a configuração já existente
 * para o mesmo comando em vez de falhar no nome duplicado — alguém que rodou o
 * fluxo duas vezes não devia pensar nisso.
 */
export function useCreateHandshakeAgentConfig(
  existing: ReturnType<typeof useAgentConfigs>["data"],
  agentName: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (report: {
      command: string;
      args: readonly string[];
      agentInfo: { version: string } | null;
    }) => {
      const already = existing?.find((config) => config.command === report.command);
      if (already !== undefined) return already;

      // O ponto todo (F3.5). Sem versão declarada pelo adaptador, recusa aqui e diz
      // — melhor que escrever uma versão que ninguém mediu. O daemon recusaria
      // também, mas com a frase do validador, que não diz de onde a versão viria.
      const version = report.agentInfo?.version;
      if (version === undefined) {
        throw new Error("o adaptador não declarou a versão dele no handshake");
      }

      return trpc.agentConfig.create.mutate({
        name: agentName,
        command: report.command,
        args: [...report.args],
        adapterVersion: version,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentConfigsKey() });
    },
  });
}

/** O que `setup.login` devolve — anotado à mão porque o tipo do servidor não é portável (TS2742). */
export interface AgentLoginStarted {
  ptySessionId: string;
  command: string;
  args: readonly string[];
}

/** Uma tentativa de `setup.authenticate` — mesmo motivo da anotação acima. */
export interface AgentAuthAttempt {
  id: string;
  state: "running" | "ok" | "failed" | "cancelled";
  elicitation: { elicitationId: string; url: string; message: string; code: string | null } | null;
  message: string | null;
}

export function useAgentLoginByCommand() {
  return useMutation({
    mutationFn: (input: {
      methodId: string;
      command: string;
      args: string[];
    }): Promise<AgentLoginStarted> => trpc.setup.login.mutate(input),
  });
}

export function useAgentLoginByCall() {
  return useMutation({
    mutationFn: (input: {
      methodId: string;
      apiKey?: string;
      command: string;
      args: string[];
    }): Promise<AgentAuthAttempt> => trpc.setup.authenticate.mutate(input),
  });
}

export function useAuthState(loginId: string | null) {
  return useQuery({
    // `loginId ?? ""` só existe para o tipo da chave — `enabled` abaixo nunca
    // deixa a query correr sem `loginId`, então `["setup","authState",""]` fica
    // no cache sem nunca disparar.
    queryKey: authStateKey(loginId ?? ""),
    queryFn: (): Promise<AgentAuthAttempt> => trpc.setup.authState.query({ loginId: loginId ?? "" }),
    enabled: loginId !== null,
    refetchInterval: (query) =>
      query.state.data === undefined || query.state.data.state === "running" ? 700 : false,
  });
}

export function useCancelAuth() {
  return useMutation({
    mutationFn: (loginId: string): Promise<AgentAuthAttempt> =>
      trpc.setup.cancelAuth.mutate({ loginId }),
  });
}

/**
 * O catálogo de adaptador de um projeto (`033` §3.1): o que a pílula de agente e
 * modelo e o menu `/` leem antes de existir sessão.
 *
 * Sem `staleTime` próprio: quem avisa que mudou é o `catalog.changed` do daemon
 * (cada probe, cada `session/new`, cada `available_commands_update`), e o
 * `useLiveState` invalida por ele — perguntar de novo por relógio seria pagar por
 * uma resposta que o daemon já teria mandado.
 */
export function useAdapterCatalog(projectId: string | null) {
  return useQuery({
    queryKey: adapterCatalogKey(projectId),
    queryFn: () => trpc.adapterCatalog.list.query(projectId === null ? undefined : { projectId }),
  });
}
