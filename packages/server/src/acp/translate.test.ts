import { describe, expect, it } from "vitest";

import { translateSessionUpdate, type TranslateContext } from "./translate.js";

/**
 * The only place ACP's vocabulary meets ours.
 *
 * Everything here is about a boundary, so the cases are about what crosses it
 * and what does not: statuses that get renamed, variants that are known but not
 * rendered yet, and variants nobody has seen. Getting this wrong is invisible
 * downstream — a mistranslated status just paints the wrong colour.
 */

const context: TranslateContext = { fallbackMessageId: "turn-1" };

describe("message chunks", () => {
  it("translates an agent chunk", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "agent_message_chunk",
          messageId: "m-7",
          content: { type: "text", text: "O parser " },
        },
        context,
      ),
    ).toEqual({ type: "message", messageId: "m-7", role: "agent", text: "O parser " });
  });

  it("translates a user chunk", () => {
    expect(
      translateSessionUpdate(
        { sessionUpdate: "user_message_chunk", messageId: "m-6", content: { type: "text", text: "oi" } },
        context,
      ),
    ).toEqual({ type: "message", messageId: "m-6", role: "user", text: "oi" });
  });

  it("translates a thought chunk", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "agent_thought_chunk",
          messageId: "m-7",
          content: { type: "text", text: "separar o parser" },
        },
        context,
      ),
    ).toEqual({ type: "thought", messageId: "m-7", text: "separar o parser" });
  });

  it("falls back to the turn's id when the agent sends no message id", () => {
    // `messageId` is optional in ACP, and the spec's own reading is that its
    // absence means every chunk belongs to one message. Inventing a fresh id per
    // chunk would render one paragraph per token.
    expect(
      translateSessionUpdate(
        { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
        context,
      ),
    ).toEqual({ type: "message", messageId: "turn-1", role: "agent", text: "ok" });
  });

  it("ignores a chunk carrying content it cannot show", () => {
    // `promptCapabilities.image` is true, and rendering images is phase 4. An
    // image is not an unrecognised event, so it must not be reported as one —
    // the tab would say "ignored" about something the protocol defines.
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "agent_message_chunk",
          messageId: "m-7",
          content: { type: "image", data: "…", mimeType: "image/png" },
        },
        context,
      ),
    ).toBeNull();
  });
});

describe("tool calls", () => {
  it("translates a call with everything filled in", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          title: "Edit src/lore/loader.ts",
          name: "Edit",
          kind: "edit",
          status: "in_progress",
          locations: [{ path: "/repo/src/lore/loader.ts", line: 41 }],
        },
        context,
      ),
    ).toEqual({
      type: "tool_call",
      toolCallId: "tc-1",
      title: "Edit src/lore/loader.ts",
      name: "Edit",
      kind: "edit",
      status: "running",
      locations: [{ path: "/repo/src/lore/loader.ts", line: 41 }],
    });
  });

  it("defaults a call the agent barely described", () => {
    // Only `toolCallId` and `title` are required by ACP. A card still has to
    // render, so the gaps become the least-committal values there are.
    expect(
      translateSessionUpdate(
        { sessionUpdate: "tool_call", toolCallId: "tc-2", title: "doing something" },
        context,
      ),
    ).toEqual({
      type: "tool_call",
      toolCallId: "tc-2",
      title: "doing something",
      name: null,
      kind: "other",
      status: "pending",
      locations: [],
    });
  });

  it.each([
    ["pending", "pending"],
    ["in_progress", "running"],
    ["completed", "ok"],
    ["failed", "failed"],
  ])("maps ACP status %s to %s", (acp, ours) => {
    const event = translateSessionUpdate(
      { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: acp },
      context,
    );

    expect(event).toMatchObject({ status: ours });
  });

  it("never produces the fifth state on its own", () => {
    // `cancelled` has no ACP counterpart (A14). It is derived when a turn ends
    // as cancelled, which happens in the manager — not here. If translation
    // could produce it, there would be two sources for one state.
    const statuses = ["pending", "in_progress", "completed", "failed"].map((status) =>
      translateSessionUpdate(
        { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status },
        context,
      ),
    );

    expect(statuses.map((event) => (event as { status: string }).status)).not.toContain("cancelled");
  });

  it("carries only the fields an update actually changed", () => {
    // Every field but the id is optional in ACP: the adapter sends what moved.
    // Filling in the rest would overwrite a title the client already has.
    expect(
      translateSessionUpdate(
        { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: "completed" },
        context,
      ),
    ).toEqual({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" });
  });

  it("translates text output", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          content: [{ type: "content", content: { type: "text", text: "214 passed" } }],
        },
        context,
      ),
    ).toEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      content: [{ type: "content", text: "214 passed" }],
    });
  });

  it("translates a diff, including a file being created", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          content: [{ type: "diff", path: "/repo/src/lore/frontmatter.ts", newText: "export {}" }],
        },
        context,
      ),
    ).toEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      content: [
        { type: "diff", path: "/repo/src/lore/frontmatter.ts", oldText: null, newText: "export {}" },
      ],
    });
  });

  it("carries a terminal it cannot render yet", () => {
    // Dropping it would leave the agent waiting on a call the client silently
    // discarded. Carrying it costs one variant the UI ignores until F3.
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          content: [{ type: "terminal", terminalId: "t-1" }],
        },
        context,
      ),
    ).toEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      content: [{ type: "terminal", terminalId: "t-1" }],
    });
  });

  it("drops a content item it cannot show, keeping the ones it can", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          content: [
            { type: "content", content: { type: "image", data: "…", mimeType: "image/png" } },
            { type: "content", content: { type: "text", text: "ok" } },
          ],
        },
        context,
      ),
    ).toEqual({
      type: "tool_call_update",
      toolCallId: "tc-1",
      content: [{ type: "content", text: "ok" }],
    });
  });
});

