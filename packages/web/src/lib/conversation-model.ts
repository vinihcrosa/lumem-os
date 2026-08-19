import type {
  AcpCommand,
  AcpConfigOption,
  AcpEvent,
  AcpPlanEntry,
  AcpRateLimit,
  AcpPermissionOption,
  AcpStopReason,
  AcpToolContent,
  AcpToolKind,
  AcpToolLocation,
  AcpToolStatus,
  AcpTranscriptEntry,
} from "@lumem/shared";

/**
 * The conversation as data, before any of it is a component.
 *
 * A pure fold over the event stream. Pure is not a style choice here: it is what
 * makes "reopening a tab shows what the open tab showed" a property a test can
 * state. The moment this reads a clock, or mutates, or asks the network
 * anything, replaying a transcript stops reproducing the live stream — and the
 * two would differ in ways that both look plausible on screen.
 *
 * Everything time-related therefore comes from the daemon's stamp on each entry.
 * Everything derived — elapsed time, added and removed lines — is computed from
 * what is already in the stream rather than transmitted twice, because a second
 * source for one number is a second thing that can disagree.
 */

export interface ToolCallView {
  toolCallId: string;
  title: string;
  /** `Edit`, `Bash`. Absent on adapters that omit it. */
  name: string | null;
  kind: AcpToolKind;
  status: AcpToolStatus;
  locations: readonly AcpToolLocation[];
  content: readonly AcpToolContent[];
  /** Wall time between the call and its last update, from the daemon's clock. */
  elapsedMs: number | null;
  /** Lines the diffs on this call added and removed, or null when it made none. */
  added: number | null;
  removed: number | null;
  /**
   * What the user answered, when this call needed asking.
   *
   * Null both when nothing was ever asked and when the agent withdrew its own
   * request: `cancelled` is the agent giving up, and recording it as a verdict
   * would put words in the user's mouth.
   */
  verdict: AcpPermissionOption | null;
  /** Kept so a later update can measure against it. */
  readonly startedAt: number;
}

export interface PendingPermission {
  requestId: string;
  toolCallId: string;
  title: string;
  command: string | null;
  cwd: string;
  options: readonly AcpPermissionOption[];
}

export type Block =
  | { kind: "message"; messageId: string; text: string }
  | { kind: "thought"; messageId: string; text: string }
  | { kind: "tool"; call: ToolCallView }
  | { kind: "permission"; request: PendingPermission }
  /** Something the client received and could not name. Grey, in place. */
  | { kind: "note"; text: string };

export interface Turn {
  /**
   * Who is speaking, or `resumed` for the mark between two conversations.
   *
   * The separator is a turn rather than a block because it belongs *between* turns:
   * the prototype draws it as a full-width rule, and a block would sit inside a
   * speaker's frame, indented under their gutter as though someone had said it.
   */
  role: "user" | "agent" | "resumed";
  blocks: Block[];
  /** When it happened, on the resume mark only. The client formats it. */
  at?: number;
  /** The session that ended, on the resume mark only. */
  fromSessionId?: string;
}

/** A terminal the agent asked for, and the PTY session behind it (D7). */
export interface TerminalView {
  terminalId: string;
  /** What the embedded `xterm` attaches to, via the endpoint that already exists. */
  ptySessionId: string;
  command: string;
}

/** What the turn cost, and what the subscription's limit is doing (F2.7). */
export interface UsageView {
  used: number;
  size: number;
  cost: { amount: number; currency: string } | null;
  rateLimit: AcpRateLimit | null;
  /** Everything the session has spent, not just this turn. */
  totalCost: number;
  currency: string | null;
}

