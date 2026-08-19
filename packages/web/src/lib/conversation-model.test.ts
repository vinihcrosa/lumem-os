import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import {
  emptyConversation,
  reduceConversation,
  replayConversation,
  type ConversationState,
} from "./conversation-model.js";

/**
 * The conversation as data, before any of it is a component.
 *
 * Pure on purpose, and the one property everything else leans on is stated as a
 * test here rather than assumed: replaying a transcript has to produce exactly
 * what the live stream produced. If it does not, reopening a tab shows something
 * subtly different from the tab that stayed open — the worst kind of bug,
 * because both look plausible.
 */

let clock = 1_700_000_000_000;
/** Stamps entries in arrival order, so elapsed time is a real number. */
function at(event: AcpEvent, deltaMs = 0): AcpTranscriptEntry {
  clock += deltaMs;
  return { at: clock, event };
}

function feed(state: ConversationState, ...entries: AcpTranscriptEntry[]): ConversationState {
  return entries.reduce(reduceConversation, state);
}

function from(...entries: AcpTranscriptEntry[]): ConversationState {
  return feed(emptyConversation(), ...entries);
}

const userSaid = (text: string, messageId = "u-1"): AcpTranscriptEntry =>
  at({ type: "message", messageId, role: "user", text });

const agentSaid = (text: string, messageId = "a-1"): AcpTranscriptEntry =>
  at({ type: "message", messageId, role: "agent", text });

describe("turns", () => {
  it("starts empty", () => {
    const state = emptyConversation();

    expect(state.turns).toEqual([]);
    expect(state.streaming).toBe(false);
    expect(state.pendingPermission).toBeNull();
  });

  it("opens a user turn and then an agent turn", () => {
    const state = from(userSaid("arruma o frontmatter"), agentSaid("Vou separar o parser."));

    expect(state.turns.map((turn) => turn.role)).toEqual(["user", "agent"]);
  });

  it("merges chunks that share a message id into one block", () => {
    // The adapter streams a message as many chunks. One block per chunk would
    // render a paragraph per token.
    const state = from(agentSaid("O parser "), agentSaid("saiu "), agentSaid("daqui."));

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]?.blocks).toEqual([
      { kind: "message", messageId: "a-1", text: "O parser saiu daqui." },
    ]);
  });

  it("starts a new block when the message id changes", () => {
    // A change of id is the protocol saying a new message began. Appending
    // anyway would glue two answers into one paragraph.
    const state = from(agentSaid("primeira", "a-1"), agentSaid("segunda", "a-2"));

    expect(state.turns[0]?.blocks).toEqual([
      { kind: "message", messageId: "a-1", text: "primeira" },
      { kind: "message", messageId: "a-2", text: "segunda" },
    ]);
  });

  it("keeps thought separate from what the agent said", () => {
    const state = from(
      at({ type: "thought", messageId: "t-1", text: "dois caminhos" }),
      agentSaid("Vou separar."),
    );

    expect(state.turns[0]?.blocks).toEqual([
      { kind: "thought", messageId: "t-1", text: "dois caminhos" },
      { kind: "message", messageId: "a-1", text: "Vou separar." },
    ]);
  });

  it("opens an agent turn for a chunk that arrives with no turn in progress", () => {
    // Reconnecting mid-answer, or an adapter that speaks before being asked.
    // Dropping the chunk would lose the only thing on screen.
    const state = from(agentSaid("já estava falando"));

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]?.role).toBe("agent");
  });

  it("does not merge a user message into the agent's turn", () => {
    const state = from(agentSaid("respondi"), userSaid("e agora?", "u-2"));

    expect(state.turns.map((turn) => turn.role)).toEqual(["agent", "user"]);
  });
});

describe("streaming", () => {
  it("is true from the moment the user asks something", () => {
    expect(from(userSaid("vai")).streaming).toBe(true);
  });

  it("stops when the turn ends, and remembers why", () => {
    const state = from(userSaid("vai"), at({ type: "turn_end", stopReason: "end_turn" }));

    expect(state.streaming).toBe(false);
    expect(state.lastStopReason).toBe("end_turn");
  });

  it("goes back to streaming on the next question", () => {
    const state = from(
      userSaid("primeiro"),
      at({ type: "turn_end", stopReason: "end_turn" }),
      userSaid("segundo", "u-2"),
    );

    expect(state.streaming).toBe(true);
  });
});

