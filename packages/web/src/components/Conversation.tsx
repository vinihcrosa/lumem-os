import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { AcpServerMessage } from "@lumem/shared";

import { useAwaitingPermission } from "../hooks/useAwaitingPermission.js";
import {
  emptyConversation,
  reduceConversation,
  replayConversation,
  type Block,
  type ConversationState,
  type TerminalView,
} from "../lib/conversation-model.js";
import { connectAcpSocket, type AcpConnect } from "../lib/acp-socket.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Coach, Glyph } from "../ui/index.js";
import { ConfigPills } from "./ConfigPills.js";
import { FreeModeGate } from "./FreeModeGate.js";
import { LumemModePill } from "./LumemModePill.js";
import { Message, Thought, TurnFrame } from "./Message.js";
import { PermissionRequest } from "./PermissionRequest.js";
import { useFirstPermissionCoach, type FirstPermissionCoach } from "../hooks/useFirstPermissionCoach.js";
import { PlanCard } from "./PlanCard.js";
import { SlashMenu, filterCommands, slashQuery } from "./SlashMenu.js";
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
  session: {
    acpSessionId: string;
    model: string;
    mode: string;
    state: string;
    /** O checkout, porque é ele que o portão do `liberado` nomeia (Q4). */
    cwd: string;
  } | null;
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
          modeOwner: message.modeOwner,
          lumemMode: message.lumemMode,
          lumemModeDefault: message.lumemModeDefault,
        },
        session: {
          acpSessionId: message.acpSessionId,
          model: message.model,
          mode: message.mode,
          state: message.state,
          cwd: message.cwd,
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

/** How a finished conversation is fetched. Module level, so the effect is stable. */
const loadStored = (sessionId: string): Promise<AcpServerMessage> =>
  trpc.session.transcript.query({ id: sessionId });

export interface ConversationProps {
  sessionId: string;
  /**
   * False for a conversation that has ended (D13).
   *
   * Then nothing is attached and nothing is launched: the transcript comes off the
   * daemon's disk and the composer is closed. Standing up an adapter costs ~39k tokens
   * of system prompt before the first word, and clicking a tab to reread something
   * must not spend that.
   */
  live?: boolean;
  /** Injectable so a test needs no daemon. */
  connect?: AcpConnect;
  /** Same, for the read path. */
  load?: (sessionId: string) => Promise<AcpServerMessage>;
  /**
   * Offers to continue it (F5.2).
   *
   * Absent when the caller has nowhere to put the new session — resuming creates a new
   * one and something has to switch to it, which this component cannot do.
   */
  onResume?: () => void;
  /** True while the resume is in flight, so the button can say so. */
  resuming?: boolean;
  /**
   * False enquanto outra aba está aberta.
   *
   * As abas ficam **montadas** quando escondidas (`SessionTab`), então o atalho
   * de teclado precisa saber qual delas está na tela: sem isso um `esc` cancelaria
   * o turno de todas as conversas abertas de uma vez.
   */
  active?: boolean;
  /**
   * Uma primeira mensagem que a conversa manda sozinha, uma vez.
   *
   * Existe por causa do rodapé de execução: o vazio sem `[scripts]` oferece
   * *"pedir para o agente criar"*, e o valor daquele botão é justamente não obrigar
   * ninguém a redigitar o pedido. A conversa é aberta **para** essa pergunta.
   *
   * Uma vez, e só depois de `attached`: o socket recusa escrita antes de abrir, e
   * mandar de novo a cada re-render seria um turno por repintura.
   */
  initialPrompt?: string | undefined;
}

export function Conversation({
  sessionId,
  live = true,
  connect = connectAcpSocket,
  load = loadStored,
  onResume,
  resuming = false,
  active = true,
  initialPrompt,
}: ConversationProps) {
  const [state, dispatch] = useReducer(reduce, initial);
  const [draft, setDraft] = useState("");
  /*
   * O portão do `liberado`, aberto e ainda não atravessado (Q4).
   *
   * Estado do componente, e não da sessão: ele não sobrevive a nada. Guardar que
   * alguém já viu o portão é o primeiro passo para ele deixar de ser portão.
   */
  const [gateOpen, setGateOpen] = useState(false);
  const [openThoughts, setOpenThoughts] = useState<ReadonlySet<string>>(new Set());
  const socketRef = useRef<ReturnType<AcpConnect> | null>(null);
  const awaiting = useAwaitingPermission();
  const { conversation, session, failure } = state;
  const pending = conversation.pendingPermission;
  /**
   * The first permission on this machine gets an explanation (F5.4).
   *
   * Driven by whether one is pending rather than by a counter: the balloon is
   * about the concept, and the concept happens exactly when the turn stops and
   * asks.
   */
  const coach = useFirstPermissionCoach(pending !== null);
  /*
   * Closed for writing.
   *
   * Two ways in: the tab was opened on a session that had already ended, and a session
   * that ended while its tab was open — the daemon remembers an exited conversation
   * until it is forgotten, so the socket attaches and reports `exited`. Both are the
   * same thing to the composer, and treating them as one is what keeps a prompt from
   * being sent into a session that cannot answer it.
   */
  const readOnly = !live || session?.state === "exited";

  useEffect(() => {
    dispatch({ kind: "reset" });

    if (!live) {
      /*
       * One read, no socket (D13).
       *
       * The daemon answers with the same `attached` frame the websocket would send, so
       * the reducer below is unchanged — there is one way to build this view, not a
       * live one and a stored one that can disagree about what a conversation looks
       * like.
       */
      let current = true;
      void load(sessionId)
        .then((message) => {
          if (current) dispatch({ kind: "message", message });
        })
        .catch((error: unknown) => {
          if (!current) return;
          dispatch({
            kind: "message",
            message: {
              type: "error",
              code: "INTERNAL",
              message: error instanceof Error ? error.message : "não deu para ler a conversa",
            },
          });
        });
      return () => {
        current = false;
      };
    }

    const socket = connect(sessionId, {
      onMessage: (message) => dispatch({ kind: "message", message }),
    });
    socketRef.current = socket;

    return () => {
      socketRef.current = null;
      // Detach only. The daemon keeps the conversation.
      socket.close();
    };
  }, [sessionId, live, connect, load]);

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

  /*
   * Nada é enviado antes de a sessão estar atada, e o rascunho **não** é limpo
   * quando não deu para enviar.
   *
   * O socket recusa escrita antes de abrir, de propósito — *"mandar antes de o
   * socket abrir é bug de quem chamou"*, diz o `acp-socket`. O bug era aqui: o
   * envio saía, o socket largava, e o `setDraft("")` limpava o texto de qualquer
   * jeito. A pessoa perdia a mensagem e a tela não dizia nada.
   *
   * Foi o CI que cobrou, e só o Linux: numa máquina mais lenta o `attached`
   * chega depois do primeiro clique, e o primeiro turno simplesmente não
   * acontecia. Na minha máquina passava sempre.
   */
  const attached = session !== null;
  const send = useCallback(() => {
    const text = draft.trim();
    if (text === "" || pending !== null || readOnly || !attached) return;
    socketRef.current?.send({ type: "prompt", text });
    setDraft("");
  }, [attached, draft, pending, readOnly]);

  /**
   * O pedido que abriu a conversa, mandado uma vez.
   *
   * O `ref` é o que garante "uma vez": `attached` vira verdadeiro num render e
   * continua verdadeiro nos seguintes, e sem ele todo re-render mandaria o mesmo
   * texto de novo — um turno por repintura, cada um custando tokens.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (initialPrompt === undefined || asked.current || !attached || readOnly) return;
    asked.current = true;
    socketRef.current?.send({ type: "prompt", text: initialPrompt });
  }, [attached, initialPrompt, readOnly]);

  // Null unless the draft is a lone `/word` at the very start: a `/` inside a
  // sentence is a path, and offering a command menu over `src/lore` would be the
  // interface arguing with what is being typed.
  const query = slashQuery(draft);

  const interrupt = useCallback(() => {
    socketRef.current?.send({ type: "cancel" });
  }, []);

  /*
   * `esc` interrompe o turno.
   *
   * O `cancel` existe desde a F5.1, mas só pelo botão do cabeçalho — e a mão de
   * quem está esperando está no composer, não no topo da tela. `esc` é o reflexo
   * de quem usa um agente no terminal, e aqui ele não fazia nada: a pessoa via o
   * turno correr sem ter como pará-lo.
   *
   * A ordem dos três `esc` da tela é a que já existia, e é por isso que estes
   * guardas são condições e não um ouvinte em captura: com o menu de barra aberto
   * `esc` fecha o menu, com uma permissão no ar `esc` nega uma vez, e só quando
   * nenhum dos dois está na frente é que sobra o turno para interromper. Quem
   * chegou antes continua chegando antes.
   *
   * Ouvinte da janela porque o foco pode estar em qualquer lugar da conversa — no
   * textarea, num cartão, em nada. Só a aba visível reage (`active`).
   */
  const streaming = conversation.streaming;
  // O menu só engole `esc` quando está **na tela**: com `/xyz` que não casa com
  // nada ele não renderiza, e aí o `esc` é do turno como seria sem barra nenhuma.
  const menuOpen = query !== null && filterCommands(conversation.commands, query).length > 0;
  useEffect(() => {
    if (!active || readOnly || !streaming) return;
    if (pending !== null || menuOpen) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      interrupt();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, readOnly, streaming, pending, menuOpen, interrupt]);

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
        {/*
          Resuming is an act, not something a tab does by being opened (D13). The
          button is here rather than in the composer because it is about the session
          and not about the message being written — there is no message being written.
        */}
        {readOnly && onResume && (
          <Button variant="primary" size="sm" disabled={resuming} onClick={onResume}>
            {resuming ? "retomando…" : "↻ retomar"}
          </Button>
        )}
        {conversation.streaming && !readOnly && (
          <Button variant="ghost" size="sm" onClick={interrupt}>
            ■ interromper <span className="kbd">esc</span>
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
                  socketRef.current?.send({
                    type: "permission_response",
                    requestId: request.requestId,
                    optionId,
                  });
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

      {/*
        Between the conversation and the composer, as the prototype puts it.
        Continuous state about the session belongs at its edge — as an event in the
        flow it would arrive again on every turn and bury what the turn said.
      */}
      {conversation.usage && <UsageFooter usage={conversation.usage} />}

      <div className="composer">
        <div className="composer__box">
          {/*
            Above the box, anchored to it. The list is the agent's own (F2.8), and
            choosing inserts rather than sends: a command may take an argument, and
            firing on selection would send `/compact` when the user meant
            `/compact até o último commit`.
          */}
          {query !== null && (
            <SlashMenu
              commands={conversation.commands}
              query={query}
              onChoose={setDraft}
              onDismiss={() => setDraft("")}
            />
          )}
          <textarea
            className={`composer__in${draft === "" ? " composer__in--empty" : ""}`}
            value={draft}
            disabled={pending !== null || readOnly}
            placeholder={
              readOnly
                ? "esta conversa terminou — retome para continuar"
                : pending !== null
                  ? "responda o pedido de permissão para continuar"
                  : "escreva, ou / para comandos"
            }
            aria-label="mensagem para o agente"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;

              /*
               * Enter sends. ⇧⏎ makes a newline.
               *
               * This reverses the earlier rule — ⌘⏎ to send, Enter for a newline —
               * which was chosen because a prompt is often several lines. It is a
               * product decision, and it was made again the other way: Enter is
               * what everyone's fingers already do in a chat box, and the cost is
               * that a multi-line prompt needs a modifier instead of not needing
               * one. ⌘⏎ keeps working, so nothing anyone learned stopped working.
               *
               * The slash menu never gets here: it listens on the window in the
               * capture phase and stops the event, so Enter with the menu open
               * chooses a command instead of sending.
               */
              if (event.shiftKey) return;

              // An IME uses Enter to accept a candidate. Sending there would cut
              // the word being typed in half and fire the turn.
              if (event.nativeEvent.isComposing) return;

              event.preventDefault();
              send();
            }}
          />
          <div className="composer__bar">
            {/*
              Disabled while a turn runs, because the daemon refuses the switch
              then (A15). Offering it anyway would be a button whose only outcome
              is an error the user did nothing to cause.
            */}
            {/*
              Uma pílula de modo, sempre, e nunca duas (A1).
              O `modeOwner` vem do daemon: derivar aqui "o agente não mandou
              `mode`, então a pílula é do Lumem" seria uma segunda cópia da regra,
              livre para discordar da primeira.
            */}
            {gateOpen && (
              <FreeModeGate
                cwd={session?.cwd ?? ""}
                onCancel={() => setGateOpen(false)}
                onConfirm={() => {
                  setGateOpen(false);
                  socketRef.current?.send({ type: "set_lumem_mode", mode: "free" });
                }}
              />
            )}
            {conversation.modeOwner === "lumem" && (
              <LumemModePill
                mode={conversation.lumemMode}
                workspaceDefault={conversation.lumemModeDefault}
                disabled={conversation.streaming}
                readOnly={readOnly}
                onSwitch={(mode) => socketRef.current?.send({ type: "set_lumem_mode", mode })}
                onFreeRequested={() => setGateOpen(true)}
              />
            )}
            <ConfigPills
              mode={conversation.mode}
              options={conversation.configOptions}
              disabled={conversation.streaming || readOnly}
              onSwitch={(optionId, value) =>
                socketRef.current?.send({ type: "set_config", optionId, value })
              }
            />
            <span className="spacer" />
            <Button
              variant="primary"
              size="sm"
              disabled={draft.trim() === "" || pending !== null || readOnly || !attached}
              onClick={send}
            >
              enviar <span className="kbd">⏎</span>
            </Button>
          </div>
        </div>
      </div>
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
  return (
    <div className="daysep">
      retomada{at === null ? "" : ` · ${formatWhen(at)}`}
    </div>
  );
}

/** `21 ago 09:02`. Short, because it is a divider and not a record. */
function formatWhen(at: number): string {
  return new Date(at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
            <Coach
              title="a primeira vez que isso aparece"
              onUnderstood={coach.dismiss}
              onNever={coach.never}
            >
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
