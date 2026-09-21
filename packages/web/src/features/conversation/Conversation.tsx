import { useCallback, useEffect, useRef, useState } from "react";

import type { AcpServerMessage } from "@lumem/shared";

import { absoluteStamp } from "../../lib/relative-time.js";
import { type Block, type TerminalView } from "./conversation-model.js";
import { type AcpConnect } from "./acp-socket.js";
import { useConversationSession } from "./useConversationSession.js";
import { Banner, Button, Coach, Glyph } from "../../ui/index.js";
import { ConfigPills } from "./ConfigPills.js";
import { FreeModeGate } from "./FreeModeGate.js";
import { LumemModeMenu, LumemModePill } from "./LumemModePill.js";
import { Message, Thought, TurnFrame } from "./Message.js";
import { PermissionRequest } from "./PermissionRequest.js";
import { useArrival } from "./useArrival.js";
import { useFirstPermissionCoach, type FirstPermissionCoach } from "./useFirstPermissionCoach.js";
import { PlanCard } from "./PlanCard.js";
import { SlashMenu, filterCommands, slashQuery } from "./SlashMenu.js";
import { ToolCard } from "./ToolCard.js";
import { UsageFooter } from "./UsageFooter.js";


/**
 * The conversation, assembled.
 *
 * Message, tool call and permission — and only those (A2, D6). The plan, the
 * usage footer, the mode and model selectors and slash commands are phase 4:
 * the prototype draws them all, and porting all of them now is a phase 3 that
 * does not close.
 */

export interface ConversationProps {
  sessionId: string;
  /**
   * Quem está falando, pelo nome da configuração de agente.
   *
   * Era a string `claude`, escrita à mão no cabeçalho. Com um agente ninguém
   * notava; com dois, as duas conversas diziam a mesma coisa — foi o que a F4 da
   * `second-agent` foi conferir. O nome vem da `agent_config`, que é o mesmo que
   * a aba usa, para a aba e o cabeçalho nunca discordarem.
   */
  agentName?: string;
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
}