export interface ConversationState {
  turns: Turn[];
  /**
   * The ask the agent is blocked on, or null.
   *
   * Held at the top as well as in a block because two different parts of the
   * screen need it: the block renders in place, and the composer has to know it
   * is disabled and say why.
   */
  pendingPermission: PendingPermission | null;
  /** A turn is in flight. Derived from events alone, so replay agrees. */
  streaming: boolean;
  lastStopReason: AcpStopReason | null;
  /**
   * Updates about things this client never saw.
   *
   * Counted rather than ignored silently: it is not a reason to break the tab,
   * and it is also not normal. A number that climbs is the symptom of a stream
   * that lost its beginning.
   */
  orphanUpdates: number;
  /**
   * The plan, or null when there is none.
   *
   * One plan per conversation, replaced wholesale: the agent reissues it entire on
   * every change, and keeping a history of near-identical versions would fill the
   * screen with copies of one thing.
   */
  plan: readonly AcpPlanEntry[] | null;
  /** The newest usage report. Null until the agent sends one. */
  usage: UsageView | null;
  /** The selectors, and which mode is current (F2.6). */
  mode: string;
  configOptions: readonly AcpConfigOption[];
  /** What `/` offers (F2.8). Empty when the agent offers nothing. */
  commands: readonly AcpCommand[];
  /** Terminals the agent opened, newest last, keyed by the id it used. */
  terminals: readonly TerminalView[];
}

export function emptyConversation(): ConversationState {
  return {
    turns: [],
    pendingPermission: null,
    streaming: false,
    lastStopReason: null,
    orphanUpdates: 0,
    plan: null,
    usage: null,
    mode: "",
    configOptions: [],
    commands: [],
    terminals: [],
  };
}

/**
 * Folds a whole transcript, from nothing.
 *
 * One entry point rather than letting each caller write the same `reduce`: the
 * replay path and the live path have to agree exactly, and the cheapest way to
 * guarantee that is for replay to be the live reducer run in a loop.
 */
export function replayConversation(entries: readonly AcpTranscriptEntry[]): ConversationState {
  return entries.reduce(reduceConversation, emptyConversation());
}

