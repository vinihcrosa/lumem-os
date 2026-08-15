import {
  decodePtyServerMessage,
  encodePtyClientMessage,
  PTY_SESSION_PARAM,
  PTY_WS_PATH,
  type PtyClientMessage,
  type PtyServerMessage,
} from "@lumem/shared";

/**
 * Browser end of the PTY protocol.
 *
 * Deliberately thin: it owns the socket and the encoding, and nothing else.
 * Everything about *rendering* belongs to the terminal component, and
 * everything about the session's life belongs to the daemon — closing this
 * socket detaches, it does not kill.
 */

export interface PtySocketHandlers {
  onMessage(message: PtyServerMessage): void;
  /** The socket went away. `clean` is false when the daemon refused or dropped us. */
  onClose?(event: { code: number; clean: boolean }): void;
  /** A frame the client could not decode — a protocol mismatch, not a session error. */
  onDecodeError?(error: string): void;
}

export interface PtySocket {
  send(message: PtyClientMessage): void;
  close(): void;
}

/** Injectable so tests do not need a live daemon. */
export type PtyConnect = (sessionId: string, handlers: PtySocketHandlers) => PtySocket;

/**
 * Minimal shape this module needs from a WebSocket.
 *
 * Typed structurally rather than as the DOM `WebSocket` so a test double is a
 * plain object instead of a subclass of a browser global.
 */
export interface PtyWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface ConnectOptions {
  /** Overridden in tests; defaults to the browser's WebSocket. */
  createWebSocket?: (url: string) => PtyWebSocketLike;
  /** Overridden in tests; defaults to `window.location`. */
  origin?: { protocol: string; host: string };
}

const OPEN = 1;

export function ptyWebSocketUrl(
  sessionId: string,
  origin: { protocol: string; host: string },
): string {
  // https pages may only open wss, and mixing them fails with a browser error
  // that never reaches this code.
  const scheme = origin.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${origin.host}${PTY_WS_PATH}?${PTY_SESSION_PARAM}=${encodeURIComponent(sessionId)}`;
}

export function connectPtySocket(
  sessionId: string,
  handlers: PtySocketHandlers,
  options: ConnectOptions = {},
): PtySocket {
  const {
    createWebSocket = (url: string) => new WebSocket(url) as unknown as PtyWebSocketLike,
    origin = window.location,
  } = options;

  const socket = createWebSocket(ptyWebSocketUrl(sessionId, origin));

  /**
   * Frames written before the socket opens.
   *
   * xterm reports its size the moment it is laid out, which is reliably before
   * the handshake completes. Dropping those would leave the PTY at 80x24 until
   * the user resized the window by hand.
   */
  let pending: PtyClientMessage[] = [];

  socket.onopen = () => {
    const queued = pending;
    pending = [];
    for (const message of queued) socket.send(encodePtyClientMessage(message));
  };

  socket.onmessage = (event) => {
    const decoded = decodePtyServerMessage(String(event.data));
    if (decoded.ok) handlers.onMessage(decoded.message);
    else handlers.onDecodeError?.(decoded.error);
  };

  socket.onclose = (event) => {
    pending = [];
    handlers.onClose?.({ code: event.code, clean: event.wasClean });
  };

  // Without a handler the browser logs an unhandled error event; the close that
  // always follows carries the information anyway.
  socket.onerror = () => {};

  return {
    send(message) {
      if (socket.readyState === OPEN) socket.send(encodePtyClientMessage(message));
      else pending.push(message);
    },
    close() {
      // Detach only. The daemon keeps the process running — that is the point.
      socket.onmessage = null;
      socket.onclose = null;
      socket.onopen = null;
      pending = [];
      socket.close();
    },
  };
}
