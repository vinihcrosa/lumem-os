import type { AddressInfo } from "node:net";

import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  ACP_SESSION_PARAM,
  ACP_WS_PATH,
  decodeAcpServerMessage,
  encodeAcpClientMessage,
  type AcpClientMessage,
  type AcpEvent,
  type AcpServerMessage,
} from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { fakeAgentProcess, type FakeAgentScript } from "../testing/acp-fake-agent.js";
import { AcpManager } from "./AcpManager.js";

/**
 * The conversation over a real websocket, against a real HTTP server.
 *
 * What this file is for, beyond "it works": the endpoint makes two promises the
 * manager cannot make on its own — that an attaching client is brought fully up
 * to date in one frame, and that detaching does nothing to the agent. Both are
 * about the seam, so both need a socket to be tested at all.
 */

const WAIT = { timeout: 10_000, interval: 20 } as const;

let app: FastifyInstance;
let acpManager: AcpManager;
let ptyManager: PtyManager;
let database: TestDb;
let baseUrl: string;
const clients: TestClient[] = [];

/** A conversation tab, minus the conversation. */
class TestClient {
  readonly messages: AcpServerMessage[] = [];
  readonly decodeErrors: string[] = [];
  closeCode: number | undefined;

  private constructor(private readonly ws: WebSocket) {}

  static async connect(sessionId: string): Promise<TestClient> {
    const ws = new WebSocket(`${baseUrl}${ACP_WS_PATH}?${ACP_SESSION_PARAM}=${sessionId}`);
    const client = new TestClient(ws);
    clients.push(client);

    ws.on("message", (raw) => {
      const decoded = decodeAcpServerMessage(raw.toString());
      if (decoded.ok) client.messages.push(decoded.message);
      else client.decodeErrors.push(decoded.error);
    });
    ws.on("close", (code) => {
      client.closeCode = code;
    });
    // Errors are expected in the refusal tests; failing here would race the
    // assertion on the close code.
    ws.on("error", () => {});

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    return client;
  }

  send(message: AcpClientMessage): void {
    this.ws.send(encodeAcpClientMessage(message));
  }

  sendRaw(frame: string | Buffer): void {
    this.ws.send(frame);
  }

  /** Every conversation event this client has been told about. */
  events(): AcpEvent[] {
    return this.messages.flatMap((message) => (message.type === "event" ? [message.event] : []));
  }

  first(): AcpServerMessage | undefined {
    return this.messages[0];
  }

  async waitForEvent(type: AcpEvent["type"]): Promise<AcpEvent> {
    await vi.waitFor(
      () => expect(this.events().some((event) => event.type === type)).toBe(true),
      WAIT,
    );
    return this.events().find((event) => event.type === type)!;
  }

  async waitForMessage(type: AcpServerMessage["type"]): Promise<AcpServerMessage> {
    await vi.waitFor(
      () => expect(this.messages.some((message) => message.type === type)).toBe(true),
      WAIT,
    );
    return this.messages.find((message) => message.type === type)!;
  }

  async waitForClose(): Promise<number | undefined> {
    await vi.waitFor(() => expect(this.closeCode).toBeDefined(), WAIT);
    return this.closeCode;
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => this.ws.once("close", () => resolve()));
    this.ws.close();
    await closed;
  }
}

/**
 * Queue of processes the shared manager will hand out, one per `spawn`.
 *
 * One manager and one server for the whole file — that is what `beforeEach`
 * already pays for — while each test still scripts its own agent.
 */
const queued: ReturnType<typeof fakeAgentProcess>["process"][] = [];

/** Starts a session on the manager the server was built with. */
async function startSession(script: FakeAgentScript = {}): Promise<string> {
  queued.push(fakeAgentProcess(script).process);
  const info = await acpManager.spawn({
    command: "claude-agent-acp",
    cwd: "/repos/lorebase",
    adapterVersion: "0.69.0",
  });
  return info.id;
}

