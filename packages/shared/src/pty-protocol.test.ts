import { describe, expect, it } from "vitest";

import {
  decodePtyClientMessage,
  decodePtyServerMessage,
  encodePtyClientMessage,
  encodePtyServerMessage,
  type PtyServerMessage,
} from "./pty-protocol.js";

describe("decodePtyClientMessage", () => {
  it("accepts input", () => {
    const result = decodePtyClientMessage(JSON.stringify({ type: "input", data: "ls\r" }));

    expect(result).toEqual({ ok: true, message: { type: "input", data: "ls\r" } });
  });

  it("accepts resize", () => {
    const result = decodePtyClientMessage(
      JSON.stringify({ type: "resize", cols: 120, rows: 40 }),
    );

    expect(result).toEqual({ ok: true, message: { type: "resize", cols: 120, rows: 40 } });
  });

  it("keeps whitespace-only input intact", () => {
    // A lone \r is a keystroke, not noise. Trimming it would swallow Enter.
    const result = decodePtyClientMessage(JSON.stringify({ type: "input", data: "\r" }));

    expect(result).toEqual({ ok: true, message: { type: "input", data: "\r" } });
  });

  it("rejects a frame that is not JSON", () => {
    const result = decodePtyClientMessage("<html>nope</html>");

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/not valid JSON/);
  });

  it("rejects an unknown message type", () => {
    const result = decodePtyClientMessage(JSON.stringify({ type: "spawn", command: "rm" }));

    expect(result.ok).toBe(false);
  });

  it("rejects input without data", () => {
    const result = decodePtyClientMessage(JSON.stringify({ type: "input" }));

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("data");
  });

  it.each([
    ["zero columns", { type: "resize", cols: 0, rows: 24 }],
    ["fractional rows", { type: "resize", cols: 80, rows: 24.5 }],
    ["negative rows", { type: "resize", cols: 80, rows: -1 }],
    ["absurd columns", { type: "resize", cols: 10_000_000, rows: 24 }],
    ["stringly typed size", { type: "resize", cols: "80", rows: "24" }],
  ])("rejects resize with %s", (_label, payload) => {
    expect(decodePtyClientMessage(JSON.stringify(payload)).ok).toBe(false);
  });

  it("round-trips through the encoder", () => {
    const message = { type: "input", data: "echo hi\n" } as const;

    expect(decodePtyClientMessage(encodePtyClientMessage(message))).toEqual({
      ok: true,
      message,
    });
  });
});

describe("decodePtyServerMessage", () => {
  const messages: PtyServerMessage[] = [
    {
      type: "attached",
      sessionId: "s1",
      state: "running",
      cols: 80,
      rows: 24,
      snapshot: "$ ls\nfile\n",
    },
    { type: "output", data: "[32mgreen[0m" },
    { type: "exit", exitCode: 3, signal: null },
    { type: "exit", exitCode: 0, signal: 15 },
    { type: "error", code: "SESSION_NOT_FOUND", message: "no session s9" },
  ];

  it.each(messages.map((message) => [message.type, message] as const))(
    "round-trips %s",
    (_type, message) => {
      expect(decodePtyServerMessage(encodePtyServerMessage(message))).toEqual({
        ok: true,
        message,
      });
    },
  );

  it("rejects an unknown error code", () => {
    const result = decodePtyServerMessage(
      JSON.stringify({ type: "error", code: "KABOOM", message: "x" }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects an attach frame without its snapshot", () => {
    // The snapshot is the whole point of attaching; a client that repaints from
    // an absent field shows an empty terminal for a session full of output.
    const result = decodePtyServerMessage(
      JSON.stringify({ type: "attached", sessionId: "s1", state: "running", cols: 80, rows: 24 }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects an unknown session state", () => {
    const result = decodePtyServerMessage(
      JSON.stringify({
        type: "attached",
        sessionId: "s1",
        state: "zombie",
        cols: 80,
        rows: 24,
        snapshot: "",
      }),
    );

    expect(result.ok).toBe(false);
  });
});
