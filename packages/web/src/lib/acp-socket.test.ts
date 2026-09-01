import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  encodeAcpServerMessage,
  type AcpServerMessage,
} from "@lumem/shared";
import { describe, expect, it } from "vitest";

import {
  acpWebSocketUrl,
  connectAcpSocket,
  type AcpSocketHandlers,
  type AcpWebSocketLike,
} from "./acp-socket.js";

/**
 * The socket, without a daemon.
 *
 * What is worth testing here is not "it sends bytes" — it is the two judgements
 * this module makes on the caller's behalf: which closes mean "give up" and which
 * mean "the network blinked", and refusing to put a message on the wire that the
 * daemon would only refuse later.
 */

const CONNECTING = 0;
const OPEN = 1;

class FakeSocket implements AcpWebSocketLike {
  readonly sent: string[] = [];
  readyState = CONNECTING;
  closed: { code?: number } | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closed = { code };
  }

  /** Completes the handshake, as the browser would. */
  open(): void {
    this.readyState = OPEN;
    this.onopen?.({});
  }

  deliver(message: AcpServerMessage): void {
    this.onmessage?.({ data: encodeAcpServerMessage(message) });
  }

  deliverRaw(data: string): void {
    this.onmessage?.({ data });
  }

  hangUp(code: number, wasClean = false): void {
    this.onclose?.({ code, wasClean });
  }
}

interface Harness {
  socket: ReturnType<typeof connectAcpSocket>;
  fake: FakeSocket;
  messages: AcpServerMessage[];
  closes: { code: number; clean: boolean; refused: boolean }[];
  decodeErrors: string[];
  rejected: string[];
}

function connect(overrides: Partial<AcpSocketHandlers> = {}): Harness {
  let fake!: FakeSocket;
  const messages: AcpServerMessage[] = [];
  const closes: Harness["closes"] = [];
  const decodeErrors: string[] = [];
  const rejected: string[] = [];

  const socket = connectAcpSocket(
    "s-1",
    {
      onMessage: (message) => messages.push(message),
      onClose: (event) => closes.push(event),
      onDecodeError: (error) => decodeErrors.push(error),
      onSendRejected: (error) => rejected.push(error),
      ...overrides,
    },
    {
      createWebSocket: (url) => {
        fake = new FakeSocket(url);
        return fake;
      },
      origin: { protocol: "http:", host: "127.0.0.1:4317" },
    },
  );

  return { socket, fake, messages, closes, decodeErrors, rejected };
}

describe("acpWebSocketUrl", () => {
  it("carries the session as a query parameter", () => {
    expect(acpWebSocketUrl("s-1", { protocol: "http:", host: "127.0.0.1:4317" })).toBe(
      "ws://127.0.0.1:4317/acp?session=s-1",
    );
  });

  it("uses wss on an https page", () => {
    // Mixing schemes fails with a browser error that never reaches this code.
    expect(acpWebSocketUrl("s-1", { protocol: "https:", host: "lumem.dev" })).toBe(
      "wss://lumem.dev/acp?session=s-1",
    );
  });

  it("escapes an id that would otherwise break the query", () => {
    expect(acpWebSocketUrl("a b&c", { protocol: "http:", host: "h" })).toContain("a%20b%26c");
  });
});

describe("receiving", () => {
  it("hands decoded messages to the caller", () => {
    const { fake, messages } = connect();
    fake.open();

    fake.deliver({
      type: "attached",
      modeOwner: "agent",
      lumemMode: "ask",
      lumemModeDefault: "ask",
      sessionId: "s-1",
      state: "running",
      acpSessionId: "d81b05ee",
      model: "opus[1m]",
      mode: "auto",
      configOptions: [],
      transcript: [],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: "attached", acpSessionId: "d81b05ee" });
  });

  it("reports a frame it cannot decode without dropping the socket", () => {
    // A protocol mismatch is not a session error: one bad frame from a daemon of
    // a different version must not end a conversation that is otherwise fine.
    const { fake, decodeErrors, messages } = connect();
    fake.open();

    fake.deliverRaw("{not a message");
    fake.deliver({ type: "error", code: "INTERNAL", message: "depois disso ainda funciona" });

    expect(decodeErrors).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(fake.closed).toBeNull();
  });

  it("carries the transcript through, entries and stamps intact", () => {
    const { fake, messages } = connect();
    fake.open();

    fake.deliver({
      type: "attached",
      modeOwner: "agent",
      lumemMode: "ask",
      lumemModeDefault: "ask",
      sessionId: "s-1",
      state: "running",
      acpSessionId: "d81b05ee",
      model: "opus[1m]",
      mode: "auto",
      configOptions: [],
      transcript: [
        { at: 1_700_000_000_000, event: { type: "turn_end", stopReason: "end_turn" } },
      ],
    });

    const attached = messages[0];
    expect(attached?.type === "attached" && attached.transcript[0]?.at).toBe(1_700_000_000_000);
  });
});