export function reduceConversation(
  state: ConversationState,
  { at, event }: AcpTranscriptEntry,
): ConversationState {
  switch (event.type) {
    case "message":
      return appendText(state, event.role, {
        kind: "message",
        messageId: event.messageId,
        text: event.text,
      });

    case "thought":
      return appendText(state, "agent", {
        kind: "thought",
        messageId: event.messageId,
        text: event.text,
      });

    case "tool_call":
      return appendBlock(state, "agent", {
        kind: "tool",
        call: {
          toolCallId: event.toolCallId,
          title: event.title,
          name: event.name ?? null,
          kind: event.kind,
          status: event.status,
          locations: event.locations,
          content: [],
          elapsedMs: null,
          added: null,
          removed: null,
          verdict: null,
          startedAt: at,
        },
      });

    case "tool_call_update":
      return updateCall(state, event.toolCallId, (call) => ({
        ...call,
        ...(event.status ? { status: event.status } : {}),
        // Only what moved. The adapter sends deltas, and overwriting a title it
        // did not mention would erase what the user is reading.
        ...(event.title ? { title: event.title } : {}),
        ...(event.locations ? { locations: event.locations } : {}),
        ...(event.content ? withDiffCounts(call, event.content) : {}),
        elapsedMs: at - call.startedAt,
      }));

    case "permission_request": {
      const request: PendingPermission = {
        requestId: event.requestId,
        toolCallId: event.toolCallId,
        title: event.title,
        command: event.command ?? null,
        cwd: event.cwd,
        options: event.options,
      };
      // Only the newest ask is shown: the agent blocks on one at a time, so a
      // second one means the first is gone. Offering both would be a choice
      // about nothing.
      const withoutPrevious = mapTurns(state.turns, (block) =>
        block.kind === "permission" ? null : block,
      );
      return appendBlock(
        { ...state, turns: withoutPrevious, pendingPermission: request },
        "agent",
        { kind: "permission", request },
      );
    }

    case "permission_resolved": {
      const pending = findPermission(state.turns, event.requestId);
      if (!pending) return { ...state, orphanUpdates: state.orphanUpdates + 1 };

      // Read out of the union before the closure: narrowing does not survive
      // being used inside the callback `find` takes.
      const chosenId = event.outcome === "cancelled" ? null : event.outcome.optionId;
      const chosen =
        chosenId === null
          ? null
          : (pending.options.find((option) => option.optionId === chosenId) ?? null);

      // The answered ask stops being separate history and becomes the verdict on
      // the card it was about — the prototype's rule, and the reason a resolved
      // request leaves no block behind.
      const turns = mapTurns(state.turns, (block) =>
        block.kind === "permission" && block.request.requestId === event.requestId ? null : block,
      );

      const next: ConversationState = {
        ...state,
        turns,
        pendingPermission:
          state.pendingPermission?.requestId === event.requestId ? null : state.pendingPermission,
      };
      return chosen ? updateCall(next, pending.toolCallId, (call) => ({ ...call, verdict: chosen })) : next;
    }

    case "plan":
      // Replaced, not merged. The agent sends the whole plan every time.
      return { ...state, plan: event.entries };

    case "plan_removed":
      // Distinct from an empty plan, which is a plan with no steps yet.
      return { ...state, plan: null };

    case "usage": {
      const amount = event.cost?.amount ?? 0;
      return {
        ...state,
        usage: {
          used: event.used,
          size: event.size,
          cost: event.cost ?? null,
          rateLimit: event.rateLimit ?? null,
          // Accumulated here because no single event carries it, and the sum has
          // to survive a replay: adding it up as events arrive is what makes the
          // total the same whether it was watched live or rebuilt.
          totalCost: (state.usage?.totalCost ?? 0) + amount,
          currency: event.cost?.currency ?? state.usage?.currency ?? null,
        },
      };
    }

    case "config":
      return { ...state, mode: event.mode, configOptions: event.options };

    case "commands":
      return { ...state, commands: event.commands };

    case "terminal": {
      // Keyed by the agent's own id: `terminal/create` can be answered twice for
      // one card if the agent retries, and two entries would mount two `xterm`s
      // against the same PTY.
      const without = state.terminals.filter(
        (terminal) => terminal.terminalId !== event.terminalId,
      );
      return {
        ...state,
        terminals: [
          ...without,
          {
            terminalId: event.terminalId,
            ptySessionId: event.ptySessionId,
            command: event.command,
          },
        ],
      };
    }

    case "turn_end":
      return { ...state, streaming: false, lastStopReason: event.stopReason };

    case "resumed":
      /*
       * Always its own turn, never appended to the last one.
       *
       * `appendBlock` would merge it into whatever the agent was saying, and the mark
       * has to sit between the two conversations rather than inside the older one. It
       * also resets nothing else: the plan, the usage and the selectors carried over
       * with the history, and blanking them would make a resumed session look like it
       * had never spent anything.
       */
      return {
        ...state,
        turns: [
          ...state.turns,
          { role: "resumed", blocks: [], at, fromSessionId: event.fromSessionId },
        ],
      };

    case "unknown":
      return appendBlock(state, "agent", {
        kind: "note",
        text: `evento não reconhecido: ${event.sessionUpdate}`,
      });
  }
}

// --------------------------------------------------------------------- helpers

/**
 * Appends to the block already open, or opens one.
 *
 * The merge is keyed on `messageId` because that is what the protocol says a
 * message is: chunks sharing an id are one message, and a change of id means a
 * new one started. Merging by position instead would glue two answers together
 * the moment the agent sent them back to back.
 */
function appendText(
  state: ConversationState,
  role: "user" | "agent",
  incoming: Extract<Block, { kind: "message" | "thought" }>,
): ConversationState {
  const streaming = role === "user" ? true : state.streaming;
  const turns = [...state.turns];
  const last = turns.at(-1);

  if (last?.role === role) {
    const blocks = [...last.blocks];
    const open = blocks.at(-1);
    if (open?.kind === incoming.kind && open.messageId === incoming.messageId) {
      blocks[blocks.length - 1] = { ...open, text: open.text + incoming.text };
    } else {
      blocks.push(incoming);
    }
    turns[turns.length - 1] = { ...last, blocks };
    return { ...state, turns, streaming };
  }

  turns.push({ role, blocks: [incoming] });
  return { ...state, turns, streaming };
}

