import type { AcpServerMessage } from "@lumem/shared";

import { Banner, Button, Glyph } from "../../ui/index.js";
import { type AcpConnect } from "./acp-socket.js";
import { Composer } from "./Composer.js";
import { Transcript } from "./Transcript.js";
import { useConversationSession } from "./useConversationSession.js";

/**
 * The conversation, assembled.
 *
 * Só a composição desde a `032` T27: `useConversationSession`, o cabeçalho, e
 * `Transcript`/`Composer`, que eram dele.
 */

export interface ConversationProps {
  sessionId: string;
  /**
   * Quem está falando, pelo nome da configuração de agente.
   *
   * Era a string `claude`, escrita à mão no cabeçalho. Com um agente ninguém
   * notava; com dois, as duas conversas diziam a mesma coisa — foi o que a F4 da
   * `second-agent` foi conferir. O nome vem da `agent_config`, que é o mesmo que
   * a aba usa, para a aba e o cabeçalho nunca discordarem.
   */
  agentName?: string;
  /**
   * False for a conversation that has ended (D13).
   *
   * Then nothing is attached and nothing is launched: the transcript comes off the
   * daemon's disk and the composer is closed. Standing up an adapter costs ~39k tokens
   * of system prompt before the first word, and clicking a tab to reread something
   * must not spend that.
   */
  live?: boolean;
  /** Injectable so a test needs no daemon. */
  connect?: AcpConnect;
  /** Same, for the read path. */
  load?: (sessionId: string) => Promise<AcpServerMessage>;
  /**
   * Offers to continue it (F5.2).
   *
   * Absent when the caller has nowhere to put the new session — resuming creates a new
   * one and something has to switch to it, which this component cannot do.
   */
  onResume?: () => void;
  /** True while the resume is in flight, so the button can say so. */
  resuming?: boolean;
  /**
   * The daemon's reason for refusing the resume, or null (F1.6).
   *
   * Launching a fresh adapter to continue the conversation can be refused, and a
   * refusal that only flipped the button back read as the click doing nothing.
   */
  resumeError?: string | null;
  /**
   * False enquanto outra aba está aberta.
   *
   * As abas ficam **montadas** quando escondidas (`SessionTab`), então o atalho
   * de teclado precisa saber qual delas está na tela: sem isso um `esc` cancelaria
   * o turno de todas as conversas abertas de uma vez.
   */
  active?: boolean;
}

export function Conversation({
  sessionId,
  // "agente" e não "claude": um default que nomeia um agente específico é o
  // defeito que a F4 achou, com outro valor.
  agentName = "agente",
  live,
  connect,
  load,
  onResume,
  resuming = false,
  resumeError = null,
  active = true,
}: ConversationProps) {
  const { state, attached, readOnly, send, cancel, answer, setMode, setConfig } = useConversationSession(
    sessionId,
    { live, connect, load },
  );
  const { conversation, session, failure } = state;

  return (
    <div className="conv">
      <div className="conv__head">
        <span className="conv__who">
          <Glyph tone="agent">◆</Glyph>
          {agentName}
        </span>
        {session && (
          <span className="conv__adapter">
            sessão {session.acpSessionId.slice(0, 8)} · {session.model} · {session.mode}
          </span>
        )}
        <span className="spacer" />
        {/* Resuming is an act, not something a tab does by being opened (D13). */}
        {readOnly && onResume && (
          <Button variant="primary" size="sm" disabled={resuming} onClick={onResume}>
            {resuming ? "retomando…" : "↻ retomar"}
          </Button>
        )}
        {conversation.streaming && !readOnly && (
          <Button variant="ghost" size="sm" onClick={cancel}>
            ■ interromper <span className="kbd">esc</span>
          </Button>
        )}
      </div>

      {/* The daemon's reason for refusing the resume, right under the button that
          asked for it (F1.6). Without it the refusal was silent and the click read
          as doing nothing. */}
      {resumeError && (
        <div className="conv__banner">
          <Banner tone="danger">{resumeError}</Banner>
        </div>
      )}

      <Transcript conversation={conversation} session={session} failure={failure} readOnly={readOnly} answer={answer} />

      <Composer
        sessionId={sessionId}
        conversation={conversation}
        session={session}
        attached={attached}
        readOnly={readOnly}
        active={active}
        send={send}
        cancel={cancel}
        setMode={setMode}
        setConfig={setConfig}
      />
    </div>
  );
}