describe("tool calls", () => {
  const call: AcpEvent = {
    type: "tool_call",
    toolCallId: "tc-1",
    title: "Edit loader.ts",
    name: "Edit",
    kind: "edit",
    status: "running",
    locations: [{ path: "/repo/src/lore/loader.ts", line: 41 }],
  };

  it("adds a card where it happened", () => {
    const state = from(userSaid("arruma"), at(call));

    expect(state.turns[1]?.blocks[0]).toMatchObject({
      kind: "tool",
      call: { toolCallId: "tc-1", status: "running", name: "Edit" },
    });
  });

  it("moves an existing card rather than adding a second one", () => {
    const state = from(
      at(call),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }),
    );

    expect(state.turns[0]?.blocks).toHaveLength(1);
    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { status: "ok" } });
  });

  it("keeps the title an update did not mention", () => {
    // The adapter sends deltas, not snapshots. Overwriting with a blank would
    // erase what the user is reading.
    const state = from(
      at(call),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }),
    );

    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { title: "Edit loader.ts" } });
  });

  it("measures elapsed time from the daemon's stamps", () => {
    // The reason `at` is on the wire at all. A browser clock here would make the
    // reducer impure and replay would stop reproducing the live stream.
    const state = from(
      at(call),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }, 1_400),
    );

    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { elapsedMs: 1_400 } });
  });

  it("counts added and removed lines from the diff it was given", () => {
    // Derived rather than transmitted: the diff is already there, and a second
    // source for the same number is a second thing that can disagree.
    const state = from(
      at(call),
      at({
        type: "tool_call_update",
        toolCallId: "tc-1",
        status: "ok",
        content: [
          {
            type: "diff",
            path: "/repo/loader.ts",
            oldText: "um\ndois\ntres",
            newText: "um\ndois alterado\ntres\nquatro",
          },
        ],
      }),
    );

    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { added: 2, removed: 1 } });
  });

  it("counts a whole new file as added and nothing removed", () => {
    const state = from(
      at(call),
      at({
        type: "tool_call_update",
        toolCallId: "tc-1",
        status: "ok",
        content: [{ type: "diff", path: "/repo/novo.ts", newText: "uma\nduas" }],
      }),
    );

    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { added: 2, removed: 0 } });
  });

  it("ignores an update for a call it never saw, rather than throwing", () => {
    // D3's spirit one layer up: a frame about something unknown must not take
    // the tab down. It is worth noticing, though, so it is counted.
    const state = from(at({ type: "tool_call_update", toolCallId: "fantasma", status: "ok" }));

    expect(state.turns).toEqual([]);
    expect(state.orphanUpdates).toBe(1);
  });

  it("updates a card that is not in the newest turn", () => {
    // A long call can finish after the agent has moved on and the user has asked
    // something else. Searching only the last turn would lose the result.
    const state = from(
      at(call),
      at({ type: "turn_end", stopReason: "end_turn" }),
      userSaid("outra coisa", "u-2"),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }),
    );

    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { status: "ok" } });
  });
});

