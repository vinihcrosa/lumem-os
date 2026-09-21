import { useCallback, useRef, useState } from "react";

import { absoluteStamp } from "../../lib/relative-time.js";
import { Banner, Coach } from "../../ui/index.js";
import { type Block, type ConversationState, type TerminalView } from "./conversation-model.js";
import { Message, Thought, TurnFrame } from "./Message.js";
import { PermissionRequest } from "./PermissionRequest.js";
import { PlanCard } from "./PlanCard.js";
import { ToolCard } from "./ToolCard.js";
import { useFirstPermissionCoach, type FirstPermissionCoach } from "./useFirstPermissionCoach.js";
import type { ConversationSessionState } from "./useConversationSession.js";

/**
 * A rolagem: falha, vazio, plano, os turnos e o fecho — o que a `Conversation`
 * carregava antes da `032` T27. `Composer` é a irmã dela, do outro lado do
 * mesmo `<div className="conv">`.
 */

export interface TranscriptProps {
  conversation: ConversationState;
  session: ConversationSessionState["session"];
  failure: ConversationSessionState["failure"];
  readOnly: boolean;
  /** Responde um pedido de permissão pendente, pelo id do bloco que o mostrou. */
  answer(requestId: string, optionId: string): void;
}

export function Transcript({ conversation, session, failure, readOnly, answer }: TranscriptProps) {
  const [openThoughts, setOpenThoughts] = useState<ReadonlySet<string>>(new Set());
  /**
   * The first permission on this machine gets an explanation (F5.4).
   *
   * Driven by whether one is pending rather than by a counter: the balloon is
   * about the concept, and the concept happens exactly when the turn stops and
   * asks.
   */
  const coach = useFirstPermissionCoach(conversation.pendingPermission !== null);
  const scroll = useAutoScroll();

  return (
    <div className="conv__scroll" ref={scroll}>
      {failure?.fatal && (
        <div className="fail">
          <div className="fail__title">
            <span aria-hidden="true">⚠</span>
            {failure.remedy ? "o adaptador ACP não subiu" : "a sessão não está disponível"}
          </div>
          <div className="fail__body">{failure.message}</div>
          {/* A launch failure is a sentence with a way out (F1.6). The command
              is the way out, and it is selectable rather than a button because
              the fix happens in a terminal, not here. */}
          {failure.remedy && <div className="fail__cmd">{failure.remedy}</div>}
        </div>
      )}

      {failure && !failure.fatal && <Banner tone="danger">{failure.message}</Banner>}

      {conversation.turns.length === 0 && !failure && <EmptyConversation ready={session !== null} />}

      {/*
        Above the turns, not inside one.

        The plan belongs to the conversation rather than to the turn that
        announced it: the agent reissues it across turns, and a card nested in
        whichever turn happened to mention it last would jump down the page every
        time a step finished.
      */}
      {conversation.plan && <PlanCard entries={conversation.plan} />}

      {conversation.turns.map((turn, turnIndex) =>
        turn.role === "resumed" ? (
          <ResumeMark key={turnIndex} at={turn.at ?? null} />
        ) : (
          <TurnFrame key={turnIndex} role={turn.role}>
            {turn.blocks.map((block, blockIndex) => (
              <BlockView
                key={blockIndex}
                block={block}
                terminals={conversation.terminals}
                // Only the last block of the last turn can still be growing.
                streaming={
                  conversation.streaming &&
                  turnIndex === conversation.turns.length - 1 &&
                  blockIndex === turn.blocks.length - 1
                }
                openThoughts={openThoughts}
                onToggleThought={(messageId) =>
                  setOpenThoughts((current) => {
                    const copy = new Set(current);
                    if (copy.has(messageId)) copy.delete(messageId);
                    else copy.add(messageId);
                    return copy;
                  })
                }
                onRespond={(optionId) => {
                  const request = conversation.pendingPermission;
                  if (!request) return;
                  answer(request.requestId, optionId);
                }}
                coach={coach}
              />
            ))}
          </TurnFrame>
        ),
      )}

      {/*
        The end of the record, said once, at the bottom.

        The chip in the tab strip already says `exited`; what is missing there is that
        there is nothing more to read — an empty scroll and a finished conversation
        look the same otherwise.
      */}
      {readOnly && session && <div className="daysep">conversa encerrada</div>}
    </div>
  );
}

/**
 * Where one conversation ended and the next picked it up (F5.2, D12).
 *
 * Drawn from a recorded event rather than from the fact that the session has a
 * `resumedFromId`, so it lands in the same place on a replay as it did live.
 */
function ResumeMark({ at }: { at: number | null }) {
  return <div className="daysep">retomada{at === null ? "" : ` · ${absoluteStamp(at, "short")}`}</div>;
}

