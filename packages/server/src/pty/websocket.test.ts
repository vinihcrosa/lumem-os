import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import {
  decodePtyServerMessage,
  encodePtyClientMessage,
  PTY_CLOSE_SESSION_NOT_FOUND,
  PTY_SESSION_PARAM,
  PTY_WS_PATH,
  type PtyClientMessage,
  type PtyServerMessage,
} from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "./PtyManager.js";

const WAIT = { timeout: 10_000, interval: 20 } as const;

let app: FastifyInstance;
let ptyManager: PtyManager;
let database: TestDb;
let baseUrl: string;
const clients: TestClient[] = [];

/**
 * A browser terminal, minus the terminal.
 *
 * Collects every decoded frame so a test can assert on ordering — which is the
 * one property the endpoint exists to guarantee.
 */
class TestClient {
  readonly messages: PtyServerMessage[] = [];
  readonly decodeErrors: string[] = [];
  closeCode: number | undefined;

  private constructor(private readonly ws: WebSocket) {}

  static async connect(sessionId: string): Promise<TestClient> {
    const ws = new WebSocket(`${baseUrl}${PTY_WS_PATH}?${PTY_SESSION_PARAM}=${sessionId}`);
    const client = new TestClient(ws);
    clients.push(client);

    ws.on("message", (raw) => {
      const decoded = decodePtyServerMessage(raw.toString());
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

  send(message: PtyClientMessage): void {
    this.ws.send(encodePtyClientMessage(message));
  }

  sendRaw(frame: string | Buffer): void {
    this.ws.send(frame);
  }

  /** Everything the session has streamed since this client attached. */
  output(): string {
    return this.messages
      .filter((message) => message.type === "output")
      .map((message) => message.data)
      .join("");
  }

  first(): PtyServerMessage | undefined {
    return this.messages[0];
  }

  async waitForOutput(needle: string): Promise<void> {
    await vi.waitFor(() => expect(this.output()).toContain(needle), WAIT);
  }

  async waitForMessage(type: PtyServerMessage["type"]): Promise<PtyServerMessage> {
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

function spawnSession(command: string, args: readonly string[] = []): string {
  return ptyManager.spawn({ command, args, cwd: tmpdir() }).id;
}

beforeEach(async () => {
  ptyManager = new PtyManager();
  database = openTestDb();
  // Imported lazily so the module graph matches production wiring exactly:
  // whatever createServer mounts is what this test exercises.
  const { createServer } = await import("../server.js");
  app = await createServer({ config: loadConfig(), db: database.db, ptyManager });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
});

describe("attach", () => {
  it("replays the buffer produced before the client connected", async () => {
    const id = spawnSession("sh", ["-c", "echo before-attach; sleep 30"]);
    await vi.waitFor(() => expect(ptyManager.snapshot(id)).toContain("before-attach"), WAIT);

    const client = await TestClient.connect(id);
    const attached = await client.waitForMessage("attached");

    expect(attached).toMatchObject({ type: "attached", sessionId: id, state: "running" });
    expect(attached.type === "attached" && attached.snapshot).toContain("before-attach");
  });

  it("sends the buffer before any new byte", async () => {
    const id = spawnSession("cat");
    ptyManager.write(id, "old-line\n");
    // **Duas** cópias, e não uma: o PTY ecoa a linha digitada, e só depois o
    // `cat` a devolve pelo stdout. Esperar pela primeira ocorrência ancora o
    // teste no eco e deixa a saída do `cat` chegar **depois** do attach — que é
    // exatamente o byte que a asserção lá embaixo proíbe.
    //
    // As duas pilhas acharam esta corrida separadamente e escreveram a mesma
    // asserção de dois jeitos. Ficou o mais direto.
    await vi.waitFor(
      () => expect(ptyManager.snapshot(id).match(/old-line/g)).toHaveLength(2),
      WAIT,
    );

    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");
    ptyManager.write(id, "new-line\n");
    await client.waitForOutput("new-line");

    // Ordering is the whole contract: a client that repaints from the snapshot
    // after applying stream bytes would show the terminal's past over its
    // present.
    expect(client.first()?.type).toBe("attached");
    expect(client.output()).not.toContain("old-line");
  });

  it("loses nothing at the seam between the snapshot and the stream", async () => {
    // The gap this guards is invisible in a quiet session: it only opens while
    // the process is writing *during* the attach. Subscribing and snapshotting
    // in separate turns of the event loop drops whatever lands in between.
    const total = 200;
    const id = spawnSession("sh", [
      "-c",
      `for i in $(seq 1 ${total}); do echo line$i; sleep 0.01; done; sleep 30`,
    ]);
    // A PTY echoes CRLF; the trailing newline is what keeps line1 from matching
    // inside line100.
    const normalize = (text: string): string => text.replace(/\r\n/g, "\n");
    await vi.waitFor(() => expect(normalize(ptyManager.snapshot(id))).toContain("line1\n"), WAIT);

    const client = await TestClient.connect(id);
    const attached = await client.waitForMessage("attached");
    const replayed = attached.type === "attached" ? attached.snapshot : "";
    const seen = (): string => normalize(replayed + client.output());
    await vi.waitFor(() => expect(seen()).toContain(`line${total}\n`), WAIT);

    const missing = Array.from({ length: total }, (_, i) => `line${i + 1}\n`).filter(
      (line) => !seen().includes(line),
    );
    expect(missing).toEqual([]);
  });

  it("refuses an unknown session with a typed error and closes cleanly", async () => {
    const client = await TestClient.connect("no-such-session");

    const error = await client.waitForMessage("error");

    expect(error).toEqual({
      type: "error",
      code: "SESSION_NOT_FOUND",
      message: "no session no-such-session",
    });
    await expect(client.waitForClose()).resolves.toBe(PTY_CLOSE_SESSION_NOT_FOUND);
  });

  it("refuses a connection with no session id at all", async () => {
    const ws = new WebSocket(`${baseUrl}${PTY_WS_PATH}`);
    const codes: number[] = [];
    ws.on("close", (code) => codes.push(code));
    ws.on("error", () => {});

    await vi.waitFor(() => expect(codes).toEqual([PTY_CLOSE_SESSION_NOT_FOUND]), WAIT);
  });

  it("tells a client attaching to an already exited session what happened", async () => {
    const id = spawnSession("sh", ["-c", "echo last-words; exit 5"]);
    await vi.waitFor(() => expect(ptyManager.get(id)?.state).toBe("exited"), WAIT);

    const client = await TestClient.connect(id);
    const exit = await client.waitForMessage("exit");

    const attached = client.messages[0];
    expect(attached?.type).toBe("attached");
    expect(attached?.type === "attached" && attached.state).toBe("exited");
    expect(attached?.type === "attached" && attached.snapshot).toContain("last-words");
    expect(exit).toEqual({ type: "exit", exitCode: 5, signal: null });
  });

  it("404s an upgrade on an unknown path instead of leaving the socket hanging", async () => {
    const ws = new WebSocket(`${baseUrl}/not-the-pty-endpoint`);
    const errors: Error[] = [];
    ws.on("error", (error) => errors.push(error));

    await vi.waitFor(() => expect(errors.length).toBe(1), WAIT);
    expect(errors[0]?.message).toMatch(/404/);
  });
});

describe("input", () => {
  it("delivers keystrokes to the process", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    client.send({ type: "input", data: "typed-by-client\n" });

    await client.waitForOutput("typed-by-client");
  });

  it("propagates a resize to the process", async () => {
    const id = spawnSession("sh");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    client.send({ type: "resize", cols: 123, rows: 45 });
    client.send({ type: "input", data: "tput cols; tput lines\n" });

    await client.waitForOutput("123");
    await client.waitForOutput("45");
    expect(ptyManager.get(id)).toMatchObject({ cols: 123, rows: 45 });
  });

  it("answers a malformed frame without dropping the terminal", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    client.sendRaw("this is not json");
    const error = await client.waitForMessage("error");

    expect(error).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
    // The session is fine and so is the connection: a buggy client must not
    // cost the user their shell.
    client.send({ type: "input", data: "still-alive\n" });
    await client.waitForOutput("still-alive");
    expect(client.closeCode).toBeUndefined();
  });

  it("rejects a message the schema does not know", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    client.sendRaw(JSON.stringify({ type: "spawn", command: "rm", args: ["-rf", "/"] }));

    const error = await client.waitForMessage("error");
    expect(error).toMatchObject({ code: "INVALID_MESSAGE" });
  });

  it("rejects a binary frame", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    client.sendRaw(Buffer.from([0x00, 0x01, 0x02]));

    const error = await client.waitForMessage("error");
    expect(error).toMatchObject({ code: "INVALID_MESSAGE" });
  });

  it("reports writing to a session whose process is gone", async () => {
    const id = spawnSession("sh", ["-c", "sleep 30"]);
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    ptyManager.kill(id);
    await client.waitForMessage("exit");
    client.send({ type: "input", data: "too late\n" });

    await vi.waitFor(
      () =>
        expect(
          client.messages.some(
            (message) => message.type === "error" && message.code === "SESSION_EXITED",
          ),
        ).toBe(true),
      WAIT,
    );
  });
});

describe("output", () => {
  it("streams to every attached client", async () => {
    const id = spawnSession("cat");
    const [a, b] = await Promise.all([TestClient.connect(id), TestClient.connect(id)]);
    await Promise.all([a.waitForMessage("attached"), b.waitForMessage("attached")]);

    ptyManager.write(id, "broadcast\n");

    await a.waitForOutput("broadcast");
    await b.waitForOutput("broadcast");
  });

  it("reports the exit of the process", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    ptyManager.kill(id);

    const exit = await client.waitForMessage("exit");
    expect(exit.type).toBe("exit");
  });
});