beforeEach(async () => {
  queued.length = 0;
  ptyManager = new PtyManager();
  acpManager = new AcpManager({
    // Hands out whichever process the current test queued.
    spawner: () => queued.shift()!,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  database = openTestDb();
  // Imported lazily so the module graph matches production wiring exactly:
  // whatever createServer mounts is what this test exercises.
  const { createServer } = await import("../server.js");
  app = await createServer({ config: loadConfig(), db: database.db, ptyManager, acpManager });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await app.close();
  await acpManager.killAll();
  await ptyManager.killAll();
  database.cleanup();
});

describe("attaching", () => {
  it("answers with the session's state before anything else", async () => {
    const sessionId = await startSession();

    const client = await TestClient.connect(sessionId);
    const attached = await client.waitForMessage("attached");

    expect(client.first()).toBe(attached);
    expect(attached).toMatchObject({
      type: "attached",
      sessionId,
      state: "running",
      acpSessionId: "fake-acp-session",
      model: "opus[1m]",
      mode: "default",
    });
  });

  it("replays the whole conversation to a client that arrives late", async () => {
    // The promise the endpoint exists to make: reopening a tab shows what the
    // tab that was open would have shown.
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "antes de você chegar" },
        });
        return "end_turn";
      },
    });
    await acpManager.prompt(sessionId, "primeiro");

    const client = await TestClient.connect(sessionId);
    const attached = await client.waitForMessage("attached");

    expect(attached.type === "attached" && attached.transcript).toEqual([
      { type: "message", messageId: "m-1", role: "agent", text: "antes de você chegar" },
      { type: "turn_end", stopReason: "end_turn" },
    ]);
  });

  it("hands back an empty transcript for a session that has said nothing", async () => {
    const sessionId = await startSession();

    const client = await TestClient.connect(sessionId);
    const attached = await client.waitForMessage("attached");

    expect(attached.type === "attached" && attached.transcript).toEqual([]);
  });

  it("refuses an unknown session with the same code the PTY endpoint uses", async () => {
    const client = await TestClient.connect("nao-existe");

    const error = await client.waitForMessage("error");
    expect(error).toMatchObject({ type: "error", code: "SESSION_NOT_FOUND" });
    await expect(client.waitForClose()).resolves.toBe(ACP_CLOSE_SESSION_NOT_FOUND);
  });

  it("refuses an attach with no session id at all", async () => {
    const ws = new WebSocket(`${baseUrl}${ACP_WS_PATH}`);
    const codes: number[] = [];
    ws.on("error", () => {});
    ws.on("close", (code) => codes.push(code));

    await vi.waitFor(() => expect(codes).toHaveLength(1), WAIT);
    expect(codes[0]).toBe(ACP_CLOSE_SESSION_NOT_FOUND);
  });

  it("404s an upgrade on a path nothing serves", async () => {
    // The 404 moved to the shared router when a second endpoint appeared. This
    // is the test that it did not get lost on the way.
    const ws = new WebSocket(`${baseUrl}/nada`);
    const errors: Error[] = [];
    ws.on("error", (error) => errors.push(error));

    await vi.waitFor(() => expect(errors).toHaveLength(1), WAIT);
    expect(errors[0]?.message).toMatch(/404/);
  });

  it("still serves the PTY endpoint beside it", async () => {
    // Both endpoints hang off one upgrade listener now. Whichever ran first used
    // to destroy the other's sockets.
    const ptySessionId = ptyManager.spawn({ command: "sh", args: ["-c", "sleep 5"], cwd: "/tmp" }).id;
    const ws = new WebSocket(`${baseUrl}/pty?session=${ptySessionId}`);

    await expect(
      new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      }),
    ).resolves.toBeUndefined();
    ws.close();
  });
});

