import { encodePtyServerMessage, type PtyServerMessage } from "@lumem/shared";
import { describe, expect, it, vi } from "vitest";

import { connectPtySocket, ptyWebSocketUrl, type PtyWebSocketLike } from "./pty-socket.js";

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class FakeWebSocket implements PtyWebSocketLike {
  readonly sent: string[] = [];
  readyState = CONNECTING;
  closeCalls = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = CLOSED;
    this.onclose?.({ code: 1000, wasClean: true });
  }

  /** The handshake finishing. */
  open(): void {
    this.readyState = OPEN;
    this.onopen?.({});
  }

  deliver(message: PtyServerMessage): void {
    this.onmessage?.({ data: encodePtyServerMessage(message) });
  }

  deliverRaw(data: string): void {
    this.onmessage?.({ data });
  }
}

function connect(sessionId = "s1", origin = { protocol: "http:", host: "localhost:4318" }) {
  const ws = new FakeWebSocket();
  const messages: PtyServerMessage[] = [];
  const decodeErrors: string[] = [];
  const closes: { code: number; clean: boolean }[] = [];

  const socket = connectPtySocket(
    sessionId,
    {
      onMessage: (message) => messages.push(message),
      onDecodeError: (error) => decodeErrors.push(error),
      onClose: (event) => closes.push(event),
    },
    { createWebSocket: () => ws, origin },
  );

  return { ws, socket, messages, decodeErrors, closes };
}

describe("ptyWebSocketUrl", () => {
  it("uses ws on an insecure page", () => {
    expect(ptyWebSocketUrl("abc", { protocol: "http:", host: "localhost:4318" })).toBe(
      "ws://localhost:4318/pty?session=abc",
    );
  });

  it("uses wss on a secure page", () => {
    // A https page may not open a ws:// socket, and the browser refuses it with
    // an error this code never sees.
    expect(ptyWebSocketUrl("abc", { protocol: "https:", host: "lumem.local" })).toBe(
      "wss://lumem.local/pty?session=abc",
    );
  });

  it("escapes the session id", () => {
    expect(ptyWebSocketUrl("a b&c", { protocol: "http:", host: "h" })).toBe(
      "ws://h/pty?session=a%20b%26c",
    );
  });
});

describe("connectPtySocket", () => {
  it("sends a message once the socket is open", () => {
    const { ws, socket } = connect();
    ws.open();

    socket.send({ type: "input", data: "ls\r" });

    expect(ws.sent).toEqual([JSON.stringify({ type: "input", data: "ls\r" })]);
  });

  it("queues what is written before the handshake finishes", () => {
    // xterm reports its size as soon as it is laid out, which is reliably
    // before the socket opens. Dropping that leaves the PTY at 80x24.
    const { ws, socket } = connect();

    socket.send({ type: "resize", cols: 120, rows: 40 });
    expect(ws.sent).toEqual([]);

    ws.open();

    expect(ws.sent).toEqual([JSON.stringify({ type: "resize", cols: 120, rows: 40 })]);
  });

  it("flushes queued messages in order", () => {
    const { ws, socket } = connect();

    socket.send({ type: "resize", cols: 100, rows: 30 });
    socket.send({ type: "input", data: "a" });
    ws.open();

    expect(ws.sent.map((raw) => JSON.parse(raw).type)).toEqual(["resize", "input"]);
  });

  it("hands decoded server messages to the caller", () => {
    const { ws, messages } = connect();

    ws.deliver({ type: "output", data: "hello" });

    expect(messages).toEqual([{ type: "output", data: "hello" }]);
  });

  it("reports a frame it cannot decode instead of throwing", () => {
    const { ws, messages, decodeErrors } = connect();

    ws.deliverRaw("{not json");

    expect(messages).toEqual([]);
    expect(decodeErrors).toHaveLength(1);
  });

  it("reports the close to the caller", () => {
    const { ws, closes } = connect();

    ws.onclose?.({ code: 4404, wasClean: false });

    expect(closes).toEqual([{ code: 4404, clean: false }]);
  });

  it("stops delivering after close, and closes the socket", () => {
    const { ws, socket, messages, closes } = connect();
    ws.open();

    socket.close();
    ws.deliver({ type: "output", data: "too late" });

    expect(ws.closeCalls).toBe(1);
    // Detaching is a local act: no message asks the daemon to end anything.
    expect(ws.sent).toEqual([]);
    expect(messages).toEqual([]);
    expect(closes).toEqual([]);
  });

  it("drops queued messages when the socket closes before opening", () => {
    const { ws, socket } = connect();

    socket.send({ type: "input", data: "never sent" });
    ws.onclose?.({ code: 1006, wasClean: false });
    ws.open();

    expect(ws.sent).toEqual([]);
  });

  it("swallows the error event so the browser does not log it unhandled", () => {
    const { ws } = connect();

    expect(() => ws.onerror?.(new Error("boom"))).not.toThrow();
  });

  it("uses the page origin by default", () => {
    const createWebSocket = vi.fn(() => new FakeWebSocket());

    connectPtySocket("s9", { onMessage: () => {} }, { createWebSocket });

    expect(createWebSocket).toHaveBeenCalledWith(
      expect.stringContaining(`//${window.location.host}/pty?session=s9`),
    );
  });
});
