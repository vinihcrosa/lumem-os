import { describe, expect, it } from "vitest";

import {
  ACP_CLOSE_SESSION_NOT_FOUND,
  ACP_SESSION_PARAM,
  ACP_WS_PATH,
  decodeAcpClientMessage,
  decodeAcpServerMessage,
  encodeAcpClientMessage,
  encodeAcpServerMessage,
  type AcpClientMessage,
  type AcpEvent,
  type AcpServerMessage,
} from "./acp-protocol.js";

/** A tool call every test can lean on, so each one only states its own point. */
const toolCall: AcpEvent = {
  type: "tool_call",
  toolCallId: "tc-1",
  title: "Edit src/lore/loader.ts",
  name: "Edit",
  kind: "edit",
  status: "running",
  locations: [{ path: "/repo/src/lore/loader.ts", line: 41 }],
};

describe("constants", () => {
  it("serves ACP on its own path, apart from the PTY stream", () => {
    // The mechanism is the PTY's, the messages are not: an endpoint carrying
    // both unions forces every client to discriminate before it can read.
    expect(ACP_WS_PATH).toBe("/acp");
    expect(ACP_SESSION_PARAM).toBe("session");
  });

  it("refuses an unknown session with the same application code as the PTY", () => {
    expect(ACP_CLOSE_SESSION_NOT_FOUND).toBe(4404);
  });
});

