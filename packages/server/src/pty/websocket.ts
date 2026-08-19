import {
  encodePtyServerMessage,
  decodePtyClientMessage,
  PTY_CLOSE_SESSION_NOT_FOUND,
  PTY_SESSION_PARAM,
  PTY_WS_PATH,
  type PtyErrorCode,
  type PtyServerMessage,
} from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { isDomainError, type DomainErrorCode } from "../errors.js";
import { onUpgradePath } from "../ws/upgrade.js";
import type { PtyManager } from "./PtyManager.js";

/**
 * Largest frame a client may send.
 *
 * Input is keystrokes and paste; a megabyte is already generous. Without a cap
 * a single client can make the daemon buffer whatever it likes.
 */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

/** Close code for a daemon that is going away, per RFC 6455. */
const CLOSE_GOING_AWAY = 1001;

export interface RegisterPtyWebSocketOptions {
  app: FastifyInstance;
  ptyManager: PtyManager;
  /** Overridable so a test can mount a second endpoint on one server. */
  path?: string;
}

const DOMAIN_TO_PTY_ERROR: Record<DomainErrorCode, PtyErrorCode> = {
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXITED: "SESSION_EXITED",
  // Reachable only if the schema and PtyManager ever disagree about what a
  // valid size is; either way it is the client's frame that was wrong.
  INVALID_ARGUMENT: "INVALID_MESSAGE",
  // Nothing below can be caused by a frame on this socket: the endpoint only
  // writes to and resizes an existing PTY. Reaching one of them is a defect.
  SPAWN_FAILED: "INTERNAL",
  NOT_FOUND: "INTERNAL",
  DUPLICATE: "INTERNAL",
  IN_USE: "INTERNAL",
  BLOCKED: "INTERNAL",
  CONSTRAINT_VIOLATION: "INTERNAL",
  GIT_FAILED: "INTERNAL",
};

/**
 * Mounts the PTY websocket endpoint on the daemon's HTTP server.
 *
 * Attaching is deliberately cheap and detaching is deliberately inert: the
 * session lives in `PtyManager`, not on the connection, so closing the browser
 * unsubscribes a listener and nothing more.
 */
export function registerPtyWebSocket({
  app,
  ptyManager,
  path = PTY_WS_PATH,
}: RegisterPtyWebSocketOptions): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  function attach(ws: WebSocket, sessionId: string): void {
    const send = (message: PtyServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodePtyServerMessage(message));
    };

    const info = ptyManager.get(sessionId);
    if (!info) {
      send({
        type: "error",
        code: "SESSION_NOT_FOUND",
        message: `no session ${sessionId}`,
      });
      ws.close(PTY_CLOSE_SESSION_NOT_FOUND, "session not found");
      return;
    }

    // The snapshot, the frame carrying it and the subscription all happen in
    // one synchronous run of the event loop. `onData` fires from an I/O
    // callback, so nothing can land in between — awaiting anything here would
    // open exactly the gap where a chunk is in neither the snapshot nor the
    // stream.
    send({
      type: "attached",
      sessionId,
      state: info.state,
      cols: info.cols,
      rows: info.rows,
      snapshot: ptyManager.snapshot(sessionId),
    });

    const offData = ptyManager.onData(sessionId, (data) => send({ type: "output", data }));
    // Fires synchronously when the session is already gone, which is how a
    // client attaching to a corpse learns the outcome instead of waiting.
    const offExit = ptyManager.onExit(sessionId, ({ exitCode, signal }) =>
      send({ type: "exit", exitCode, signal }),
    );

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (isBinary) {
        send({ type: "error", code: "INVALID_MESSAGE", message: "binary frames are not accepted" });
        return;
      }

      const decoded = decodePtyClientMessage(raw.toString());
      if (!decoded.ok) {
        // One bad frame is not a reason to drop a live terminal.
        send({ type: "error", code: "INVALID_MESSAGE", message: decoded.error });
        return;
      }

      try {
        const message = decoded.message;
        if (message.type === "input") {
          ptyManager.write(sessionId, message.data);
        } else {
          ptyManager.resize(sessionId, message.cols, message.rows);
        }
      } catch (error) {
        if (isDomainError(error)) {
          send({ type: "error", code: DOMAIN_TO_PTY_ERROR[error.code], message: error.message });
          return;
        }
        // A defect, not a client mistake. Throwing out of a socket event
        // handler would take the whole daemon — and every other session — down.
        app.log.error({ err: error, sessionId }, "pty websocket message failed");
        send({ type: "error", code: "INTERNAL", message: "internal error" });
      }
    });

    ws.on("error", (error) => {
      // Unhandled 'error' on a ws is an uncaught exception. The close handler
      // that follows it does the unsubscribing.
      app.log.warn({ err: error, sessionId }, "pty websocket errored");
    });

    ws.on("close", () => {
      offData();
      offExit();
    });
  }

  // The 404 for an unknown path now lives in the router, which is the only
  // place that can know no sibling endpoint wanted the socket.
  onUpgradePath(app, path, (request, socket, head, url) => {
    // An id that is missing or unknown is answered *after* the upgrade, as a
    // protocol error, rather than by failing the handshake: a browser exposes
    // almost nothing about a rejected handshake, so the user would get a blank
    // terminal and no reason.
    const sessionId = url.searchParams.get(PTY_SESSION_PARAM) ?? "";

    wss.handleUpgrade(request, socket, head, (ws) => {
      attach(ws, sessionId);
    });
  });

  app.addHook("onClose", async () => {
    for (const client of wss.clients) client.close(CLOSE_GOING_AWAY, "daemon shutting down");
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });
}
