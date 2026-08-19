import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  ACP_SESSION_PARAM,
  ACP_WS_PATH,
  acpClientMessageSchema,
  decodeAcpServerMessage,
  encodeAcpClientMessage,
  type AcpClientMessage,
  type AcpServerMessage,
} from "@lumem/shared";

/**
 * Browser end of the conversation protocol.
 *
 * The `pty-socket` mirror, and deliberately as thin: it owns the socket and the
 * encoding, and nothing else. Rendering belongs to the components, folding
 * events belongs to `conversation-model`, and the session's life belongs to the
 * daemon — closing this socket detaches, it does not end the conversation.
 *
 * Two differences from the PTY socket, both of them about what the messages are:
 *
 * - **No pending queue.** The PTY buffers frames written before the handshake
 *   because xterm reports its size before the socket opens, and losing that
 *   leaves the terminal at 80x24. Nothing here is produced by layout: every
 *   message is a person typing. Sending before the socket is open is a bug in
 *   the caller, and queueing it would hide the bug and send a prompt at a moment
 *   nobody chose.
 * - **Outbound validation.** A prompt is user input, and the daemon refuses an
 *   empty one. Catching it here means the caller learns immediately instead of
 *   waiting for a round trip to say what the schema already knew.
 */

export interface AcpSocketHandlers {
  onMessage(message: AcpServerMessage): void;
  /**
   * The socket went away.
   *
   * `refused` separates the two cases the tab has to render differently: the
   * daemon saying "no such session" (4404), and the network dropping. One is a
   * dead end; the other is worth retrying.
   */
  onClose?(event: { code: number; clean: boolean; refused: boolean }): void;
  /** A frame the client could not decode — a protocol mismatch, not a session error. */
  onDecodeError?(error: string): void;
  /** A message this client tried to send and should not have. */
  onSendRejected?(error: string): void;
}

export interface AcpSocket {
  send(message: AcpClientMessage): void;
  close(): void;
}

/** Injectable so tests do not need a live daemon. */
export type AcpConnect = (sessionId: string, handlers: AcpSocketHandlers) => AcpSocket;

/**
 * Minimal shape this module needs from a WebSocket.
 *
 * Typed structurally rather than as the DOM `WebSocket` so a test double is a
 * plain object instead of a subclass of a browser global.
 */
export interface AcpWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface AcpConnectOptions {
  /** Overridden in tests; defaults to the browser's WebSocket. */
  createWebSocket?: (url: string) => AcpWebSocketLike;
  /** Overridden in tests; defaults to `window.location`. */
  origin?: { protocol: string; host: string };
}

const OPEN = 1;

export function acpWebSocketUrl(
  sessionId: string,
  origin: { protocol: string; host: string },
): string {
  // https pages may only open wss, and mixing them fails with a browser error
  // that never reaches this code.
  const scheme = origin.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${origin.host}${ACP_WS_PATH}?${ACP_SESSION_PARAM}=${encodeURIComponent(sessionId)}`;
}

export function connectAcpSocket(
  sessionId: string,
  handlers: AcpSocketHandlers,
  options: AcpConnectOptions = {},
): AcpSocket {
  const {
    createWebSocket = (url: string) => new WebSocket(url) as unknown as AcpWebSocketLike,
    origin = window.location,
  } = options;

  const socket = createWebSocket(acpWebSocketUrl(sessionId, origin));

  socket.onmessage = (event) => {
    const decoded = decodeAcpServerMessage(String(event.data));
    if (decoded.ok) handlers.onMessage(decoded.message);
    else handlers.onDecodeError?.(decoded.error);
  };

  socket.onclose = (event) => {
    handlers.onClose?.({
      code: event.code,
      clean: event.wasClean,
      refused: event.code === ACP_CLOSE_SESSION_NOT_FOUND,
    });
  };

  // Without a handler the browser logs an unhandled error event; the close that
  // always follows carries the information anyway.
  socket.onerror = () => {};

  return {
    send(message) {
      // Checked against the same schema the daemon uses, before the wire. The
      // daemon would refuse it too, one round trip later and with the answer
      // arriving as an error frame the caller has to correlate back.
      const parsed = acpClientMessageSchema.safeParse(message);
      if (!parsed.success) {
        handlers.onSendRejected?.(
          parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
            .join("; "),
        );
        return;
      }

      if (socket.readyState !== OPEN) {
        handlers.onSendRejected?.("o socket não está aberto");
        return;
      }
      socket.send(encodeAcpClientMessage(parsed.data));
    },
    close() {
      // Detach only. The daemon keeps the conversation — that is the point.
      socket.onmessage = null;
      socket.onclose = null;
      socket.onopen = null;
      socket.close();
    },
  };
}
