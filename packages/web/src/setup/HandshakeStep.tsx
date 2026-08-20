import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  CheckList,
  CheckRow,
  MetaGrid,
  Skeleton,
  WizardSection,
} from "../ui/index.js";
import type { SetupResult } from "./SetupFlow.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";

export const PROBE_KEY = ["setup", "probe"];
const AGENT_CONFIGS_KEY = ["agentConfig", "list"];

/**
 * The name the configuration gets.
 *
 * Short, because it becomes the label on the session tab. `claude-code` is taken
 * by the seeded PTY configuration, and the two have to be told apart in the
 * "nova sessão" menu.
 */
export const SETUP_AGENT_NAME = "claude";

export interface HandshakeStepProps {
  onNext: (patch: Partial<SetupResult>) => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * The proof that it connected, and the configuration that comes out of it.
 *
 * The version written to `agent_config.adapter_version` is the one the adapter
 * reported in `initialize` — detected, never typed. The form in the sidebar footer
 * asks a person to type it, and the protocol has been handing the answer over the
 * whole time; this screen is where that stops being true.
 */
export function HandshakeStep({ onNext, onBack, onSkip }: HandshakeStepProps) {
  const queryClient = useQueryClient();

  const probe = useQuery({
    queryKey: PROBE_KEY,
    queryFn: () => trpc.setup.probe.query(),
    // One handshake per visit. It costs a process, not a token, and repeating it
    // on every focus change would spawn adapters behind the user's back.
    refetchOnWindowFocus: false,
    retry: false,
  });

  const existing = useQuery({
    queryKey: AGENT_CONFIGS_KEY,
    queryFn: () => trpc.agentConfig.list.query(),
  });

  const report = probe.data;

  const create = useMutation({
    mutationFn: async () => {
      if (report === undefined) throw new Error("sem handshake não há o que salvar");

      const already = existing.data?.find(
        (config) => config.transport === "acp" && config.command === report.command,
      );
      // Already configured — reuse it rather than failing on the unique name.
      // Someone who ran the flow twice should not have to think about this.
      if (already !== undefined) return already;

      return trpc.agentConfig.create.mutate({
        name: SETUP_AGENT_NAME,
        command: report.command,
        args: [...report.args],
        transport: "acp",
        // The whole point (F3.5). Null only if the adapter declared no version,
        // in which case the daemon refuses and says so — which is better than
        // writing a version nobody measured.
        adapterVersion: report.agentInfo?.version ?? null,
      });
    },
    onSuccess: async (config) => {
      await queryClient.invalidateQueries({ queryKey: AGENT_CONFIGS_KEY });
      onNext({
        agentConfigId: config.id,
        agentName: config.name,
        ...(config.adapterVersion === null ? {} : { adapterVersion: config.adapterVersion }),
      });
    },
  });

  const authWord =
    report === undefined
      ? ""
      : report.authMethods.length === 0
        ? "o adaptador não pediu autenticação: usou a credencial local"
        : `o adaptador pede autenticação: ${report.authMethods
            .map((method) => method.name ?? method.id)
            .join(", ")}`;

  return (
    <StepShell
      eyebrow={`${eyebrowFor("handshake") ?? ""} · conexão`}
      title={probe.isError ? "O adaptador não conectou" : "Claude Code conectado"}
      lede={
        probe.isError ? (
          <>Isto é o que o daemon tentou, e o que voltou.</>
        ) : (
          <>
            O daemon subiu o adaptador, trocou o <code>initialize</code> e abriu uma sessão de teste.
            Isto é o que ele respondeu.
          </>
        )
      }
      primary={{
        label: "Continuar",
        disabled: report === undefined,
        isPending: create.isPending,
        pending: "salvando…",
      }}
      onSubmit={() => create.mutate()}
      onBack={onBack}
      onSkip={onSkip}
      extra={
        <Button variant="ghost" disabled={probe.isFetching} onClick={() => void probe.refetch()}>
          {probe.isFetching ? "testando…" : "Testar de novo"}
        </Button>
      }
      hint={
        <>
          salvo como <b>{SETUP_AGENT_NAME}</b>
        </>
      }
    >
      {probe.isPending && <Skeleton label="subindo o adaptador" />}

      {probe.isError && (
        <Banner tone="danger">
          <strong>O handshake falhou.</strong> {probe.error.message}
        </Banner>
      )}

      {report !== undefined && (
        <>
          <CheckList label="o que o adaptador respondeu">
            <CheckRow
              state="ok"
              what="processo"
              value={`${report.command} · subiu em ${report.timings.spawnMs} ms`}
              status="ok"
            />
            <CheckRow
              state="ok"
              what="protocolo"
              value={`ACP v${report.protocolVersion}${
                report.agentInfo === null
                  ? " · o adaptador não declarou nome nem versão"
                  : ` · ${report.agentInfo.name} ${report.agentInfo.version}`
              }`}
              status="ok"
            />
            <CheckRow
              state={report.authMethods.length === 0 ? "ok" : "warn"}
              what="autenticação"
              value={authWord}
              status={report.authMethods.length === 0 ? "ok" : "pede"}
            />
            <CheckRow
              state="ok"
              what="capacidades"
              value={report.capabilities.length === 0 ? "nenhuma declarada" : report.capabilities.join(" · ")}
              status="ok"
            />
            <CheckRow
              state="ok"
              what="sessão"
              value={`session/new devolveu ${report.acpSessionId} em ${report.timings.sessionMs} ms`}
              status="ok"
            />
          </CheckList>

          <WizardSection title="o que o daemon mandou e o que voltou">
            {/*
              Reconstrução, e o rótulo diz isso (D7). O daemon não guarda o fio: a
              sonda devolve dado tipado e estas linhas são desenhadas a partir dele.
              Mostrar JSON inventado como se fosse captura perde a confiança de uma vez.
            */}
            <div className="wire">
              <span className="wire__l">
                <span className="wire__d wire__d--out" aria-hidden="true">
                  →
                </span>
                <span className="wire__c">
                  initialize {"{"} protocolVersion: {report.protocolVersion}, clientCapabilities:{" "}
                  {"{"} fs: {"{"} readTextFile, writeTextFile {"}"}, terminal {"}"} {"}"}
                </span>
              </span>
              <span className="wire__l">
                <span className="wire__d wire__d--in" aria-hidden="true">
                  ←
                </span>
                <span className="wire__c">
                  {"{"} protocolVersion: {report.protocolVersion}, agentInfo:{" "}
                  {report.agentInfo === null
                    ? "ausente"
                    : `${report.agentInfo.name}@${report.agentInfo.version}`}
                  , authMethods: [{report.authMethods.map((method) => method.id).join(", ")}] {"}"}
                </span>
              </span>
              <span className="wire__l">
                <span className="wire__d wire__d--out" aria-hidden="true">
                  →
                </span>
                <span className="wire__c">session/new {"{"} cwd: ~/.lumem/probe, mcpServers: [] {"}"}</span>
              </span>
              <span className="wire__l">
                <span className="wire__d wire__d--in" aria-hidden="true">
                  ←
                </span>
                <span className="wire__c">
                  {"{"} sessionId: {report.acpSessionId}, modes: [{report.modes.join(", ")}] {"}"}
                </span>
              </span>
              <span className="wire__l">
                <span className="wire__d" aria-hidden="true">
                  ·
                </span>
                <span className="wire__c">
                  sessão de teste encerrada. Nenhum token consumido — não houve session/prompt.
                </span>
              </span>
            </div>
          </WizardSection>

          <WizardSection title="como as próximas sessões nascem">
            <MetaGrid
              variant="recap"
              entries={[
                {
                  label: "modelo",
                  value: (
                    <>
                      o que o agente oferecer <span className="dim">— trocável em cada conversa</span>
                    </>
                  ),
                },
                {
                  label: "modo",
                  value:
                    report.currentMode === null ? (
                      <span className="dim">o padrão do agente</span>
                    ) : (
                      <>
                        {report.currentMode}{" "}
                        <span className="dim">— trocável em cada conversa</span>
                      </>
                    ),
                },
                {
                  label: "versão",
                  value:
                    report.agentInfo === null ? (
                      <span className="dim">o adaptador não declarou — vai pedir para digitar</span>
                    ) : (
                      report.agentInfo.version
                    ),
                },
              ]}
            />
            <span className="field__help">
              Leitura, não escolha: o Lumem não tem onde guardar um padrão seu, e a conversa já
              escolhe modelo e modo por sessão — com o agente como autoridade sobre a lista.
            </span>
          </WizardSection>

          {create.isError && <Banner tone="danger">{create.error.message}</Banner>}
        </>
      )}
    </StepShell>
  );
}
