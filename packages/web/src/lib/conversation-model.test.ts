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
    policyReason: null,
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
      at({
        type: "permission_resolved",
        requestId: "rq-1",
        outcome: { optionId: "allow" },
        by: "user",
        reason: null,
      }),
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
      at({
        type: "permission_resolved",
        requestId: "rq-1",
        outcome: "cancelled",
        by: "user",
        reason: null,
      }),
    );

    expect(state.pendingPermission).toBeNull();
    expect(state.turns[0]?.blocks[0]).toMatchObject({ call: { verdict: null } });
  });

  it("keeps a resolution for a request it never saw from getting lost", () => {
    const state = from(
      at({
        type: "permission_resolved",
        requestId: "rq-nada",
        outcome: { optionId: "allow" },
        by: "user",
        reason: null,
      }),
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
          policyReason: null,
          requestId: "rq-1",
          toolCallId: "tc-1",
          title: "Bash",
          command: "rm -rf .vite",
          cwd: "/repo",
          options: [{ optionId: "allow", name: "permitir", kind: "allow_once" }],
        },
        20,
      ),
      at({
        type: "permission_resolved",
        requestId: "rq-1",
        outcome: { optionId: "allow" },
        by: "user",
        reason: null,
      }, 900),
      at({ type: "tool_call_update", toolCallId: "tc-1", status: "ok" }, 300),
      at({ type: "unknown", sessionUpdate: "goal_update" }, 5),
      agentSaid("Pronto.", "a-2"),
      at({ type: "turn_end", stopReason: "end_turn" }, 10),
      // The resume is part of the stream, so it is part of what has to agree: a
      // separator that only appeared live would be missing from every replay.
      at({ type: "resumed", fromSessionId: "sessao-de-ontem" }, 40_000),
      userSaid("e agora apaga o legado"),
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

describe("what phase 4 carries", () => {
  it("keeps one plan, replaced whole", () => {
    // The agent reissues the entire plan on every change. Merging would need a
    // key the protocol does not give, and a history would fill the screen with
    // copies of one thing.
    const state = from(
      at({ type: "plan", entries: [{ content: "ler", status: "in_progress" }] }),
      at({
        type: "plan",
        entries: [
          { content: "ler", status: "completed" },
          { content: "extrair", status: "in_progress" },
        ],
      }),
    );

    expect(state.plan).toEqual([
      { content: "ler", status: "completed" },
      { content: "extrair", status: "in_progress" },
    ]);
  });

  it("tells an empty plan apart from no plan", () => {
    // An empty plan is a plan with no steps yet; `plan_removed` is the agent
    // withdrawing it. Collapsing the two would make a card flicker away and back.
    expect(from(at({ type: "plan", entries: [] })).plan).toEqual([]);
    expect(
      from(at({ type: "plan", entries: [] }), at({ type: "plan_removed" })).plan,
    ).toBeNull();
  });

  it("keeps the newest usage report", () => {
    const state = from(
      at({ type: "usage", used: 100, size: 1_000_000 }),
      at({ type: "usage", used: 39_200, size: 1_000_000 }),
    );

    expect(state.usage).toMatchObject({ used: 39_200, size: 1_000_000 });
  });

  it("adds cost up as it arrives, so a replay reaches the same total", () => {
    // No event carries the session total, and deriving it at render time from a
    // single report would show the last turn's cost as the session's.
    const state = from(
      at({ type: "usage", used: 10, size: 1_000, cost: { amount: 0.25, currency: "USD" } }),
      at({ type: "usage", used: 20, size: 1_000, cost: { amount: 0.5, currency: "USD" } }),
    );

    expect(state.usage?.totalCost).toBeCloseTo(0.75);
    expect(state.usage?.currency).toBe("USD");
  });

  it("does not invent a cost for an agent that reports none", () => {
    const state = from(at({ type: "usage", used: 10, size: 1_000 }));

    expect(state.usage?.cost).toBeNull();
    expect(state.usage?.totalCost).toBe(0);
    expect(state.usage?.currency).toBeNull();
  });

  it("remembers a currency a later report left out", () => {
    // The agent reports money once and then stops mentioning it. Forgetting the
    // currency would leave a number with no unit.
    const state = from(
      at({ type: "usage", used: 10, size: 1_000, cost: { amount: 1, currency: "USD" } }),
      at({ type: "usage", used: 20, size: 1_000 }),
    );

    expect(state.usage?.currency).toBe("USD");
  });

  it("carries what the subscription's limit is doing", () => {
    const state = from(
      at({
        type: "usage",
        used: 1,
        size: 1_000,
        rateLimit: { utilization: 0.94, surpassedThreshold: 0.75, isUsingOverage: false },
      }),
    );

    expect(state.usage?.rateLimit).toMatchObject({ utilization: 0.94, isUsingOverage: false });
  });

  it("keeps the selectors and which mode is current", () => {
    const state = from(
      at({
        type: "config",
        modeOwner: "agent",
        lumemMode: "ask",
        lumemModeDefault: "ask",
        mode: "plan",
        options: [
          {
            id: "model",
            name: "Model",
            currentValue: "sonnet",
            choices: [{ value: "sonnet", name: "sonnet" }],
          },
        ],
      }),
    );

    expect(state.mode).toBe("plan");
    expect(state.configOptions).toHaveLength(1);
  });

  it("keeps the commands the agent offers, and an empty list as empty", () => {
    const withCommands = from(
      at({
        type: "commands",
        commands: [{ name: "gate", description: "roda o gate", takesInput: false }],
      }),
    );
    expect(withCommands.commands).toHaveLength(1);

    expect(from(at({ type: "commands", commands: [] })).commands).toEqual([]);
  });

  it("records a terminal once, however many times it is announced", () => {
    // `terminal/create` can be answered twice for one card if the agent retries,
    // and two entries would mount two xterms against the same PTY.
    const state = from(
      at({ type: "terminal", terminalId: "t-1", ptySessionId: "se_a", command: "pnpm test" }),
      at({ type: "terminal", terminalId: "t-1", ptySessionId: "se_b", command: "pnpm test" }),
    );

    expect(state.terminals).toEqual([
      { terminalId: "t-1", ptySessionId: "se_b", command: "pnpm test" },
    ]);
  });

  it("keeps several terminals in the order they were opened", () => {
    const state = from(
      at({ type: "terminal", terminalId: "t-1", ptySessionId: "se_a", command: "um" }),
      at({ type: "terminal", terminalId: "t-2", ptySessionId: "se_b", command: "dois" }),
    );

    expect(state.terminals.map((terminal) => terminal.terminalId)).toEqual(["t-1", "t-2"]);
  });

  it("still agrees between replay and live stream", () => {
    // The property the whole design rests on, re-checked with the new fields:
    // an accumulated total is exactly the kind of thing that drifts.
    clock = 1_700_000_000_000;
    const entries = [
      at({
        type: "config",
        mode: "auto",
        options: [],
        modeOwner: "agent",
        lumemMode: "ask",
        lumemModeDefault: "ask",
      }),
      at({ type: "plan", entries: [{ content: "um", status: "in_progress" }] }, 10),
      at({ type: "usage", used: 10, size: 1_000, cost: { amount: 0.5, currency: "USD" } }, 10),
      at({ type: "terminal", terminalId: "t-1", ptySessionId: "se_a", command: "ls" }, 5),
      at({ type: "usage", used: 20, size: 1_000, cost: { amount: 0.25, currency: "USD" } }, 5),
      at({ type: "turn_end", stopReason: "end_turn" }, 5),
    ];

    expect(replayConversation(entries)).toEqual(feed(emptyConversation(), ...entries));
  });
});

describe("the conversation was picked up again", () => {
  it("marks the resume as a turn of its own", () => {
    // Not a block: `appendBlock` would fold it into whatever the agent was saying, and
    // the mark belongs *between* the two conversations rather than inside the older
    // one.
    const state = feed(
      emptyConversation(),
      agentSaid("de ontem", "a-1"),
      at({ type: "resumed", fromSessionId: "sessao-de-ontem" }, 40_000),
      agentSaid("de hoje", "a-2"),
    );

    expect(state.turns.map((turn) => turn.role)).toEqual(["agent", "resumed", "agent"]);
    expect(state.turns[1]).toMatchObject({ blocks: [], fromSessionId: "sessao-de-ontem" });
  });

  it("carries the daemon's stamp, so the client formats a time it did not invent", () => {
    // The reducer reads no clock; if it did, replaying a transcript would stop
    // reproducing the live stream.
    clock = 1_700_000_000_000;
    const state = feed(emptyConversation(), at({ type: "resumed", fromSessionId: "antiga" }, 500));

    expect(state.turns[0]?.at).toBe(1_700_000_000_500);
  });

  it("keeps what the history already established", () => {
    /*
     * The plan and the usage were copied forward with the transcript (D15), and a
     * resume that blanked them would make a continued conversation look like one that
     * had never spent anything.
     */
    const state = feed(
      emptyConversation(),
      at({ type: "plan", entries: [{ content: "ler o loader", status: "pending", priority: "high" }] }),
      at({ type: "usage", used: 1_000, size: 200_000, cost: { amount: 0.5, currency: "USD" } }),
      at({ type: "resumed", fromSessionId: "antiga" }, 10),
    );

    expect(state.plan).toHaveLength(1);
    expect(state.usage?.totalCost).toBe(0.5);
  });
});
describe("núcleo da memória", () => {
  it("aparece na conversa, com o que custou", () => {
    const state = feed(emptyConversation(), at({ type: "memory_core", entries: 3, chars: 1_240 }));

    // Injeção invisível é o que o PRD proíbe por nome: o número de diretrizes e
    // o custo em caracteres ficam na conversa, no lugar em que aconteceram.
    expect(state.turns).toHaveLength(1);
    const block = state.turns[0]?.blocks[0];
    expect(block?.kind).toBe("meta");
    expect(block?.kind === "meta" && block.text).toContain("3 diretrizes fixadas");
    expect(block?.kind === "meta" && block.text).toContain("1.240 caracteres");
  });

  it("uma diretriz é diretriz, não diretrizes", () => {
    const state = feed(emptyConversation(), at({ type: "memory_core", entries: 1, chars: 400 }));

    const block = state.turns[0]?.blocks[0];
    expect(block?.kind === "meta" && block.text).toContain("1 diretriz fixada");
  });

  it("é turno próprio: não cola no que o agente estava dizendo", () => {
    const state = feed(
      emptyConversation(),
      at({ type: "message", messageId: "m1", role: "agent", text: "oi" }),
      at({ type: "memory_core", entries: 1, chars: 400 }),
    );

    expect(state.turns).toHaveLength(2);
  });
});


/**
 * A linha de fecho do turno (`session-mode`, T9).
 *
 * Sete cartões numa transcrição longa se perdem; a linha de fecho não. Ela é a
 * resposta curta para *o que rodou sem eu ver*, e é o que torna o `automático`
 * auditável sem rolar a conversa inteira.
 */
describe("o fecho de turno da política", () => {
  const asked = (requestId: string): AcpEvent => ({
    type: "permission_request",
    requestId,
    policyReason: null,
    toolCallId: `tc-${requestId}`,
    title: "Read",
    command: null,
    cwd: "/repos/lorebase",
    options: [{ optionId: "allow", name: "uma vez", kind: "allow_once" }],
  });

  const answered = (requestId: string, by: "user" | "lumem"): AcpEvent => ({
    type: "permission_resolved",
    requestId,
    outcome: { optionId: "allow" },
    by,
    reason: by === "lumem" ? "Modo Automático" : null,
  });

  const metaTexts = (state: ReturnType<typeof replayConversation>): string[] =>
    state.turns.flatMap((turn) =>
      turn.blocks.flatMap((block) => (block.kind === "meta" ? [block.text] : [])),
    );

  it("conta o que passou sozinho e o que subiu", () => {
    const state = replayConversation([
      at({ type: "message", messageId: "m-1", role: "user", text: "vai" }),
      at(asked("a")),
      at(answered("a", "lumem")),
      at(asked("b")),
      at(answered("b", "lumem")),
      at(asked("c")),
      at(answered("c", "user")),
      at({ type: "turn_end", stopReason: "end_turn" }),
    ]);

    expect(metaTexts(state)).toEqual(["◈ 2 pedidos aprovados pelo Lumem, 1 subiu para você neste turno"]);
  });

  it("não escreve linha nenhuma quando nada passou sozinho", () => {
    // Contador zerado é ruído, e uma linha que aparece em todo turno deixa de ser
    // lida no terceiro.
    const state = replayConversation([
      at({ type: "message", messageId: "m-1", role: "user", text: "vai" }),
      at(asked("a")),
      at(answered("a", "user")),
      at({ type: "turn_end", stopReason: "end_turn" }),
    ]);

    expect(metaTexts(state)).toEqual([]);
  });

  it("some no turno seguinte, porque é fecho de turno e não histórico", () => {
    const state = replayConversation([
      at({ type: "message", messageId: "m-1", role: "user", text: "vai" }),
      at(asked("a")),
      at(answered("a", "lumem")),
      at({ type: "turn_end", stopReason: "end_turn" }),
      at({ type: "message", messageId: "m-2", role: "user", text: "de novo" }),
    ]);

    expect(metaTexts(state)).toEqual([]);
  });

  it("não apaga a marca d'água da memória junto", () => {
    /*
     * As duas únicas linhas `.meta` da conversa são esta e a do núcleo da
     * memória, e o PRD da memória exige que a segunda fique. Limpar por tipo de
     * bloco tiraria as duas.
     */
    const state = replayConversation([
      at({ type: "memory_core", entries: 3, chars: 1_200 }),
      at({ type: "message", messageId: "m-1", role: "user", text: "vai" }),
      at(asked("a")),
      at(answered("a", "lumem")),
      at({ type: "turn_end", stopReason: "end_turn" }),
      at({ type: "message", messageId: "m-2", role: "user", text: "de novo" }),
    ]);

    expect(metaTexts(state)).toEqual([
      "memória do workspace: 3 diretrizes fixadas · 1.200 caracteres neste turno",
    ]);
  });
});