describe("decodeAcpClientMessage", () => {
  it("accepts a prompt", () => {
    const result = decodeAcpClientMessage(
      JSON.stringify({ type: "prompt", text: "arruma o frontmatter vazio" }),
    );

    expect(result).toEqual({
      ok: true,
      message: { type: "prompt", text: "arruma o frontmatter vazio" },
    });
  });

  it("accepts a cancel", () => {
    expect(decodeAcpClientMessage(JSON.stringify({ type: "cancel" }))).toEqual({
      ok: true,
      message: { type: "cancel" },
    });
  });

  it("accepts a permission response", () => {
    const result = decodeAcpClientMessage(
      JSON.stringify({ type: "permission_response", requestId: "rq-1", optionId: "allow" }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a frame that is not JSON", () => {
    const result = decodeAcpClientMessage("not json at all");

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/not valid JSON/);
  });

  it("rejects an unknown message type", () => {
    expect(decodeAcpClientMessage(JSON.stringify({ type: "set_mode", mode: "plan" })).ok).toBe(
      false,
    );
  });

  it("rejects an empty prompt", () => {
    // Nothing to send is not a turn, and the agent would bill a turn for it.
    const result = decodeAcpClientMessage(JSON.stringify({ type: "prompt", text: "" }));

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("text");
  });

  it("rejects a permission response without an option", () => {
    const result = decodeAcpClientMessage(
      JSON.stringify({ type: "permission_response", requestId: "rq-1" }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("optionId");
  });

  it("survives a round trip", () => {
    const message: AcpClientMessage = { type: "prompt", text: "roda o gate" };

    expect(decodeAcpClientMessage(encodeAcpClientMessage(message))).toEqual({ ok: true, message });
  });
});

describe("decodeAcpServerMessage — attach", () => {
  it("accepts an attach carrying the transcript for replay", () => {
    const message: AcpServerMessage = {
      type: "attached",
      sessionId: "s-1",
      state: "running",
      acpSessionId: "d81b05ee",
      model: "opus[1m]",
      mode: "auto",
      transcript: [toolCall],
    };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("accepts an attach with an empty transcript", () => {
    // A brand new session has said nothing yet, and that is not an error.
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "attached",
        sessionId: "s-1",
        state: "running",
        acpSessionId: "d81b05ee",
        model: "opus[1m]",
        mode: "auto",
        transcript: [],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects an attach whose transcript holds something that is not an event", () => {
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "attached",
        sessionId: "s-1",
        state: "running",
        acpSessionId: "d81b05ee",
        model: "opus[1m]",
        mode: "auto",
        transcript: [{ type: "nonsense" }],
      }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("decodeAcpServerMessage — events", () => {
  it.each<[string, AcpEvent]>([
    ["an agent message chunk", { type: "message", messageId: "m-1", role: "agent", text: "O " }],
    ["a user message chunk", { type: "message", messageId: "m-0", role: "user", text: "oi" }],
    ["a thought chunk", { type: "thought", messageId: "m-1", text: "separar o parser" }],
    ["a tool call", toolCall],
    ["a tool call update", { type: "tool_call_update", toolCallId: "tc-1", status: "ok" }],
    [
      "a tool call update carrying text output",
      {
        type: "tool_call_update",
        toolCallId: "tc-1",
        status: "failed",
        content: [{ type: "content", text: "error TS2345" }],
      },
    ],
    [
      "a tool call update carrying a diff",
      {
        type: "tool_call_update",
        toolCallId: "tc-1",
        status: "ok",
        content: [
          {
            type: "diff",
            path: "/repo/src/lore/loader.ts",
            oldText: "const FENCE = '---';",
            newText: "import { parseFrontmatter } from './frontmatter.js';",
          },
        ],
      },
    ],
    [
      "a tool call update carrying a terminal it does not render yet",
      {
        type: "tool_call_update",
        toolCallId: "tc-1",
        status: "running",
        content: [{ type: "terminal", terminalId: "t-1" }],
      },
    ],
    [
      "a permission request",
      {
        type: "permission_request",
        requestId: "rq-1",
        toolCallId: "tc-2",
        title: "Bash rm -rf node_modules/.vite",
        command: "rm -rf node_modules/.vite",
        cwd: "/repo",
        options: [
          { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
          { optionId: "never", name: "nunca para Bash", kind: "reject_always" },
        ],
      },
    ],
    [
      "a permission resolved by the user",
      { type: "permission_resolved", requestId: "rq-1", outcome: { optionId: "allow" } },
    ],
    [
      "a permission the agent gave up on",
      { type: "permission_resolved", requestId: "rq-1", outcome: "cancelled" },
    ],
    ["a turn ending", { type: "turn_end", stopReason: "end_turn" }],
    ["a turn the user interrupted", { type: "turn_end", stopReason: "cancelled" }],
  ])("accepts %s", (_label, event) => {
    const message: AcpServerMessage = { type: "event", event };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("accepts an event it does not know, instead of failing on it", () => {
    // The protocol evolves and v2 is a draft. An unrecognised `session/update`
    // reaches the browser as `unknown` so the tab can say so in grey — never as
    // a decode failure, which would look like a broken daemon.
    const message: AcpServerMessage = {
      type: "event",
      event: { type: "unknown", sessionUpdate: "steering_update" },
    };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("rejects an event type that is neither known nor spelled as unknown", () => {
    // `unknown` is a deliberate shape the daemon produces, not a hole anything
    // can fall into: a typo in our own code must still fail loudly.
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "event", event: { type: "tool_cal", toolCallId: "tc-1" } }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("decodeAcpServerMessage — the five card states", () => {
  it.each(["pending", "running", "ok", "failed", "cancelled"])("accepts %s", (status) => {
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "event",
        event: { type: "tool_call_update", toolCallId: "tc-1", status },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    ["the ACP spelling of running", "in_progress"],
    ["the ACP spelling of ok", "completed"],
    ["a state nobody defined", "exploded"],
  ])("rejects %s", (_label, status) => {
    // The wire speaks our five names. ACP's own four are translated once, in the
    // daemon; letting both spellings through would put the mapping in every
    // reader instead of at the boundary.
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "event",
        event: { type: "tool_call_update", toolCallId: "tc-1", status },
      }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("decodeAcpServerMessage — errors", () => {
  it("accepts an error with a remedy the tab can show", () => {
    const message: AcpServerMessage = {
      type: "error",
      code: "ADAPTER_UNAVAILABLE",
      message: "claude-agent-acp não está no PATH. Esta sessão fixa a versão 0.69.0.",
      remedy: "npm i -g @agentclientprotocol/claude-agent-acp@0.69.0",
    };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("accepts an error without a remedy", () => {
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "error", code: "SESSION_NOT_FOUND", message: "no such session" }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects an error code nobody defined", () => {
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "error", code: "KABOOM", message: "…" }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("decode failures name the field", () => {
  it("points at the missing field rather than saying the object is wrong", () => {
    // Every caller is inside a socket handler, and the only thing that makes a
    // rejected frame debuggable is knowing which field failed.
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "event", event: { type: "tool_call", title: "Edit" } }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("toolCallId");
  });
});