describe("a turn over the wire", () => {
  it("carries a prompt to the agent and its events back", async () => {
    const sessionId = await startSession({
      async prompt(text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: `recebi: ${text}` },
        });
        return "end_turn";
      },
    });
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.send({ type: "prompt", text: "arruma o frontmatter" });

    const message = await client.waitForEvent("message");
    expect(message).toMatchObject({ text: "recebi: arruma o frontmatter" });
    await client.waitForEvent("turn_end");
  });

  it("gives both attached clients the same events", async () => {
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "para os dois" },
        });
        return "end_turn";
      },
    });
    const first = await TestClient.connect(sessionId);
    const second = await TestClient.connect(sessionId);
    await first.waitForMessage("attached");
    await second.waitForMessage("attached");

    first.send({ type: "prompt", text: "vai" });

    await first.waitForEvent("turn_end");
    await second.waitForEvent("turn_end");
    expect(first.events()).toEqual(second.events());
  });

  it("answers a permission request and lets the turn finish", async () => {
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.requestPermission({
          toolCall: { toolCallId: "tc-1", title: "Bash rm -rf .vite" },
          options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
        });
        return "end_turn";
      },
    });
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.send({ type: "prompt", text: "limpa" });
    const request = await client.waitForEvent("permission_request");

    client.send({
      type: "permission_response",
      requestId: (request as Extract<AcpEvent, { type: "permission_request" }>).requestId,
      optionId: "allow",
    });

    await client.waitForEvent("permission_resolved");
    await client.waitForEvent("turn_end");
  });

  it("cancels a turn that is in flight", async () => {
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Bash pnpm gate:full",
          kind: "execute",
          status: "in_progress",
        });
        await turn.cancelled;
        return "cancelled";
      },
    });
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.send({ type: "prompt", text: "roda o gate" });
    await client.waitForEvent("tool_call");
    client.send({ type: "cancel" });

    const end = await client.waitForEvent("turn_end");
    expect(end).toEqual({ type: "turn_end", stopReason: "cancelled" });
    expect(client.events()).toContainEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      status: "cancelled",
    });
  });

  it("does not block the socket while a turn runs", async () => {
    // A turn lasts minutes. If the endpoint awaited it, the events it produces
    // would have nothing to travel on — the socket would be busy delivering the
    // prompt that is producing them.
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "primeiro sinal" },
        });
        await turn.cancelled;
        return "cancelled";
      },
    });
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.send({ type: "prompt", text: "demora" });

    // Arrives while the turn is still open, which is the whole point.
    await client.waitForEvent("message");
    client.send({ type: "cancel" });
    await client.waitForEvent("turn_end");
  });
});

describe("bad frames", () => {
  it("reports a frame that is not a message and keeps the socket open", async () => {
    const sessionId = await startSession();
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.sendRaw("{nonsense");
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ code: "INVALID_MESSAGE" });
    expect(client.closeCode).toBeUndefined();
  });

  it("refuses a binary frame", async () => {
    const sessionId = await startSession();
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.sendRaw(Buffer.from([0x00, 0x01]));
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ code: "INVALID_MESSAGE", message: /binary/ });
  });

  it("reports an empty prompt as the client's mistake, not the daemon's", async () => {
    const sessionId = await startSession();
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    // Refused by the schema before it reaches the manager, which is why the code
    // is INVALID_MESSAGE rather than anything about a session.
    client.sendRaw(JSON.stringify({ type: "prompt", text: "" }));
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ code: "INVALID_MESSAGE" });
  });

  it("reports an answer to a permission nobody is waiting on", async () => {
    const sessionId = await startSession();
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");

    client.send({ type: "permission_response", requestId: "rq-nada", optionId: "allow" });
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ code: "INVALID_MESSAGE", message: /permission request/ });
  });

  it("reports a prompt to a session whose agent has gone", async () => {
    const fake = fakeAgentProcess();
    queued.push(fake.process);
    const info = await acpManager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const client = await TestClient.connect(info.id);
    await client.waitForMessage("attached");

    fake.process.kill();
    await vi.waitFor(() => expect(acpManager.get(info.id)?.state).toBe("exited"), WAIT);

    client.send({ type: "prompt", text: "tem alguém aí?" });
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ code: "SESSION_EXITED" });
  });
});

describe("detaching", () => {
  it("leaves the agent alone when the client goes away", async () => {
    // F1.4 through the socket: closing the browser unsubscribes a listener and
    // nothing more.
    const sessionId = await startSession({
      async prompt(_text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: "m-1",
          content: { type: "text", text: "ninguém estava olhando" },
        });
        return "end_turn";
      },
    });
    const client = await TestClient.connect(sessionId);
    await client.waitForMessage("attached");
    await client.close();

    await acpManager.prompt(sessionId, "vai sem mim");

    expect(acpManager.get(sessionId)?.state).toBe("running");
    expect(acpManager.transcript(sessionId).some((event) => event.type === "message")).toBe(true);
  });

  it("shows a reattached client everything it missed", async () => {
    const sessionId = await startSession({
      async prompt(text, turn) {
        await turn.update({
          sessionUpdate: "agent_message_chunk",
          messageId: text,
          content: { type: "text", text },
        });
        return "end_turn";
      },
    });
    const first = await TestClient.connect(sessionId);
    await first.waitForMessage("attached");
    await first.close();

    await acpManager.prompt(sessionId, "enquanto-fora");

    const second = await TestClient.connect(sessionId);
    const attached = await second.waitForMessage("attached");

    expect(
      attached.type === "attached" &&
        attached.transcript.some(
          (event) => event.type === "message" && event.text === "enquanto-fora",
        ),
    ).toBe(true);
  });
});