describe("permission", () => {
  const call: AcpEvent = {
    type: "tool_call",
    toolCallId: "tc-1",
    title: "Bash rm -rf .vite",
    name: "Bash",
    kind: "execute",
    status: "pending",
    locations: [],
  };
  const request: AcpEvent = {
    type: "permission_request",
    requestId: "rq-1",
    toolCallId: "tc-1",
    title: "Bash rm -rf .vite",
    command: "rm -rf node_modules/.vite",
    cwd: "/repos/lorebase",
    options: [
      { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
      { optionId: "never", name: "nunca para Bash", kind: "reject_always" },
    ],
  };

  it("blocks the conversation while it waits", () => {
    const state = from(userSaid("limpa"), at(call), at(request));

    expect(state.pendingPermission).toMatchObject({
      requestId: "rq-1",
      command: "rm -rf node_modules/.vite",
      cwd: "/repos/lorebase",
    });
    expect(state.turns.at(-1)?.blocks.at(-1)).toMatchObject({ kind: "permission" });
  });

  it("turns the answered request into the card's verdict", () => {
    // The prototype's rule: an answered request does not become separate
    // history. It becomes the verdict on the card it was about.
    const state = from(
      userSaid("limpa"),
      at(call),
      at(request),
      at({ type: "permission_resolved", requestId: "rq-1", outcome: { optionId: "allow" } }),
    );

    expect(state.pendingPermission).toBeNull();
    const blocks = state.turns.at(-1)?.blocks ?? [];
    expect(blocks.some((block) => block.kind === "permission")).toBe(false);
    expect(blocks[0]).toMatchObject({
      kind: "tool",
      call: { verdict: { optionId: "allow", name: "permitir uma vez", kind: "allow_once" } },
    });
  });

  it("keeps the block when the agent gave up on its own ask", () => {
    // `cancelled` is the agent withdrawing, not the user denying. Recording it as
    // a verdict would put words in the user's mouth.
    const state = from(
      at(call),
      at(request),
      at({ type: "permission_resolved", requestId: "rq-1", outcome: "cancelled" }),
    );

    expect(state.pendingPermission).toBeNull();
    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { verdict: null } });
  });

  it("keeps a resolution for a request it never saw from getting lost", () => {
    const state = from(
      at({ type: "permission_resolved", requestId: "rq-nada", outcome: { optionId: "allow" } }),
    );

    expect(state.pendingPermission).toBeNull();
    expect(state.orphanUpdates).toBe(1);
  });

  it("shows only the newest ask when two arrive", () => {
    // The agent blocks on one at a time; a second means the first was answered
    // or withdrawn. Showing both would offer a choice about nothing.
    const state = from(
      at(request),
      at({ ...request, requestId: "rq-2" } as AcpEvent),
    );

    expect(state.pendingPermission?.requestId).toBe("rq-2");
  });
});

describe("events nobody recognises", () => {
  it("shows them where they happened and never throws", () => {
    const state = from(
      userSaid("vai"),
      at({ type: "unknown", sessionUpdate: "steering_update" }),
      agentSaid("segui adiante"),
    );

    expect(state.turns.at(-1)?.blocks).toEqual([
      { kind: "note", text: "evento não reconhecido: steering_update" },
      { kind: "message", messageId: "a-1", text: "segui adiante" },
    ]);
  });
});

describe("replay and live stream agree", () => {
  /** The same conversation, told once. */
  function conversation(): AcpTranscriptEntry[] {
    clock = 1_700_000_000_000;
    return [
      userSaid("arruma o frontmatter vazio"),
      at({ type: "thought", messageId: "t-1", text: "separar o parser" }, 100),
      agentSaid("O parser está inline. ", "a-1"),
      at(
        {
          type: "tool_call",
          toolCallId: "tc-1",
          title: "Edit loader.ts",
          name: "Edit",
          kind: "edit",
          status: "running",
          locations: [],
        },
        50,
      ),
      at(
        {
          type: "permission_request",
          requestId: "rq-1",
          toolCallId: "tc-1",
          title: "Bash",
          command: "rm -rf .vite",
          cwd: "/repo",
          options: [{ optionId: "allow", name: "permitir", kind: "allow_once" }],
        },
        20,
      ),
      at({ type: "permission_resolved", requestId: "rq-1", outcome: { optionId: "allow" } }, 900),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }, 300),
      at({ type: "unknown", sessionUpdate: "goal_update" }, 5),
      agentSaid("Pronto.", "a-2"),
      at({ type: "turn_end", stopReason: "end_turn" }, 10),
    ];
  }

  it("produces the same state either way", () => {
    // The promise the whole design rests on. `replayConversation` exists so the
    // client has one entry point for it, and this is what proves it is not a
    // second implementation that drifted.
    const entries = conversation();

    const live = feed(emptyConversation(), ...entries);
    const replayed = replayConversation(entries);

    expect(replayed).toEqual(live);
  });

  it("produces the same state when replayed in one go after a partial live read", () => {
    // The real sequence on reconnect: some events were seen live, the socket
    // dropped, and the transcript arrives whole. The second state must not carry
    // anything from the first.
    const entries = conversation();
    const partial = feed(emptyConversation(), ...entries.slice(0, 4));

    const afterReattach = replayConversation(entries);

    expect(afterReattach).toEqual(replayConversation(entries));
    expect(afterReattach).not.toEqual(partial);
  });

  it("is not fooled by an empty transcript", () => {
    expect(replayConversation([])).toEqual(emptyConversation());
  });
});
