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
      configOptions: [],
      transcript: [{ at: 1_700_000_000_000, event: toolCall }],
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
        transcript: [{ at: 1, event: { type: "nonsense" } }],
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
    const message: AcpServerMessage = { type: "event", at: 1_700_000_000_000, event };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("accepts an event it does not know, instead of failing on it", () => {
    // The protocol evolves and v2 is a draft. An unrecognised `session/update`
    // reaches the browser as `unknown` so the tab can say so in grey — never as
    // a decode failure, which would look like a broken daemon.
    const message: AcpServerMessage = {
      type: "event",
      at: 1_700_000_000_000,
      event: { type: "unknown", sessionUpdate: "steering_update" },
    };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("rejects an event type that is neither known nor spelled as unknown", () => {
    // `unknown` is a deliberate shape the daemon produces, not a hole anything
    // can fall into: a typo in our own code must still fail loudly.
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "event", at: 1, event: { type: "tool_cal", toolCallId: "tc-1" } }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("decodeAcpServerMessage — the five card states", () => {
  it.each(["pending", "running", "ok", "failed", "cancelled"])("accepts %s", (status) => {
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "event",
        at: 1,
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
        at: 1,
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
      JSON.stringify({ type: "event", at: 1, event: { type: "tool_call", title: "Edit" } }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("toolCallId");
  });
});

describe("what phase 4 added", () => {
  const configOption = {
    id: "model",
    name: "Model",
    category: "model",
    currentValue: "opus[1m]",
    choices: [
      { value: "opus[1m]", name: "opus[1m]", description: "Opus 5 · 1M" },
      { value: "sonnet", name: "sonnet", description: null },
    ],
  };

  it.each<[string, AcpEvent]>([
    [
      "a plan, whole",
      {
        type: "plan",
        entries: [
          { content: "ler o loader", status: "completed", priority: "high" },
          { content: "extrair o parser", status: "in_progress", priority: null },
          { content: "rodar o gate", status: "pending", priority: "low" },
        ],
      },
    ],
    ["a plan being withdrawn", { type: "plan_removed" }],
    [
      "usage with cost and the subscription's limit",
      {
        type: "usage",
        used: 39_200,
        size: 1_000_000,
        cost: { amount: 0.235433, currency: "USD" },
        rateLimit: {
          utilization: 0.94,
          surpassedThreshold: 0.75,
          isUsingOverage: false,
          resetsAt: 1_787_004_000,
          kind: "seven_day",
        },
      },
    ],
    [
      "usage from an agent that reports no money",
      { type: "usage", used: 10, size: 200_000, cost: null, rateLimit: null },
    ],
    ["the selectors' state", { type: "config", mode: "auto", options: [configOption] }],
    [
      "the commands on offer",
      {
        type: "commands",
        commands: [
          { name: "gate", description: "roda o gate declarado pela task", takesInput: false },
          { name: "compact", description: "comprime a conversa", takesInput: true },
        ],
      },
    ],
    [
      "a terminal, carrying the PTY session it attaches to",
      {
        type: "terminal",
        terminalId: "t-1",
        ptySessionId: "se_abc123",
        command: "pnpm vitest run",
      },
    ],
  ])("accepts %s", (_label, event) => {
    const message: AcpServerMessage = { type: "event", at: 1_700_000_000_000, event };

    expect(decodeAcpServerMessage(encodeAcpServerMessage(message))).toEqual({ ok: true, message });
  });

  it("refuses a plan status nobody defined", () => {
    // The plan has ACP's three and no more. Unlike the tool card, it needs no
    // fifth: a cancelled turn leaves its steps exactly where they were, which is
    // the truth about them.
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "event",
        at: 1,
        event: { type: "plan", entries: [{ content: "x", status: "cancelled" }] },
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a usage report with no window to measure against", () => {
    const result = decodeAcpServerMessage(
      JSON.stringify({ type: "event", at: 1, event: { type: "usage", used: 10, size: 0 } }),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a terminal with no PTY session behind it", () => {
    // D7: the id is what the embedded xterm attaches to. Without it the card has
    // a terminal it cannot show.
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "event",
        at: 1,
        event: { type: "terminal", terminalId: "t-1", command: "ls" },
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("accepts an attach that already carries the selectors", () => {
    // Filled in on attach, not only when something changes: a tab that opened with
    // empty dropdowns until the agent happened to mention something would look
    // broken for as long as nothing did.
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "attached",
        sessionId: "s-1",
        state: "running",
        acpSessionId: "d81b05ee",
        model: "opus[1m]",
        mode: "auto",
        configOptions: [configOption],
        transcript: [],
      }),
    );

    expect(result.ok && result.message.type === "attached" && result.message.configOptions).toEqual([
      configOption,
    ]);
  });

  it("defaults the selectors to none, for a daemon that sent none", () => {
    const result = decodeAcpServerMessage(
      JSON.stringify({
        type: "attached",
        sessionId: "s-1",
        state: "running",
        acpSessionId: "d81b05ee",
        model: "",
        mode: "",
        transcript: [],
      }),
    );

    expect(result.ok && result.message.type === "attached" && result.message.configOptions).toEqual(
      [],
    );
  });

  it("accepts a switch of anything the selectors offer", () => {
    const message: AcpClientMessage = { type: "set_config", optionId: "model", value: "sonnet" };

    expect(decodeAcpClientMessage(encodeAcpClientMessage(message))).toEqual({ ok: true, message });
  });

  it("refuses a switch with nothing to switch to", () => {
    const result = decodeAcpClientMessage(
      JSON.stringify({ type: "set_config", optionId: "model", value: "" }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("value");
  });
});
