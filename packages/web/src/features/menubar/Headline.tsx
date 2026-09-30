import { formatTokens } from "../conversation/index.js";
import { Block, BlockError, BlockLoading } from "./Block.js";
import { useRateLimits, useTodayUsage } from "./queries.js";
import { dayCost, percentOf, untilReset } from "./words.js";

/**
 * A manchete do painel: **cota, depois custo, depois tokens** (`038`, AC 46 e 47).
 *
 * A cota primeiro porque é a que para o trabalho: a conta mais perto do teto manda, com a
 * janela dela e o tempo até renovar. Sem ninguém relatando cota — o agente não a diz —,
 * vale o que o dia custou; e quando o agente nem dinheiro relata, os tokens, e nunca um
 * `US$ 0,00` que diria de graça o que ninguém mediu.
 *
 * A cota que falhou **cai** para o dia, e não para o erro: a manchete existe para dar um
 * número, e o do dia continua sendo verdade. O erro só aparece quando o último recurso
 * também falha.
 */
export function Headline({ now }: { now: number }) {
  const limits = useRateLimits();
  const today = useTodayUsage();

  const top = [...(limits.data ?? [])].sort((a, b) => b.utilization - a.utilization)[0];

  return (
    <Block label="Consumo" quiet>
      {limits.isPending ? (
        <BlockLoading what="o consumo" />
      ) : top !== undefined ? (
        <p className="menubar__headline">
          <strong className="menubar__big">{percentOf(top.utilization)}</strong>
          {top.kind !== null && <span className="menubar__kind">{top.kind}</span>}
          <span className="menubar__note">{untilReset(top.resetsAt, now)}</span>
        </p>
      ) : today.isPending ? (
        <BlockLoading what="o consumo" />
      ) : today.data === undefined ? (
        <BlockError what="o consumo" />
      ) : (
        <p className="menubar__headline">
          <strong className="menubar__big">
            {today.data.cost === null
              ? `${formatTokens(today.data.tokens)} tokens`
              : dayCost(today.data.cost, today.data.currency)}
          </strong>
          <span className="menubar__note">hoje</span>
        </p>
      )}
    </Block>
  );
}