describe("detach", () => {
  it("does not kill the session when the client disconnects", async () => {
    const id = spawnSession("cat");
    const client = await TestClient.connect(id);
    await client.waitForMessage("attached");

    await client.close();

    // Closing the browser is the single scenario this whole architecture is
    // built around. The process must not notice.
    expect(ptyManager.get(id)?.state).toBe("running");
    ptyManager.write(id, "still-here\n");
    await vi.waitFor(() => expect(ptyManager.snapshot(id)).toContain("still-here"), WAIT);
  });

  it("delivers what happened while the client was away on reattach", async () => {
    const id = spawnSession("cat");
    const first = await TestClient.connect(id);
    await first.waitForMessage("attached");
    first.send({ type: "input", data: "before-leaving\n" });
    await first.waitForOutput("before-leaving");
    await first.close();

    ptyManager.write(id, "while-you-were-out\n");
    await vi.waitFor(() => expect(ptyManager.snapshot(id)).toContain("while-you-were-out"), WAIT);

    const second = await TestClient.connect(id);
    const attached = await second.waitForMessage("attached");
    const snapshot = attached.type === "attached" ? attached.snapshot : "";

    // Reopening the browser has to show the whole session, not just the part
    // that happened while someone was watching.
    expect(snapshot).toContain("before-leaving");
    expect(snapshot).toContain("while-you-were-out");
  });

  it("stops streaming to a client that left", async () => {
    const id = spawnSession("cat");
    const staying = await TestClient.connect(id);
    const leaving = await TestClient.connect(id);
    await Promise.all([staying.waitForMessage("attached"), leaving.waitForMessage("attached")]);

    await leaving.close();
    ptyManager.write(id, "after-you-left\n");
    await staying.waitForOutput("after-you-left");

    // A leaked listener per closed tab is how a long-lived daemon dies.
    expect(leaving.output()).not.toContain("after-you-left");
  });
});
