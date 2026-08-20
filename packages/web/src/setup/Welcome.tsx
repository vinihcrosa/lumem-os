import { StepShell } from "./StepShell.js";

export interface WelcomeProps {
  daemonVersion: string | null;
  daemonUnreachable: boolean;
  onStart: () => void;
}

/**
 * The opening screen: what the product is, before it asks for anything.
 *
 * The first sentence is the one fact that changes how everything after it reads
 * — the daemon is already running. This is not a sign-up; it is a machine being
 * configured. And the version in it is *read*, never asserted: a welcome screen
 * that claims a daemon is up while it is down is the first lie the product tells.
 */
export function Welcome({ daemonVersion, daemonUnreachable, onStart }: WelcomeProps) {
  return (
    <StepShell
      title={
        daemonUnreachable
          ? "O daemon não está respondendo."
          : "O daemon já está rodando. Falta dizer com o que ele trabalha."
      }
      lede={
        daemonUnreachable ? (
          <>
            O Lumem roda inteiro na sua máquina, e o daemon é a parte que tem os processos. Sem ele
            nada aqui responde — nem este fluxo. Suba <code>pnpm dev</code> e volte.
          </>
        ) : (
          <>
            O Lumem roda inteiro na sua máquina: um daemon local
            {daemonVersion !== null && <> (v{daemonVersion})</>}, seus repositórios onde já estão, e
            agentes que você mesmo instalou. Nada sai daqui — o que vai para a Anthropic é o que você
            escrever para o Claude, pela sua própria conta.
          </>
        )
      }
      primary={{ label: "Configurar em 5 passos", disabled: daemonUnreachable }}
      onSubmit={onStart}
      hint={<>leva ~2 min</>}
    >
      <div className="tri">
        <div className="tri__i">
          <span className="tri__g glyph glyph--worktree" aria-hidden="true">
            ◇
          </span>
          <span className="tri__t">Uma tarefa, uma worktree</span>
          <span className="tri__d">
            Cada tarefa ganha branch e pasta próprias. O agente trabalha lá; seu checkout não é
            tocado.
          </span>
        </div>
        <div className="tri__i">
          <span className="tri__g glyph glyph--agent" aria-hidden="true">
            ◆
          </span>
          <span className="tri__t">Agente por ACP</span>
          <span className="tri__d">
            Claude Code entra por protocolo, não por terminal simulado. Ferramenta, plano e permissão
            viram blocos.
          </span>
        </div>
        <div className="tri__i">
          <span className="tri__g glyph glyph--project" aria-hidden="true">
            ■
          </span>
          <span className="tri__t">Vários ao mesmo tempo</span>
          <span className="tri__d">
            Sessões paralelas em worktrees diferentes, sem uma pisar na outra.
          </span>
        </div>
      </div>
    </StepShell>
  );
}
