import { useQuery } from "@tanstack/react-query";

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
 * Step 2: connect the agent — and the one screen that refuses to install anything.
 *
 * The command is handed over selectable, and running it is the person's job in a
 * real terminal (D5). A daemon that runs `npm i -g` because a browser clicked is
 * a confused deputy out of a textbook: it runs as the user, the install may want
 * `sudo`, `npm` may not even be their package manager, and there is nowhere here
 * for two minutes of output to go — a session needs a scope, and at this step
 * neither a project nor a worktree exists yet.
 */
export function AgentStep({ onNext, onBack, onSkip }: AgentStepProps) {
  const agents = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => trpc.setup.agents.query(),
    refetchOnWindowFocus: false,
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

            {adapter.install !== null && adapter.path === null && (
              <>
                <CopyCommand command={adapter.install} />
                <span className="field__help">
                  O adaptador é um processo seu, na sua máquina. O Lumem só o <b>executa</b>:
                  instalar é você, no seu terminal — um daemon local que instala software global
                  porque um navegador clicou é procurador confuso, e a saída de um install não tem
                  onde aparecer aqui.
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={agents.isFetching}
                    onClick={() => void agents.refetch()}
                  >
                    {agents.isFetching ? "verificando…" : "Já instalei — verificar"}
                  </Button>
                </div>
              </>
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
