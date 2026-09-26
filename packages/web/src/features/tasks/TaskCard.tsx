import type { BoardCard, BoardStatus } from "./board-columns.js";
import { elapsed, sealModifier, TaskSeal } from "./TaskSeal.js";
import { staleLevel } from "./board-columns.js";

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
  /**
   * Em qual coluna ele está.
   *
   * Vem de fora porque o cartão **não carrega o próprio estado**: o daemon
   * agrupa a resposta do quadro por coluna, e `BoardCard` não tem `status` —
   * então `staleLevel(card, now)` lia `undefined` e devolvia `null` para todo
   * cartão, apagando a cor de encalhe do rodapé inteira.
   */
  status: BoardStatus;
  now?: number;
  onOpen: (taskId: string) => void;
  /** Enquanto o cartão está sendo arrastado, ele é fantasma no lugar de origem. */
  ghost?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** O clique do `assistido` (Q51). Ausente é um quadro que não envia nada. */
  onSend?: (taskId: string) => void;
  /** **Parar** (Q57): interrompe o turno em voo e desliga a autonomia. */
  onStop?: (taskId: string) => void;
}

/**
 * A linha que só existe quando há o que dizer (`028` Parte 2, T31 e T32).
 *
 * Duas coisas cabem nela, nunca as duas ao mesmo tempo: **por que parou** e **o
 * que ia ser enviado**. São excludentes por construção — uma tarefa bloqueada
 * não tem prompt preparado, porque bloquear desliga a autonomia dela e o
 * `assistido` não a pega mais.
 */
function noteOf(card: BoardCard): string | null {
  if (card.seal.kind === "blocked") return card.seal.reason;
  return card.preparedPrompt;
}

export function TaskCard({
  card,
  status,
  now = Date.now(),
  onOpen,
  ghost = false,
  onDragStart,
  onDragEnd,
  onSend,
  onStop,
}: TaskCardProps) {
  const stale = staleLevel(card, now, status);
  const tracker = card.links[0];
  const note = noteOf(card);
  const sendable = card.preparedPrompt !== null && onSend !== undefined;
  /*
   * `parar` só aparece quando há o que parar.
   *
   * O verbo custa: ele interrompe um turno pago. Oferecê-lo num cartão em que
   * ninguém está trabalhando seria um botão que não faz nada visível — e um
   * botão assim ensina que os outros também não fazem.
   */
  const stoppable = card.seal.kind === "working" && onStop !== undefined;

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
      {note === null ? null : (
        <div className="tcard__ask">
          <span className="tcard__ask-t">{note}</span>
        </div>
      )}
      {sendable || stoppable ? (
        <div className="tcard__act">
          {/*
            `span` com `role="button"`, e não `<button>`: o cartão inteiro já é
            um `<button>`, e um botão dentro de outro é marcação inválida — o
            navegador desfaz o aninhamento e o cartão se parte em dois.
          */}
          {sendable ? <CardAction label="enviar" onRun={() => onSend(card.id)} /> : null}
          {stoppable ? <CardAction label="parar" onRun={() => onStop(card.id)} /> : null}
        </div>
      ) : null}
      <div className="tcard__foot">
        {card.createdBy === "agent" ? (
          <span className="tcard__from tcard__from--agent">◆ proposta</span>
        ) : tracker === undefined ? null : (
          <span className="tcard__from tcard__from--track">↗ {trackerLabel(tracker)}</span>
        )}
        {card.attempts > 1 ? (
          // Só quando é maior que um: `tentativa 1` é o caso de toda tarefa que
          // a esteira pegou, e escrevê-lo em todo cartão seria um número que
          // não distingue nada de nada.
          <span className="tcard__from">tentativa {card.attempts}</span>
        ) : null}
        <span className={`stale${stale === null ? "" : ` stale--${stale}`}`}>
          {elapsed(card.statusChangedAt, now)}
        </span>
      </div>
    </button>
  );
}

/**
 * Um verbo do cartão.
 *
 * Extraído porque são dois agora — `enviar` e `parar` — e os dois precisam
 * exatamente do mesmo cuidado: parar a propagação do clique, senão ele sobe até
 * o cartão (que é um `<button>` inteiro) e abre a conversa. Duas cópias disso é
 * uma cópia que vai esquecer o `stopPropagation` na próxima.
 */
function CardAction({ label, onRun }: { label: string; onRun: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="btn btn--sm focus-ring"
      onClick={(event) => {
        event.stopPropagation();
        onRun();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onRun();
      }}
    >
      {label}
    </span>
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
