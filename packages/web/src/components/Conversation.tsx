import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { AcpServerMessage } from "@lumem/shared";

import { useAwaitingPermission } from "../hooks/useAwaitingPermission.js";
import {
  emptyConversation,
  reduceConversation,
  replayConversation,
  type Block,
  type ConversationState,
} from "../lib/conversation-model.js";
import { connectAcpSocket, type AcpConnect } from "../lib/acp-socket.js";
import { Banner, Button, Glyph } from "../ui/index.js";
import { ConfigPills } from "./ConfigPills.js";
import { Message, Thought, TurnFrame } from "./Message.js";
import { PermissionRequest } from "./PermissionRequest.js";
import { PlanCard } from "./PlanCard.js";
import { ToolCard } from "./ToolCard.js";
import { UsageFooter } from "./UsageFooter.js";

import "./conversation.css";

/**
 * The conversation, assembled.
 *
 * Message, tool call and permission — and only those (A2, D6). The plan, the
 * usage footer, the mode and model selectors and slash commands are phase 4:
 * the prototype draws them all, and porting all of them now is a phase 3 that
 * does not close.
 */

/** What the reducer is fed: the socket's frames, or a reset. */
type Action =
  | { kind: "message"; message: AcpServerMessage }
  | { kind: "reset" };

interface ViewState {
  conversation: ConversationState;
  /** Set once the daemon answers the attach. Null while connecting. */
  session: { acpSessionId: string; model: string; mode: string; state: string } | null;
  /** A launch failure or a refusal — something with a remedy, or a dead end. */
  failure: { message: string; remedy: string | null; fatal: boolean } | null;
}

const initial: ViewState = { conversation: emptyConversation(), session: null, failure: null };

function reduce(state: ViewState, action: Action): ViewState {
  if (action.kind === "reset") return initial;

  const message = action.message;
  switch (message.type) {
    case "attached":
      // Replayed, not merged. A reattach after a dropped socket must not stack a
      // second copy of the conversation on top of what is already there.
      return {
        // The selectors arrive on the attach frame rather than as an event, so they
        // are seeded here — otherwise a tab would open with no pills at all until
        // the agent happened to change something.
        conversation: {
          ...replayConversation(message.transcript),
          mode: message.mode,
          configOptions: message.configOptions,
        },
        session: {
          acpSessionId: message.acpSessionId,
          model: message.model,
          mode: message.mode,
          state: message.state,
        },
        failure: null,
      };

    case "event":
      return {
        ...state,
        conversation: reduceConversation(state.conversation, {
          at: message.at,
          event: message.event,
        }),
      };

    case "error":
      return {
        ...state,
        failure: {
          message: message.message,
          remedy: message.remedy ?? null,
          // These two end the session; anything else is one bad frame and the
          // conversation is still usable.
          fatal: message.code === "ADAPTER_UNAVAILABLE" || message.code === "SESSION_NOT_FOUND",
        },
      };
  }
}

export interface ConversationProps {
  sessionId: string;
  /** Injectable so a test needs no daemon. */
  connect?: AcpConnect;
}