// ------------------------------------------------------------------ the blocks

interface BlockViewProps {
  block: Block;
  /** The conversation's terminals; a card picks out its own by id. */
  terminals: readonly TerminalView[];
  streaming: boolean;
  openThoughts: ReadonlySet<string>;
  onToggleThought(messageId: string): void;
  onRespond(optionId: string): void;
  /** The first-time explanation of `Auto`, if it is still owed. */
  coach: FirstPermissionCoach;
}

function BlockView({
  block,
  terminals,
  streaming,
  openThoughts,
  onToggleThought,
  onRespond,
  coach,
}: BlockViewProps) {
  switch (block.kind) {
    case "message":
      return <Message text={block.text} streaming={streaming} />;
    case "thought":
      return (
        <Thought
          text={block.text}
          open={openThoughts.has(block.messageId)}
          onToggle={() => onToggleThought(block.messageId)}
          streaming={streaming}
        />
      );
    case "tool":
      return <ToolCard call={block.call} terminals={terminals} />;
    case "permission":
      return (
        <>
          <PermissionRequest request={block.request} onRespond={onRespond} />
          {/*
            Depois do pedido, nunca sobre ele (F5.4).
            A primeira ação continua sendo responder: o balão explica o modo, e o
            turno está parado esperando uma pessoa — pôr a lição na frente da
            decisão atrasaria as duas.
          */}
          {coach.show && (
            <Coach title="a primeira vez que isso aparece" onUnderstood={coach.dismiss} onNever={coach.never}>
              É assim que o Lumem te mantém no controle: o modo <b>Auto</b> resolve sozinho o que é
              leitura e escrita dentro desta worktree, e para em tudo que sai disso — rede, comando
              global, arquivo fora dela. Para ver o plano antes de qualquer execução, troque para{" "}
              <b>Plano</b> na barra acima.
            </Coach>
          )}
        </>
      );
    case "note":
      // `.unknown`, not `.meta`: the prototype keeps two classes because they say
      // different things — an event nobody recognised, and something the session
      // reports about itself. This is the first. Grey, in place, and never thrown
      // (D3); silence is what makes a tab look stuck for no reason.
      return <div className="unknown">{block.text}</div>;
    case "meta":
      // `.meta`, e não `.unknown`: a sessão contando o que ela fez não é um
      // evento que ninguém reconheceu. Mesma forma, outro significado — o
      // protótipo mantém as duas classes justamente por isso.
      return <div className="meta">{block.text}</div>;
  }
}

/**
 * A session that exists and has said nothing.
 *
 * Not a blank panel: the session already cost about 39k tokens of system prompt
 * before anyone typed a word, measured in the spike, and that is the first thing
 * worth knowing when the tab opens.
 */
function EmptyConversation({ ready }: { ready: boolean }) {
  return (
    <div className="empty">
      <span className="empty__glyph" aria-hidden="true">
        ◆
      </span>
      <span className="empty__title">{ready ? "sessão aberta, nada pedido ainda" : "conectando…"}</span>
      {ready && (
        <span className="empty__sub">
          O adaptador subiu e o handshake passou sem consumir nada. O primeiro turno já entra com{" "}
          <b>39,2k</b> de contexto — system prompt e ferramentas do próprio Claude Code, não do
          Lumem.
        </span>
      )}
    </div>
  );
}

/**
 * Follows the conversation, unless the reader went looking.
 *
 * Scrolling to the bottom on every event is right until someone scrolls up to
 * read something, at which point it is the most hostile thing an interface can
 * do. So it only follows when it was already at the bottom.
 *
 * What decides *when* to follow is the DOM, not a dependency array. The array
 * was `[turns.length, streaming]`, and neither moves while the agent writes: a
 * chunk appended to the last message is the same number of turns and the same
 * boolean, so the text that just arrived scrolled out of view and nothing put
 * it back. A `MutationObserver` on the scroller sees every one of them —
 * appended chunk, tool card, plan, terminal row — without the caller having to
 * enumerate what can grow.
 */
function useAutoScroll(): React.RefCallback<HTMLDivElement> {
  const pinnedRef = useRef(true);
  const detachRef = useRef<(() => void) | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    detachRef.current?.();
    detachRef.current = null;
    if (!node) return;

    const follow = (): void => {
      if (pinnedRef.current) node.scrollTop = node.scrollHeight;
    };
    const onScroll = (): void => {
      // A small tolerance: a fractional scrollTop from a zoomed page would
      // otherwise read as "the user scrolled up by half a pixel".
      pinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    // `characterData` is the streaming case: the chunk that grows a text node
    // already on screen adds no element, so `childList` alone would miss it.
    const observer = new MutationObserver(follow);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    follow();

    detachRef.current = () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);
}
