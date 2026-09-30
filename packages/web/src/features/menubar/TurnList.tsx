import { Block, BlockError, BlockLoading } from "./Block.js";
import { useLiveSessions } from "./queries.js";
import { sinceWords } from "./words.js";

/** Os turnos em voo, com a sessão e o checkout de cada um (`038`, AC 48 e 49). */
export function TurnList({ now }: { now: number }) {
  const live = useLiveSessions();

  return (
    <Block label="Turnos em voo">
      {live.isPending ? (
        <BlockLoading what="as sessões" />
      ) : live.data === undefined ? (
        <BlockError what="as sessões" />
      ) : live.data.turns.length === 0 ? (
        <p className="menubar__empty">nenhuma sessão rodando</p>
      ) : (
        <ul className="menubar__list">
          {live.data.turns.map((turn) => (
            <li key={turn.sessionId} className="menubar__item">
              <span className="menubar__label">{turn.label}</span>
              <span className="menubar__note">{sinceWords(turn.startedAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}
