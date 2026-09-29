import { type ConversationState } from "./conversation-model.js";
import { activityText, formatElapsed, turnActivity } from "./turn-status.js";
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

  return (
    <div className="turn-status">
      <span className="turn-status__pulse" aria-hidden="true" />
      <span className="turn-status__elapsed">{`trabalhando · ${formatElapsed(now - conversation.turnStartedAt)}`}</span>
      <span className="turn-status__doing">{activityText(turnActivity(conversation))}</span>
    </div>
  );
}
