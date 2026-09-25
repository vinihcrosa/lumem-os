import { Button } from "../../ui/index.js";
import { TurnFrame } from "./Message.js";

/**
 * O primeiro prompt, segurado enquanto o `setup` roda (`033` F4.5, F4.6).
 *
 * O daemon grava o prompt na sessão (`pending_prompt`) e só manda quando o
 * `setup` sai com 0 (Q6). Enquanto isso a conversa mostra o texto esmaecido — é
 * um turno seu, ainda sem destino —, e quando o `setup` falha o prompt **não**
 * sai: a decisão é de quem escreveu.
 *
 * Presentacional. Quem lê `pendingPrompt`/`pendingReason` da sessão e chama
 * `session.sendPending`/`session.discardPending` é a T21.
 */

/** O motivo gravado quando o prompt ficou preso. Espelha a `session.pending_reason`. */
export type PendingPromptReason = "setup_failed";

export interface PendingPromptProps {
  prompt: string;
  /** `null` enquanto o `setup` roda. */
  reason: PendingPromptReason | null;
  /**
   * Como o `setup` terminou, quando falhou: o código de saída, ou `null` quando
   * o daemon o matou no teto de 10 minutos (`SETUP_TIMEOUT_MS`).
   */
  setupExit?: number | null;
  /** O atalho para a aba Setup do rodapé, onde está a saída. */
  onShowSetup?(): void;
  onSendAnyway?(): void;
  /** Descarta a pendência; o texto volta para o compositor. */
  onEdit?(): void;
  /** Uma das duas decisões em voo. */
  busy?: boolean;
}

export function PendingPrompt({
  prompt,
  reason,
  setupExit = null,
  onShowSetup,
  onSendAnyway,
  onEdit,
  busy = false,
}: PendingPromptProps) {
  const failed = reason === "setup_failed";

  return (
    <div className={`pending${failed ? " pending--failed" : ""}`}>
      {failed ? (
        <div className="pending__head" role="alert">
          <span className="pending__glyph" aria-hidden="true">
            ⚠
          </span>
          <span className="pending__what">
            {setupExit === null ? "o setup passou do teto de 10 min" : `o setup saiu com ${String(setupExit)}`}
            <span className="pending__why"> — o prompt não foi enviado</span>
          </span>
          {onShowSetup !== undefined && (
            <button type="button" className="pending__link focus-ring" onClick={onShowSetup}>
              ver saída
            </button>
          )}
        </div>
      ) : (
        <p className="pending__head" role="status">
          <span className="draft__pulse" aria-hidden="true" />
          <span className="pending__what">
            preparando worktree… <span className="pending__why">(setup)</span>
          </span>
          {onShowSetup !== undefined && (
            <button type="button" className="pending__link focus-ring" onClick={onShowSetup}>
              acompanhar
            </button>
          )}
        </p>
      )}

      <TurnFrame role="user">
        <div className="msg msg--queued">{prompt}</div>
      </TurnFrame>

      {failed && (
        <div className="pending__acts">
          <Button size="sm" disabled={busy} onClick={onSendAnyway}>
            mandar assim mesmo
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onEdit}>
            editar
          </Button>
        </div>
      )}
    </div>
  );
}