function appendBlock(
  state: ConversationState,
  role: "user" | "agent",
  block: Block,
): ConversationState {
  const turns = [...state.turns];
  const last = turns.at(-1);

  if (last?.role === role) {
    turns[turns.length - 1] = { ...last, blocks: [...last.blocks, block] };
  } else {
    turns.push({ role, blocks: [block] });
  }
  return { ...state, turns };
}

/**
 * Finds a card anywhere and rewrites it.
 *
 * Anywhere, not in the newest turn: a long call can finish after the agent has
 * moved on and the user has asked something else, and looking only at the end
 * would silently drop its result.
 */
function updateCall(
  state: ConversationState,
  toolCallId: string,
  change: (call: ToolCallView) => ToolCallView,
): ConversationState {
  let found = false;

  const turns = state.turns.map((turn) => ({
    ...turn,
    blocks: turn.blocks.map((block) => {
      if (block.kind !== "tool" || block.call.toolCallId !== toolCallId) return block;
      found = true;
      return { ...block, call: change(block.call) };
    }),
  }));

  if (!found) return { ...state, orphanUpdates: state.orphanUpdates + 1 };
  return { ...state, turns };
}

/** Rewrites or drops every block. Returning null removes it. */
function mapTurns(turns: readonly Turn[], change: (block: Block) => Block | null): Turn[] {
  return turns.map((turn) => ({
    ...turn,
    blocks: turn.blocks.flatMap((block) => {
      const next = change(block);
      return next ? [next] : [];
    }),
  }));
}

function findPermission(turns: readonly Turn[], requestId: string): PendingPermission | null {
  for (const turn of turns) {
    for (const block of turn.blocks) {
      if (block.kind === "permission" && block.request.requestId === requestId) {
        return block.request;
      }
    }
  }
  return null;
}

/**
 * Line counts for the diffs a call produced.
 *
 * Counted from the diff the stream already carried, rather than sent alongside
 * it. A trailing newline is not a line: `"a\nb\n"` is two lines, and counting
 * the empty string after the last break would report three on every file that
 * ends properly.
 */
function withDiffCounts(
  call: ToolCallView,
  content: readonly AcpToolContent[],
): Pick<ToolCallView, "content" | "added" | "removed"> {
  let added = 0;
  let removed = 0;
  let sawDiff = false;

  for (const item of content) {
    if (item.type !== "diff") continue;
    sawDiff = true;
    const before = lines(item.oldText ?? "");
    const after = lines(item.newText);
    const common = commonLines(before, after);
    added += after.length - common;
    removed += before.length - common;
  }

  return {
    content,
    added: sawDiff ? added : call.added,
    removed: sawDiff ? removed : call.removed,
  };
}

function lines(text: string): string[] {
  if (text === "") return [];
  const split = text.split("\n");
  // A file that ends with a newline has no empty last line.
  if (split.at(-1) === "") split.pop();
  return split;
}

/**
 * How many lines survived unchanged, counted by multiset.
 *
 * Not a real diff: this is a badge on a card, not a patch view. What it has to
 * get right is that moving a line does not read as one added and one removed,
 * which position-wise comparison would report.
 */
function commonLines(before: readonly string[], after: readonly string[]): number {
  const remaining = new Map<string, number>();
  for (const line of before) remaining.set(line, (remaining.get(line) ?? 0) + 1);

  let common = 0;
  for (const line of after) {
    const left = remaining.get(line) ?? 0;
    if (left > 0) {
      remaining.set(line, left - 1);
      common += 1;
    }
  }
  return common;
}
