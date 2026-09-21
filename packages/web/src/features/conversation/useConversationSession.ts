import { useCallback, useEffect, useReducer, useRef } from "react";

import type { AcpServerMessage, LumemMode } from "@lumem/shared";

import { useAwaitingPermission } from "../../hooks/useAwaitingPermission.js";
import { trpc } from "../../lib/trpc.js";
import {
  emptyConversation,
  reduceConversation,
  replayConversation,
  type ConversationState,
} from "./conversation-model.js";
import { connectAcpSocket, type AcpConnect } from "./acp-socket.js";

/**
 * O transporte da conversa: o reducer, o socket e o aviso de quem está
 * esperando — a `Conversation` só os carregava porque não tinha para onde
 * mandá-los (`032` T26). O que fica no componente é o que é dele: rascunho,
 * teclado, os dois menus e o portão do liberado.
 */

/** O que o reducer recebe: um frame do socket, ou um reset. */
type Action = { kind: "message"; message: AcpServerMessage } | { kind: "reset" };

export interface ConversationSessionState {
  conversation: ConversationState;
  /** Preenchido quando o daemon responde o attach. Nulo enquanto conecta. */
  session: {
    acpSessionId: string;
    model: string;
    mode: string;
    state: string;
    /** O checkout, porque é ele que o portão do `liberado` nomeia (Q4). */
    cwd: string;
  } | null;
  /** Uma falha de lançamento ou uma recusa — algo com remédio, ou sem saída. */
  failure: { message: string; remedy: string | null; fatal: boolean } | null;
}

const initial: ConversationSessionState = {
  conversation: emptyConversation(),
  session: null,
  failure: null,
};

function reduce(
  state: ConversationSessionState,
  action: Action,
): ConversationSessionState {
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

export interface UseConversationSessionOptions {
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
}

export interface ConversationSession {
  state: ConversationSessionState;
  /** True once the daemon has answered the attach. */
  attached: boolean;
  /**
   * Closed for writing.
   *
   * Two ways in: the tab was opened on a session that had already ended, and a session
   * that ended while its tab was open — the daemon remembers an exited conversation
   * until it is forgotten, so the socket attaches and reports `exited`. Both are the
   * same thing to the composer, and treating them as one is what keeps a prompt from
   * being sent into a session that cannot answer it.
   */
  readOnly: boolean;
  /** Sends a prompt. Returns false, and sends nothing, when the session cannot take it. */
  send(text: string): boolean;
  /** Interrupts the turn in flight. */
  cancel(): void;
  /** Answers a pending permission request. */
  answer(requestId: string, optionId: string): void;
  /** Switches the Lumem policy (`session-mode`). */
  setMode(mode: LumemMode): void;
  /** Switches an agent-offered configuration (model, effort, …). */
  setConfig(optionId: string, value: string): void;
}

export function useConversationSession(
  sessionId: string,
  {
    live = true,
    connect = connectAcpSocket,
    load = loadStored,
  }: UseConversationSessionOptions = {},
): ConversationSession {
  const [state, dispatch] = useReducer(reduce, initial);
  const socketRef = useRef<ReturnType<AcpConnect> | null>(null);
  const awaiting = useAwaitingPermission();
  const pending = state.conversation.pendingPermission;

  useEffect(() => {
    dispatch({ kind: "reset" });

    if (!live) {
      /*
       * One read, no socket (D13).
       *
       * The daemon answers with the same `attached` frame the websocket would send, so
       * the reducer above is unchanged — there is one way to build this view, not a
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

  const attached = state.session !== null;
  const readOnly = !live || state.session?.state === "exited";

  /*
   * Devolve `boolean`, e não `void` — achado pelo CI, só no Linux: numa
   * máquina mais lenta `attached` chega depois do primeiro clique, o envio
   * saía do daemon e ainda assim `setDraft("")` limpava o texto, porque quem
   * chamava não sabia que o socket tinha recusado. A pessoa perdia a
   * mensagem e a tela não dizia nada. Quem chama só limpa o rascunho quando
   * `send` devolve `true`.
   */
  const send = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed === "" || pending !== null || readOnly || !attached) return false;
      socketRef.current?.send({ type: "prompt", text: trimmed });
      return true;
    },
    [attached, pending, readOnly],
  );

  const cancel = useCallback(() => {
    socketRef.current?.send({ type: "cancel" });
  }, []);

  const answer = useCallback((requestId: string, optionId: string) => {
    socketRef.current?.send({ type: "permission_response", requestId, optionId });
  }, []);

  const setMode = useCallback((mode: LumemMode) => {
    socketRef.current?.send({ type: "set_lumem_mode", mode });
  }, []);

  const setConfig = useCallback((optionId: string, value: string) => {
    socketRef.current?.send({ type: "set_config", optionId, value });
  }, []);

  return { state, attached, readOnly, send, cancel, answer, setMode, setConfig };
}