export function Conversation({
  sessionId,
  // "agente" e não "claude": um default que nomeia um agente específico é o
  // defeito que a F4 achou, com outro valor.
  agentName = "agente",
  live,
  connect,
  load,
  onResume,
  resuming = false,
  active = true,
}: ConversationProps) {
  // O reducer, o socket e o aviso de quem está esperando moraram aqui até a
  // `032` T26 — o transporte da sessão agora é deste hook, e o que sobra é o
  // que é do componente: rascunho, teclado, os dois menus, o portão.
  const {
    state,
    attached,
    readOnly,
    send: sendPrompt,
    cancel: interrupt,
    answer,
    setMode,
    setConfig,
  } = useConversationSession(sessionId, { live, connect, load });
  const { conversation, session, failure } = state;
  const pending = conversation.pendingPermission;
  /**
   * A chegada desta sessão — o antigo `ask`/`draft`/`openSessionId`, fundidos
   * (`032` T21/T22). `useArrival` já consome do store; aqui só se traduz o que
   * ela trouxe em `send: true` (manda sozinha) ou `send: false` (só preenche).
   */
  const arrival = useArrival(sessionId);
  // O rascunho começa com o que a chegada trouxe, se trouxe **e** não for para
  // mandar sozinha. No inicializador e não num efeito: um efeito atropelaria o
  // primeiro caractere de quem começasse a digitar antes de ele rodar.
  const [draft, setDraft] = useState(() =>
    arrival !== null && !arrival.send ? arrival.text ?? "" : "",
  );
  /*
   * O portão do `liberado`, aberto e ainda não atravessado (Q4).
   *
   * Estado do componente, e não da sessão: ele não sobrevive a nada. Guardar que
   * alguém já viu o portão é o primeiro passo para ele deixar de ser portão.
   */
  const [gateOpen, setGateOpen] = useState(false);
  /*
   * O menu do modo do Lumem, aberto.
   *
   * O ESTADO mora aqui, e o menu não: ele voltou para dentro da pílula quando o
   * `.composer__box` deixou de recortar (composer-menus). Quem continua aqui é o
   * booleano, porque escolher `liberado` abre o portão — e o portão é do
   * composer.
   */
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [openThoughts, setOpenThoughts] = useState<ReadonlySet<string>>(new Set());
  /**
   * The first permission on this machine gets an explanation (F5.4).
   *
   * Driven by whether one is pending rather than by a counter: the balloon is
   * about the concept, and the concept happens exactly when the turn stops and
   * asks.
   */
  const coach = useFirstPermissionCoach(pending !== null);

  /*
   * Uma condição, e os três a usam: a pílula, o menu e o portão.
   *
   * O daemon recusa a troca no meio de um turno e o socket não leva nada quando
   * não está atado. Enquanto isto morava só no `disabled` da pílula, havia um
   * caminho: abrir o menu parado, o turno começar, e o menu continuar clicável —
   * o clique mandava `set_lumem_mode`, o daemon respondia `BLOCKED`, e a pessoa
   * lia um erro que não causou. Uma condição derivada uma vez é o que impede a
   * pílula e o menu de discordarem.
   */
  const canSwitchMode = !conversation.streaming && attached;

  /*
   * E os dois FECHAM quando ela cai.
   *
   * Só esconder no render deixaria o estado para trás: o turno acaba, o menu
   * reaparece aberto, e o que a pessoa vê é um popover que ela não abriu.
   */
  useEffect(() => {
    if (canSwitchMode) return;
    setModeMenuOpen(false);
    setGateOpen(false);
  }, [canSwitchMode]);

  const send = useCallback(() => {
    if (sendPrompt(draft)) setDraft("");
  }, [draft, sendPrompt]);

  /**
   * O pedido que abriu a conversa, mandado uma vez.
   *
   * O `ref` é o que garante "uma vez": `attached` vira verdadeiro num render e
   * continua verdadeiro nos seguintes, e sem ele todo re-render mandaria o mesmo
   * texto de novo — um turno por repintura, cada um custando tokens.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (arrival === null || !arrival.send || asked.current || !attached || readOnly) return;
    asked.current = true;
    sendPrompt(arrival.text ?? "");
  }, [attached, arrival, readOnly, sendPrompt]);

  // Null unless the draft is a lone `/word` at the very start: a `/` inside a
  // sentence is a path, and offering a command menu over `src/lore` would be the
  // interface arguing with what is being typed.
  const query = slashQuery(draft);

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

  const scroll = useAutoScroll();

  return (
    <div className="conv">
      <div className="conv__head">
        <span className="conv__who">
          <Glyph tone="agent">◆</Glyph>
          {agentName}
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

      {/*
        Between the conversation and the composer, as the prototype puts it.
        Continuous state about the session belongs at its edge — as an event in the
        flow it would arrive again on every turn and bury what the turn said.
      */}
      {conversation.usage && <UsageFooter usage={conversation.usage} />}

      <div className="composer">
        {/*
          O portão nasce aqui, e é o único que nasce (composer-menus).

          Ele não é menu: é um cartão de 420px, mais largo que a pílula que o
          originou — e a pílula já saiu de jogo quando ele aparece, porque o menu
          que o abriu fechou. Cartão desse tamanho alinha com a caixa. Os menus
          voltaram para as suas pílulas, na barra abaixo.
        */}
        {gateOpen && canSwitchMode && (
          <FreeModeGate
            cwd={session?.cwd ?? ""}
            onCancel={() => setGateOpen(false)}
            onConfirm={() => {
              setGateOpen(false);
              setMode("free");
            }}
          />
        )}
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
            {conversation.modeOwner === "lumem" && (
              /*
                A pílula e o menu dela, no mesmo `.config` que as pílulas do
                agente usam (composer-menus). Um popover ancora no que o abre —
                e o `.composer__box` não recorta mais nada.
              */
              <span className="config">
                <LumemModePill
                  mode={conversation.lumemMode}
                  /*
                   * Desligada no meio do turno (F1.7) e sem daemon.
                   *
                   * A pílula **fica** nos dois casos — ela é estado local da
                   * sessão, e não depende de handshake para ser exibida —, mas a
                   * troca viaja pelo socket, e um botão cujo único resultado é
                   * erro não é um botão.
                   */
                  disabled={!canSwitchMode}
                  readOnly={readOnly}
                  open={modeMenuOpen}
                  onToggle={() => setModeMenuOpen(!modeMenuOpen)}
                />
                {modeMenuOpen && canSwitchMode && (
                  <LumemModeMenu
                    mode={conversation.lumemMode}
                    workspaceDefault={conversation.lumemModeDefault}
                    onSwitch={(mode) => {
                      setModeMenuOpen(false);
                      setMode(mode);
                    }}
                    onFreeRequested={() => {
                      setModeMenuOpen(false);
                      setGateOpen(true);
                    }}
                  />
                )}
              </span>
            )}
            <ConfigPills
              mode={conversation.mode}
              options={conversation.configOptions}
              disabled={conversation.streaming || readOnly}
              onSwitch={(optionId, value) => setConfig(optionId, value)}
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
      retomada{at === null ? "" : ` · ${absoluteStamp(at, "short")}`}
    </div>
  );
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
