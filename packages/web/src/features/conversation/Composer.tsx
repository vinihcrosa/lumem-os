import { useCallback, useEffect, useRef, useState } from "react";

import type { LumemMode } from "@lumem/shared";

import { Button } from "../../ui/index.js";
import { type ConversationState } from "./conversation-model.js";
import { ConfigPills } from "./ConfigPills.js";
import { FreeModeGate } from "./FreeModeGate.js";
import { LumemModeMenu, LumemModePill } from "./LumemModePill.js";
import { SlashMenu, filterCommands, slashQuery } from "./SlashMenu.js";
import { UsageFooter } from "./UsageFooter.js";
import { useArrival } from "./useArrival.js";
import type { ConversationSessionState } from "./useConversationSession.js";

/**
 * O rascunho e o envio — o que a `Conversation` carregava antes da `032` T27:
 * a chegada, a pílula do modo do Lumem e o menu dela, o portão do `liberado`,
 * o menu de `/comandos`, as pílulas do agente e o rodapé de uso.
 */

export interface ComposerProps {
  sessionId: string;
  conversation: ConversationState;
  session: ConversationSessionState["session"];
  attached: boolean;
  readOnly: boolean;
  /**
   * False enquanto outra aba está aberta.
   *
   * As abas ficam **montadas** quando escondidas (`SessionTab`), então o
   * atalho de teclado precisa saber qual delas está na tela: sem isso um
   * `esc` cancelaria o turno de todas as conversas abertas de uma vez.
   */
  active: boolean;
  /** Sends a prompt. Returns false, and sends nothing, when the session cannot take it. */
  send(text: string): boolean;
  /** Interrupts the turn in flight. */
  cancel(): void;
  setMode(mode: LumemMode): void;
  setConfig(optionId: string, value: string): void;
}

export function Composer({
  sessionId,
  conversation,
  session,
  attached,
  readOnly,
  active,
  send: sendPrompt,
  cancel: interrupt,
  setMode,
  setConfig,
}: ComposerProps) {
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
  const [draft, setDraft] = useState(() => (arrival !== null && !arrival.send ? arrival.text ?? "" : ""));
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
   * O pedido que abriu a conversa, mandado uma vez — e só quando `arrival.send`
   * pede isso explicitamente. É a mesma regra do núcleo da memória: injeção
   * invisível é proibida, e mandar o texto da chegada sozinho sem essa
   * marcação seria disparar um turno que ninguém leu antes de custar dinheiro.
   *
   * O `ref` é o que garante "uma vez": `attached` vira verdadeiro num render e
   * continua verdadeiro nos seguintes, e sem ele todo re-render mandaria o mesmo
   * texto de novo — um turno por repintura, cada um custando tokens.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (arrival === null || !arrival.send || asked.current || !attached || readOnly) return;
    /*
     * Só marca "já pedi" se `sendPrompt` de fato mandou (achado 12 da revisão
     * independente). `sendPrompt` também recusa com uma permissão pendente
     * numa conversa retomada — marcar o `ref` antes disso descartava o pedido
     * da chegada em silêncio e nunca repetia, porque nada dispara este efeito
     * de novo sozinho. `sendPrompt` muda de identidade quando a permissão se
     * resolve (ela está nas suas próprias deps), e é isso que faz o efeito
     * rodar de novo e tentar outra vez.
     */
    if (sendPrompt(arrival.text ?? "")) asked.current = true;
  }, [attached, arrival, readOnly, sendPrompt]);

  // Null unless the draft is a lone `/word` at the very start: a `/` inside a
  // sentence is a path, and offering a command menu over `src/lore` would be the
  // interface arguing with what is being typed.
  const query = slashQuery(draft);

  /*
   * `esc` interrompe o turno.
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

  return (
    <>
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
    </>
  );
}
