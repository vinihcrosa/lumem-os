import type { BoardCard } from "../lib/board.js";
import { elapsed, sealModifier, TaskSeal } from "./TaskSeal.js";
import { staleLevel } from "../lib/board.js";

/**
 * O cartão (`028` §4.2, T10).
 *
 * O que se lê **sem abrir**: projeto, custo, título, selo, encalhe e origem. A
 * barra de 2px à esquerda carrega **um eixo só** — o selo. O encalhe mora no
 * relógio do rodapé e a agregação no ponto do cabeçalho da coluna: três
 * lugares, três perguntas. Duas cores no mesmo elemento não seriam nenhuma.
 *
 * **Origem é categoria, então é glifo** — `◆` agente, `↗` tracker. Foi a lição
 * que a triagem pagou caro (§10.2): duas cores afirmando serem diferentes
 * quando `session-agent` e `text-link` são o mesmo `brand-400`.
 */

/** `US$ 0,31`, ou o travessão de quem ainda não gastou. */
function costLabel(card: BoardCard): string {
  if (card.cost === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: card.currency ?? "USD",
  }).format(card.cost);
}

export interface TaskCardProps {
  card: BoardCard;
  now?: number;
  onOpen: (taskId: string) => void;
  /** Enquanto o cartão está sendo arrastado, ele é fantasma no lugar de origem. */
  ghost?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function TaskCard({
  card,
  now = Date.now(),
  onOpen,
  ghost = false,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const stale = staleLevel(card, now);
  const tracker = card.links[0];

  return (
    <button
      type="button"
      className={`tcard tcard--${sealModifier(card.seal)}${ghost ? " tcard--ghost" : ""} focus-ring`}
      onClick={() => onOpen(card.id)}
      // HTML5 e não uma biblioteca: o gesto é soltar um cartão numa lista, e a
      // parte difícil dele — onde soltou vira índice — é aritmética de posição
      // do ponteiro, que nenhuma biblioteca decide melhor do que o daemon.
      draggable={onDragStart !== undefined}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.id);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="tcard__top">
        <span className="glyph glyph--project">■</span>
        <span className="tcard__proj">{card.projectName}</span>
        <span className={`tcard__cost${card.cost === null ? " tcard__cost--none" : ""}`}>
          {costLabel(card)}
        </span>
      </div>
      <div className="tcard__t">{card.title}</div>
      <TaskSeal seal={card.seal} now={now} />
      <div className="tcard__foot">
        {card.createdBy === "agent" ? (
          <span className="tcard__from tcard__from--agent">◆ proposta</span>
        ) : tracker === undefined ? null : (
          <span className="tcard__from tcard__from--track">↗ {trackerLabel(tracker)}</span>
        )}
        <span className={`stale${stale === null ? "" : ` stale--${stale}`}`}>
          {elapsed(card.statusChangedAt, now)}
        </span>
      </div>
    </button>
  );
}

/**
 * `ACME-142` a partir da URL da issue.
 *
 * O último segmento não vazio, e não um parser por tracker: o cartão tem 200px
 * e o que cabe ali é um identificador curto. Uma URL que não termine em um
 * aparece inteira e trunca — feio, e honesto.
 */
function trackerLabel(url: string): string {
  const parts = url.split("/").filter((part) => part !== "");
  return parts[parts.length - 1] ?? url;
}