describe("the plan", () => {
  it("translates a plan with its three statuses", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "plan",
          entries: [
            { content: "ler o loader", status: "completed", priority: "high" },
            { content: "extrair o parser", status: "in_progress" },
            { content: "rodar o gate", status: "pending", priority: "low" },
          ],
        },
        context,
      ),
    ).toEqual({
      type: "plan",
      entries: [
        { content: "ler o loader", status: "completed", priority: "high" },
        { content: "extrair o parser", status: "in_progress", priority: null },
        { content: "rodar o gate", status: "pending", priority: "low" },
      ],
    });
  });

  it("treats plan_update the same way, because both carry the whole plan", () => {
    // The protocol has both spellings and the adapter has been seen to send
    // either. Neither is a delta, so telling them apart downstream would be a
    // distinction with no consequence.
    const entries = [{ content: "um", status: "pending" }];

    expect(translateSessionUpdate({ sessionUpdate: "plan_update", entries }, context)).toEqual(
      translateSessionUpdate({ sessionUpdate: "plan", entries }, context),
    );
  });

  it("accepts an empty plan, which is the agent announcing it has one", () => {
    expect(translateSessionUpdate({ sessionUpdate: "plan", entries: [] }, context)).toEqual({
      type: "plan",
      entries: [],
    });
  });

  it("translates the plan being withdrawn", () => {
    expect(translateSessionUpdate({ sessionUpdate: "plan_removed" }, context)).toEqual({
      type: "plan_removed",
    });
  });

  it("drops the whole plan rather than guessing one step's status", () => {
    // A plan is read as a sequence. One step silently downgraded to `pending`
    // would misreport progress in the one place that exists to report it.
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "plan",
          entries: [
            { content: "ok", status: "completed" },
            { content: "?", status: "abandonado" },
          ],
        },
        context,
      ),
    ).toEqual({ type: "unknown", sessionUpdate: "plan:malformed" });
  });

  it("reports a plan whose entries are not entries", () => {
    expect(
      translateSessionUpdate({ sessionUpdate: "plan", entries: "nada" }, context),
    ).toMatchObject({ type: "unknown" });
  });
});

describe("usage and the subscription's limit", () => {
  it("translates a usage report with everything the spike measured", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "usage_update",
          used: 39_200,
          size: 1_000_000,
          cost: { amount: 0.235433, currency: "USD" },
          _meta: {
            "_claude/rateLimit": {
              status: "allowed_warning",
              rateLimitType: "seven_day",
              utilization: 0.94,
              isUsingOverage: false,
              surpassedThreshold: 0.75,
              resetsAt: 1_787_004_000,
            },
          },
        },
        context,
      ),
    ).toEqual({
      type: "usage",
      used: 39_200,
      size: 1_000_000,
      cost: { amount: 0.235433, currency: "USD" },
      rateLimit: {
        utilization: 0.94,
        isUsingOverage: false,
        surpassedThreshold: 0.75,
        resetsAt: 1_787_004_000,
        kind: "seven_day",
      },
    });
  });

  it("reports no cost rather than a cost of nothing", () => {
    // An agent that does not report money must not look like one that charged
    // nothing. The footer shows a dash, and a dash is the honest answer.
    expect(
      translateSessionUpdate({ sessionUpdate: "usage_update", used: 10, size: 200_000 }, context),
    ).toMatchObject({ cost: null });
  });

  it("keeps a usage report whose rate limit block is missing", () => {
    // The block is a Claude extension. Another agent will not send it, and losing
    // a perfectly good usage report over its absence would make Lumem stricter
    // than the protocol.
    expect(
      translateSessionUpdate({ sessionUpdate: "usage_update", used: 10, size: 200_000 }, context),
    ).toMatchObject({ used: 10, rateLimit: null });
  });

  it("drops a rate limit block that does not say whether it is in overage", () => {
    // `isUsingOverage` is the detector that arrives before the invoice, so it is
    // the one field this refuses to guess. Defaulting it to `false` would be the
    // system reporting good news it does not have.
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "usage_update",
          used: 10,
          size: 200_000,
          _meta: { "_claude/rateLimit": { utilization: 0.99 } },
        },
        context,
      ),
    ).toMatchObject({ rateLimit: null });
  });

  it("survives a rate limit block with only the two fields it needs", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "usage_update",
          used: 10,
          size: 200_000,
          _meta: { "_claude/rateLimit": { utilization: 0.2, isUsingOverage: false } },
        },
        context,
      ),
    ).toMatchObject({
      rateLimit: { utilization: 0.2, isUsingOverage: false, surpassedThreshold: null, kind: null },
    });
  });

  it("refuses a report with no window to measure against", () => {
    // Everything downstream divides by `size`.
    expect(
      translateSessionUpdate({ sessionUpdate: "usage_update", used: 10, size: 0 }, context),
    ).toEqual({ type: "unknown", sessionUpdate: "usage_update:malformed" });
  });

  it("refuses a report that counts nothing", () => {
    expect(
      translateSessionUpdate({ sessionUpdate: "usage_update", size: 200_000 }, context),
    ).toMatchObject({ type: "unknown" });
  });
});

