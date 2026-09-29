import { type ConversationState } from "./conversation-model.js";
import { formatElapsed, turnLine } from "./turn-status.js";
import { useNow } from "./useNow.js";

/**
 * A linha acima do composer enquanto há turno (`035` S3): há quanto tempo, e
 * fazendo o quê.
 *
 * Decide sozinha se aparece, com a mesma condição do caret e do `■ interromper`
 * — `streaming && !readOnly` —, porque é essa condição que liga o relógio: uma
 * transcrição relida sem fecho tem `streaming` ligado, e nada nela está vivo.
 */

export interface TurnStatusProps {
  conversation: ConversationState;
  readOnly: boolean;
  /** Injetável para um teste afirmar o decorrido em vez de esperar por ele. */
  clock?: () => number;
}

export function TurnStatus({ conversation, readOnly, clock = Date.now }: TurnStatusProps) {
  const live = conversation.streaming && !readOnly;
  const now = useNow(live, clock);
  if (!live || conversation.turnStartedAt === null) return null;

  const line = turnLine(conversation, now);
  const silent = line.tone === "warning";
  return (
    <div className={`turn-status${silent ? " turn-status--warning" : ""}`}>
      <span className="turn-status__pulse" aria-hidden="true" />
      <span className="turn-status__elapsed">{`trabalhando · ${formatElapsed(now - conversation.turnStartedAt)}`}</span>
      <span className="turn-status__doing">{line.doing}</span>
      {/* O atalho é o do `■ interromper` do cabeçalho; a linha só o reapresenta
          quando é a pergunta que a pessoa está se fazendo. */}
      {silent && (
        <span className="turn-status__hint">
          <span className="kbd">esc</span> interromper
        </span>
      )}
    </div>
  );
}