describe("closing", () => {
  it("separates a refusal from a network drop", () => {
    // The tab renders these differently: 4404 is a dead end, and anything else is
    // worth retrying. Collapsing them would either hide a broken link or offer to
    // retry a session that does not exist.
    const refused = connect();
    refused.fake.hangUp(ACP_CLOSE_SESSION_NOT_FOUND);
    expect(refused.closes[0]).toMatchObject({ refused: true });

    const dropped = connect();
    dropped.fake.hangUp(1006);
    expect(dropped.closes[0]).toMatchObject({ refused: false });
  });

  it("passes on whether the close was clean", () => {
    const { fake, closes } = connect();
    fake.hangUp(1000, true);

    expect(closes[0]).toMatchObject({ code: 1000, clean: true });
  });

  it("detaches without telling the caller it closed", () => {
    // `close()` is the client leaving on purpose. Firing `onClose` would make a
    // deliberate detach indistinguishable from the daemon hanging up.
    const { socket, fake, closes } = connect();
    fake.open();

    socket.close();
    fake.hangUp(1000, true);

    expect(fake.closed).not.toBeNull();
    expect(closes).toEqual([]);
  });

  it("stops delivering messages after detaching", () => {
    const { socket, fake, messages } = connect();
    fake.open();
    socket.close();

    fake.deliverRaw(
      encodeAcpServerMessage({ type: "error", code: "INTERNAL", message: "tarde demais" }),
    );

    expect(messages).toEqual([]);
  });
});

describe("sending", () => {
  it("encodes a prompt onto the wire", () => {
    const { socket, fake } = connect();
    fake.open();

    socket.send({ type: "prompt", text: "arruma o frontmatter" });

    expect(fake.sent).toEqual([JSON.stringify({ type: "prompt", text: "arruma o frontmatter" })]);
  });

  it("refuses an empty prompt before the wire, not after a round trip", () => {
    // The daemon refuses it too — one round trip later, as an error frame the
    // caller then has to correlate back to what it sent.
    const { socket, fake, rejected } = connect();
    fake.open();

    socket.send({ type: "prompt", text: "" });

    expect(fake.sent).toEqual([]);
    expect(rejected[0]).toContain("text");
  });

  it("refuses a message shape nobody defined", () => {
    const { socket, fake, rejected } = connect();
    fake.open();

    socket.send({ type: "set_mode", mode: "plan" } as never);

    expect(fake.sent).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("refuses to send before the socket is open, rather than queueing", () => {
    // The PTY socket queues, because xterm reports its size before the handshake
    // and losing that leaves the terminal at 80x24. Nothing here comes from
    // layout: every message is a person typing, so a queue would fire a prompt at
    // a moment nobody chose and hide the caller's bug.
    const { socket, fake, rejected } = connect();

    socket.send({ type: "prompt", text: "cedo demais" });

    expect(fake.sent).toEqual([]);
    expect(rejected[0]).toMatch(/não está aberto/);
  });

  it("sends a cancel and a permission answer", () => {
    const { socket, fake } = connect();
    fake.open();

    socket.send({ type: "cancel" });
    socket.send({ type: "permission_response", requestId: "rq-1", optionId: "allow" });

    expect(fake.sent).toHaveLength(2);
  });

  it("says nothing when the caller passed no rejection handler", () => {
    // Optional handlers must stay optional: a caller that does not care must not
    // crash on a message it should not have sent.
    const socket = connectAcpSocket(
      "s-1",
      { onMessage: () => {} },
      {
        createWebSocket: (url) => new FakeSocket(url),
        origin: { protocol: "http:", host: "h" },
      },
    );

    expect(() => socket.send({ type: "prompt", text: "" })).not.toThrow();
  });
});