describe("slash commands", () => {
  it("translates the list the agent offers", () => {
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "available_commands_update",
          availableCommands: [
            { name: "gate", description: "roda o gate declarado pela task" },
            { name: "compact", description: "comprime a conversa", input: { hint: "quanto" } },
          ],
        },
        context,
      ),
    ).toEqual({
      type: "commands",
      commands: [
        { name: "gate", description: "roda o gate declarado pela task", takesInput: false },
        { name: "compact", description: "comprime a conversa", takesInput: true },
      ],
    });
  });

  it("accepts an agent that offers none", () => {
    expect(
      translateSessionUpdate(
        { sessionUpdate: "available_commands_update", availableCommands: [] },
        context,
      ),
    ).toEqual({ type: "commands", commands: [] });
  });

  it("skips a malformed command rather than losing the whole menu", () => {
    // Unlike a plan, the menu is a set of independent entries. Dropping all of them
    // because one arrived without a name would take away a feature over a typo.
    expect(
      translateSessionUpdate(
        {
          sessionUpdate: "available_commands_update",
          availableCommands: [{ description: "sem nome" }, { name: "gate", description: "ok" }],
        },
        context,
      ),
    ).toEqual({
      type: "commands",
      commands: [{ name: "gate", description: "ok", takesInput: false }],
    });
  });

  it("tolerates a command with no description", () => {
    expect(
      translateSessionUpdate(
        { sessionUpdate: "available_commands_update", availableCommands: [{ name: "gate" }] },
        context,
      ),
    ).toMatchObject({ commands: [{ name: "gate", description: "" }] });
  });

  it("reports a payload that is not a list at all", () => {
    expect(
      translateSessionUpdate(
        { sessionUpdate: "available_commands_update", availableCommands: "nada" },
        context,
      ),
    ).toMatchObject({ type: "unknown" });
  });
});

describe("variants that are known but not rendered yet", () => {
  it.each([
    "current_mode_update",
    "config_option_update",
    "session_info_update",
  ])("ignores %s without calling it unrecognised", (sessionUpdate) => {
    // Phase 4 renders all of these. Reporting them as `unknown` today would put
    // "unrecognised event" in the tab about things the protocol defines and the
    // prototype already draws — which is a lie the user would have to debug.
    expect(translateSessionUpdate({ sessionUpdate }, context)).toBeNull();
  });
});

describe("variants nobody has seen", () => {
  it("reports an unrecognised update rather than throwing", () => {
    expect(translateSessionUpdate({ sessionUpdate: "steering_update" }, context)).toEqual({
      type: "unknown",
      sessionUpdate: "steering_update",
    });
  });

  it("reports an update with no discriminator at all", () => {
    // A malformed notification is still not a reason to take down the session.
    expect(translateSessionUpdate({ nothing: true }, context)).toEqual({
      type: "unknown",
      sessionUpdate: "<missing>",
    });
  });

  it("survives a chunk with no content field", () => {
    expect(
      translateSessionUpdate({ sessionUpdate: "agent_message_chunk" }, context),
    ).toBeNull();
  });

  it("reports an unknown tool status instead of guessing one", () => {
    // Guessing `failed` would paint a red card over something that may have
    // succeeded; guessing `ok` is worse. Neither is ours to decide.
    expect(
      translateSessionUpdate(
        { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: "wedged" },
        context,
      ),
    ).toEqual({ type: "unknown", sessionUpdate: "tool_call_update:status=wedged" });
  });

  it("reports an unknown tool kind instead of rejecting the call", () => {
    // The kind drives a glyph and nothing else, so an unknown one degrades to
    // `other` — losing a card over an icon would be the worse trade.
    expect(
      translateSessionUpdate(
        { sessionUpdate: "tool_call", toolCallId: "tc-1", title: "?", kind: "telepathy" },
        context,
      ),
    ).toMatchObject({ type: "tool_call", kind: "other" });
  });
});
