import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  ACP_SESSION_PARAM,
  ACP_WS_PATH,
  decodeAcpClientMessage,
  encodeAcpServerMessage,
  type AcpErrorCode,
  type AcpServerMessage,
} from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { isDomainError, type DomainErrorCode } from "../errors.js";
import { onUpgradePath } from "../ws/upgrade.js";
import type { AcpManager } from "./AcpManager.js";

/**
 * Largest frame a client may send.
 *
 * A prompt is text a person typed, and F2 does not carry images yet. Without a
 * cap one client can make the daemon buffer whatever it likes.
 */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

/** Close code for a daemon that is going away, per RFC 6455. */
const CLOSE_GOING_AWAY = 1001;

export interface RegisterAcpWebSocketOptions {
  app: FastifyInstance;
  acpManager: AcpManager;
  /** Overridable so a test can mount a second endpoint on one server. */
  path?: string;
}

const DOMAIN_TO_ACP_ERROR: Record<DomainErrorCode, AcpErrorCode> = {
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXITED: "SESSION_EXITED",
  // An empty prompt, or a permission answer nobody is waiting on: both are the
  // client sending something the session cannot accept.
  INVALID_ARGUMENT: "INVALID_MESSAGE",
  NOT_FOUND: "INVALID_MESSAGE",
  // The adapter could not be launched. Reaching it from *this* socket would be
  // odd — attaching happens after the handshake — but the code exists so a
  // future path has somewhere honest to land.
  SPAWN_FAILED: "ADAPTER_UNAVAILABLE",
  // Nothing below can be caused by a frame on this socket. Reaching one is a
  // defect, and saying INTERNAL is how it stops being silent.
  DUPLICATE: "INTERNAL",
  IN_USE: "INTERNAL",
  BLOCKED: "INTERNAL",
  CONSTRAINT_VIOLATION: "INTERNAL",
  GIT_FAILED: "INTERNAL",
};

/**
 * Mounts the ACP conversation endpoint.
 *
 * The mechanism is the PTY endpoint's, deliberately: same session parameter,
 * same 4404 for an id nobody knows, same promise that detaching is inert. What
 * differs is what travels — typed events instead of bytes — which is why it is
 * a second path rather than a second message kind on the first one. An endpoint
 * serving both unions would force every client to discriminate before it could
 * read anything.
 */
export function registerAcpWebSocket({
  app,
  acpManager,
  path = ACP_WS_PATH,
}: RegisterAcpWebSocketOptions): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  function attach(ws: WebSocket, sessionId: string): void {
    const send = (message: AcpServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeAcpServerMessage(message));
    };

    const info = acpManager.get(sessionId);
    if (!info) {
      send({ type: "error", code: "SESSION_NOT_FOUND", message: `no session ${sessionId}` });
      ws.close(ACP_CLOSE_SESSION_NOT_FOUND, "session not found");
      return;
    }

    // The transcript, the frame carrying it and the subscription all happen in
    // one synchronous run of the event loop. Events arrive from an I/O callback,
    // so nothing can land in between — awaiting anything here would open exactly
    // the gap where an event is in neither the transcript nor the stream, and
    // the client would be missing one message with no way to notice.
    send({
      type: "attached",
      sessionId,
      state: info.state,
      acpSessionId: info.acpSessionId,
      model: info.model,
      mode: info.mode,
      // Filled in on attach, not only when something changes: a tab that opened
      // with empty dropdowns until the agent happened to mention something would
      // look broken for as long as nothing did.
      configOptions: [...info.configOptions],
      transcript: [...acpManager.transcript(sessionId)],
    });

    const offEvent = acpManager.onEvent(sessionId, ({ at, event }) =>
      send({ type: "event", at, event }),
    );

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (isBinary) {
        send({ type: "error", code: "INVALID_MESSAGE", message: "binary frames are not accepted" });
        return;
      }

      const decoded = decodeAcpClientMessage(raw.toString());
      if (!decoded.ok) {
        // One bad frame is not a reason to drop a live conversation.
        send({ type: "error", code: "INVALID_MESSAGE", message: decoded.error });
        return;
      }

      const message = decoded.message;
      try {
        if (message.type === "prompt") {
          // Not awaited: a turn lasts minutes, and the socket has to keep
          // carrying the events it produces while it runs. The rejection is
          // reported, and nothing else waits on it.
          void acpManager.prompt(sessionId, message.text).catch((error: unknown) => {
            reportFailure(error, "prompt");
          });
          return;
        }
        if (message.type === "cancel") {
          acpManager.cancel(sessionId);
          return;
        }
        if (message.type === "set_config") {
          // Not awaited, for the reason a prompt is not: the agent answers with
          // the whole set of options, and the `config` event it produces travels
          // on this socket.
          void acpManager
            .setConfig(sessionId, message.optionId, message.value)
            .catch((error: unknown) => {
              reportFailure(error, "set_config");
            });
          return;
        }
        acpManager.respondToPermission(sessionId, message.requestId, message.optionId);
      } catch (error) {
        reportFailure(error, message.type);
      }
    });

    function reportFailure(error: unknown, what: string): void {
      if (isDomainError(error)) {
        send({ type: "error", code: DOMAIN_TO_ACP_ERROR[error.code], message: error.message });
        return;
      }
      // A defect, not a client mistake. Throwing out of a socket event handler
      // would take the whole daemon — and every other session — down.
      app.log.error({ err: error, sessionId, what }, "acp websocket message failed");
      send({ type: "error", code: "INTERNAL", message: "internal error" });
    }

    ws.on("error", (error) => {
      // An unhandled 'error' on a ws is an uncaught exception. The close handler
      // that follows it does the unsubscribing.
      app.log.warn({ err: error, sessionId }, "acp websocket errored");
    });

    ws.on("close", () => {
      offEvent();
    });
  }

  onUpgradePath(app, path, (request, socket, head, url) => {
    // An unknown id is answered after the upgrade, as a protocol error, for the
    // reason the PTY endpoint gives: a browser exposes almost nothing about a
    // rejected handshake, so the user would get an empty conversation and no
    // explanation.
    const sessionId = url.searchParams.get(ACP_SESSION_PARAM) ?? "";

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