export function Conversation({ sessionId, connect = connectAcpSocket }: ConversationProps) {
  const [state, dispatch] = useReducer(reduce, initial);
  const [draft, setDraft] = useState("");
  const [openThoughts, setOpenThoughts] = useState<ReadonlySet<string>>(new Set());
  const socketRef = useRef<ReturnType<AcpConnect> | null>(null);
  const awaiting = useAwaitingPermission();

  const { conversation, session, failure } = state;
  const pending = conversation.pendingPermission;

  useEffect(() => {
    dispatch({ kind: "reset" });
    const socket = connect(sessionId, {
      onMessage: (message) => dispatch({ kind: "message", message }),
    });
    socketRef.current = socket;

    return () => {
      socketRef.current = null;
      // Detach only. The daemon keeps the conversation.
      socket.close();
    };
  }, [sessionId, connect]);

  // The tab strip and the sidebar read this. Reported from here because this is
  // the only thing that knows.
  useEffect(() => {
    awaiting.setWaiting(sessionId, pending !== null);
  }, [awaiting, sessionId, pending]);

  /*
   * Cleared on unmount, through a ref rather than the value itself.
   *
   * `awaiting` is a fresh object whenever the shared set changes, and a cleanup
   * that depended on it would run on every one of those changes: it would clear
   * the flag, the clearing would change the set, the new identity would run the
   * cleanup again, and the effect above would set it back. The two oscillated
   * forever and hung the test run rather than failing it.
   */
  const setWaitingRef = useRef(awaiting.setWaiting);
  setWaitingRef.current = awaiting.setWaiting;
  useEffect(
    () => () => {
      setWaitingRef.current(sessionId, false);
    },
    [sessionId],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (text === "" || pending !== null) return;
    socketRef.current?.send({ type: "prompt", text });
    setDraft("");
  }, [draft, pending]);

  const scroll = useAutoScroll([conversation.turns.length, conversation.streaming]);

  return (
    <div className="conv">
      <div className="conv__head">
        <span className="conv__who">
          <Glyph tone="agent">◆</Glyph>
          claude
        </span>
        {session && (
          <span className="conv__adapter">
            sessão {session.acpSessionId.slice(0, 8)} · {session.model} · {session.mode}
          </span>
        )}
        <span className="spacer" />
        {conversation.streaming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => socketRef.current?.send({ type: "cancel" })}
          >
            ■ interromper
          </Button>
        )}
      </div>

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

        {failure && !failure.fatal && (
          <Banner tone="danger">{failure.message}</Banner>
        )}

        {conversation.turns.length === 0 && !failure && <EmptyConversation ready={session !== null} />}

        {/*
          Above the turns, not inside one.
          
          The plan belongs to the conversation rather than to the turn that
          announced it: the agent reissues it across turns, and a card nested in
          whichever turn happened to mention it last would jump down the page every
          time a step finished.
        */}
        {conversation.plan && <PlanCard entries={conversation.plan} />}

        {conversation.turns.map((turn, turnIndex) => (
          <TurnFrame key={turnIndex} role={turn.role}>
            {turn.blocks.map((block, blockIndex) => (
              <BlockView
                key={blockIndex}
                block={block}
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
                  socketRef.current?.send({
                    type: "permission_response",
                    requestId: request.requestId,
                    optionId,
                  });
                }}
              />
            ))}
          </TurnFrame>
        ))}
      </div>

      {/*
        Between the conversation and the composer, as the prototype puts it.
        Continuous state about the session belongs at its edge — as an event in the
        flow it would arrive again on every turn and bury what the turn said.
      */}
      {conversation.usage && <UsageFooter usage={conversation.usage} />}

      <div className="composer">
        <div className="composer__box">
          <textarea
            className={`composer__in${draft === "" ? " composer__in--empty" : ""}`}
            value={draft}
            disabled={pending !== null}
            placeholder={
              pending !== null
                ? "responda o pedido de permissão para continuar"
                : "escreva, ou / para comandos"
            }
            aria-label="mensagem para o agente"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // ⌘⏎ sends, Enter does not: a prompt is often several lines, and a
              // conversation that fires on the first newline cannot take one.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="composer__bar">
            {/*
              Disabled while a turn runs, because the daemon refuses the switch
              then (A15). Offering it anyway would be a button whose only outcome
              is an error the user did nothing to cause.
            */}
            <ConfigPills
              mode={conversation.mode}
              options={conversation.configOptions}
              disabled={conversation.streaming}
              onSwitch={(optionId, value) =>
                socketRef.current?.send({ type: "set_config", optionId, value })
              }
            />
            <span className="spacer" />
            <Button variant="primary" size="sm" disabled={draft.trim() === "" || pending !== null} onClick={send}>
              enviar <span className="kbd">⌘⏎</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the blocks

interface BlockViewProps {
  block: Block;
  streaming: boolean;
  openThoughts: ReadonlySet<string>;
  onToggleThought(messageId: string): void;
  onRespond(optionId: string): void;
}

function BlockView({
  block,
  streaming,
  openThoughts,
  onToggleThought,
  onRespond,
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
      return <ToolCard call={block.call} />;
    case "permission":
      return <PermissionRequest request={block.request} onRespond={onRespond} />;
    case "note":
      // `.unknown`, not `.meta`: the prototype keeps two classes because they say
      // different things — an event nobody recognised, and something the session
      // reports about itself. This is the first. Grey, in place, and never thrown
      // (D3); silence is what makes a tab look stuck for no reason.
      return <div className="unknown">{block.text}</div>;
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
      <span className="empty__title">
        {ready ? "sessão aberta, nada pedido ainda" : "conectando…"}
      </span>
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
 */
function useAutoScroll(deps: readonly unknown[]): React.RefCallback<HTMLDivElement> {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  const ref = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (!node) return;
    const onScroll = (): void => {
      // A small tolerance: a fractional scrollTop from a zoomed page would
      // otherwise read as "the user scrolled up by half a pixel".
      pinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    };
    node.addEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (node && pinnedRef.current) node.scrollTop = node.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller names what moved
  }, deps);

  return ref;
}
