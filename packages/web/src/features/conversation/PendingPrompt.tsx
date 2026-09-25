import { useEffect, useState } from "react";

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
 * `session.sendPending`/`session.discardPending` é a `PendingConversation`
 * (`033` T21).
 */

/** O motivo gravado quando o prompt ficou preso. Espelha a `session.pending_reason`. */
export type PendingPromptReason = "setup_failed";

export interface PendingPromptProps {
  prompt: string;
  /** `null` enquanto o `setup` roda. */
  reason: PendingPromptReason | null;
  /**
   * A frase do daemon sobre esta falha (`session.pending_detail`) — o exit, o
   * teto ou a recusa que impediu o `setup` de rodar.
   *
   * Do daemon, e não inferida aqui de `scripts.setup.last`: aquela é a última
   * execução do `setup`, e não necessariamente a que segurou este prompt.
   */
  detail?: string | null;
  /**
   * A sessão terminou antes de este prompt sair (`033` T21).
   *
   * Não há mais para onde mandar nem o que editar — o agente que o leria não
   * existe mais —, então o único gesto que sobra é copiar o texto. Ganha de
   * `reason` quando os dois acontecem juntos: uma sessão morta não tem `setup`
   * para tentar de novo.
   */
  dead?: boolean;
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
  detail = null,
  dead = false,
  onShowSetup,
  onSendAnyway,
  onEdit,
  busy = false,
}: PendingPromptProps) {
  const failed = !dead && reason === "setup_failed";
  const [copied, setCopied] = useState(false);

  // Mesmo relógio do `CopyCommand` (`ui/CopyCommand.tsx`): "copiado" que
  // sobrevive para sempre deixa de dizer o que acabou de acontecer.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className={`pending${failed ? " pending--failed" : ""}`}>
      {dead ? (
        <p className="pending__head" role="status">
          <span className="pending__what">a sessão terminou antes de mandar este prompt</span>
        </p>
      ) : failed ? (
        <div className="pending__head" role="alert">
          <span className="pending__glyph" aria-hidden="true">
            ⚠
          </span>
          <span className="pending__what">
            {detail ?? "o setup não terminou bem"}
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

      {/*
        `navigator.clipboard` ausente (contexto sem HTTPS, browser antigo): o
        texto continua selecionável dentro do `TurnFrame` acima, como o
        `CopyCommand` já decide para o mesmo caso.
      */}
      {dead && navigator.clipboard !== undefined && (
        <div className="pending__acts">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(prompt).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "copiado" : "copiar o prompt"}
          </Button>
        </div>
      )}
    </div>
  );
}
