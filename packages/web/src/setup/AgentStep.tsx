import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  CheckList,
  CheckRow,
  CopyCommand,
  Skeleton,
  WizardSection,
} from "../ui/index.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";

export const AGENTS_KEY = ["setup", "agents"];

export interface AgentStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * Step 2: connect the agent — and the daemon installs the adapter.
 *
 * This reverses what shipped a day earlier, and the reversal is deliberate: what
 * was refused was `npm i -g`, global and possibly needing `sudo`, with nowhere for
 * two minutes of output to go. What the design asked for instead is an install
 * **into the daemon's own directory**, at a pinned version, with the progress
 * visible in three lines. That needs no privilege, and the only thing it can
 * break is itself.
 *
 * The copyable command stays, and it is not decoration: `npm` may be missing or a
 * registry unreachable, and on that machine the person still has a way through.
 */
export function AgentStep({ onNext, onBack, onSkip }: AgentStepProps) {
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => trpc.setup.agents.query(),
    refetchOnWindowFocus: false,
  });

  const install = useMutation({
    mutationFn: () => trpc.setup.installAdapter.mutate(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AGENTS_KEY });
    },
  });

  const adapter = agents.data?.adapter;
  const claude = agents.data?.claude;
  const ready = adapter?.path != null;

  return (
    <StepShell
      eyebrow={eyebrowFor("agent")}
      title="Conecte o Claude Code"
      lede={
        <>
          O Lumem conversa com agentes por <b>ACP</b> — o daemon sobe o adaptador como processo e
          troca mensagens por stdio. É o que faz ferramenta, plano e pedido de permissão chegarem
          como blocos, e não como texto rolando num terminal.
        </>
      }
      primary={{ label: "Testar conexão", disabled: !ready }}
      onSubmit={onNext}
      onBack={onBack}
      onSkip={onSkip}
      hint={
        ready ? undefined : (
          <>o botão libera quando o adaptador estiver no PATH</>
        )
      }
    >
      {agents.isPending && <Skeleton label="procurando os binários" />}

      {agents.isError && (
        <Banner tone="danger">
          <strong>Não deu para procurar os binários.</strong> {agents.error.message}
        </Banner>
      )}

      {agents.data !== undefined && claude !== undefined && adapter !== undefined && (
        <>
          <WizardSection title="o que foi encontrado na sua máquina">
            <CheckList label="binários">
              <CheckRow
                state={claude.path === null ? "warn" : "ok"}
                what={claude.command}
                value={
                  claude.path === null
                    ? "não está no PATH — o adaptador precisa dele para trabalhar"
                    : `${claude.version ?? claude.versionNote ?? "versão não lida"} · ${claude.path}`
                }
                status={claude.path === null ? "falta" : "ok"}
              />
              <CheckRow
                state={adapter.path === null ? "fail" : "ok"}
                what={adapter.command}
                value={
                  adapter.path === null
                    ? "adaptador ACP não está no PATH"
                    : `${adapter.version ?? adapter.versionNote ?? "versão não lida"} · ${adapter.path}`
                }
                status={adapter.path === null ? "falta" : "ok"}
              />
            </CheckList>

            {adapter.path === null && (
              <>
                <span className="field__help">
                  Nada para rodar no terminal: o Lumem instala o adaptador <b>dentro da pasta dele</b>
                  , numa versão fixa — nunca <code>@latest</code>, para uma atualização de madrugada
                  não mudar o comportamento do agente.
                </span>
                <div className="wizard__acts">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={install.isPending}
                    onClick={() => install.mutate()}
                  >
                    {install.isPending ? "instalando…" : "Instalar o adaptador"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={agents.isFetching}
                    onClick={() => void agents.refetch()}
                  >
                    {agents.isFetching ? "verificando…" : "Já instalei — verificar"}
                  </Button>
                </div>

                {install.isError && (
                  <>
                    <Banner tone="danger">{install.error.message}</Banner>
                    {/*
                      The way through on the machine where the install cannot work:
                      no npm, a registry behind a proxy, a mirror without the
                      package. The command is the same one the daemon would run.
                    */}
                    {adapter.install !== null && <CopyCommand command={adapter.install} />}
                  </>
                )}
              </>
            )}

            {adapter.managed && (
              <span className="field__help">
                Instalado pelo Lumem, na pasta dele — é esta cópia que o daemon executa, e não uma
                que esteja no seu <code>PATH</code>.
              </span>
            )}
          </WizardSection>

          <WizardSection title="como o Claude vai se autenticar — o que foi encontrado">
            <CheckList label="credencial">
              <CheckRow
                state={agents.data.apiKeyInEnv ? "ok" : "warn"}
                what="ANTHROPIC_API_KEY"
                value={
                  agents.data.apiKeyInEnv
                    ? "presente no ambiente do daemon — cobrança por token"
                    : "ausente — o adaptador vai usar a credencial local do Claude"
                }
                status={agents.data.apiKeyInEnv ? "chave" : "assinatura"}
              />
            </CheckList>
            <span className="field__help">
              Não é escolha sua nem do Lumem: o adaptador usa a credencial que <b>encontrar</b>. É o
              passo seguinte que confirma se ela vale — e ele confirma sem gastar token.
            </span>
          </WizardSection>

          {/* O caminho e os argumentos existem, mas não abrem o passo. */}
          <div className="adv">
            <span className="adv__k">avançado</span>
            <span className="adv__v">
              comando: {adapter.command} · args: nenhum · env herdado do daemon
            </span>
          </div>

          <Banner tone="info">
            Qualquer agente que fale ACP entra depois em <b>agentes</b>, no rodapé da sidebar — o
            Lumem não é preso ao Claude. Pular este passo também é legítimo: sem agente ACP, a sessão
            é um terminal.
          </Banner>
        </>
      )}
    </StepShell>
  );
}
