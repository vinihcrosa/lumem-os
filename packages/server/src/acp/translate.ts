import type {
  AcpCommand,
  AcpEvent,
  AcpPlanEntry,
  AcpRateLimit,
  AcpPlanStatus,
  AcpToolContent,
  AcpToolKind,
  AcpToolStatus,
} from "@lumem/shared";

/**
 * Translates ACP's `session/update` into the events the browser reads.
 *
 * This is the whole reason `acp-protocol.ts` is not a passthrough. Everything
 * ACP-shaped stops here: `_meta`, optional fields, ACP's own status names, and
 * variants this version of Lumem does not render. The client downstream never
 * has to know which adapter version produced a frame.
 *
 * Three outcomes, and the difference between the last two matters:
 *
 * - **An event.** Recognised and renderable.
 * - **`null`.** Recognised, defined by the protocol, and not rendered yet — a
 *   plan, a usage update, an image. Silently ignored, because telling the user
 *   "unrecognised event" about something the prototype already draws would send
 *   them debugging a non-problem.
 * - **`unknown`.** Not recognised at all. Visible in grey, logged by the daemon.
 *   The protocol evolves and v2 is a draft, so this is the normal fate of a
 *   field that did not exist when this file was written.
 */

/** ACP's four statuses, mapped onto ours. */
const TOOL_STATUS: Record<string, AcpToolStatus> = {
  pending: "pending",
  in_progress: "running",
  completed: "ok",
  failed: "failed",
};

/**
 * `cancelled` is deliberately absent above.
 *
 * It has no ACP counterpart (A14): it is derived when a turn ends as cancelled
 * while a call is still open, and that happens in `AcpManager`, which is the
 * only thing that sees a turn end. Two sources for one state would mean two
 * places to fix when the rule changes.
 */

const TOOL_KINDS: readonly AcpToolKind[] = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
];

export interface TranslateContext {
  /**
   * Message id to use when the agent sends none.
   *
   * ACP makes `messageId` optional, and reads its absence as "every chunk
   * belongs to the same message". One id per turn is what preserves that;
   * inventing one per chunk would render a paragraph per token.
   */
  fallbackMessageId: string;
}

/** Reads a `ContentBlock`, keeping only what a conversation can show today. */
function textOf(content: unknown): string | null {
  if (!isRecord(content)) return null;
  return content["type"] === "text" && typeof content["text"] === "string"
    ? content["text"]
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toolKind(raw: unknown): AcpToolKind {
  // An unrecognised kind degrades to `other` rather than rejecting the call: it
  // drives a glyph and nothing else, and losing a whole card over an icon would
  // be the worse trade.
  return TOOL_KINDS.includes(raw as AcpToolKind) ? (raw as AcpToolKind) : "other";
}

function toolContent(raw: unknown): AcpToolContent[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const items: AcpToolContent[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;

    if (item["type"] === "content") {
      const text = textOf(item["content"]);
      if (text !== null) items.push({ type: "content", text });
      continue;
    }
    if (item["type"] === "diff" && typeof item["path"] === "string") {
      items.push({
        type: "diff",
        path: item["path"],
        // Absent means the file is being created, and `null` says that where
        // `undefined` would just look like a field nobody filled in.
        oldText: typeof item["oldText"] === "string" ? item["oldText"] : null,
        newText: typeof item["newText"] === "string" ? item["newText"] : "",
      });
      continue;
    }
    if (item["type"] === "terminal" && typeof item["terminalId"] === "string") {
      items.push({ type: "terminal", terminalId: item["terminalId"] });
    }
  }
  return items;
}

function toolLocations(raw: unknown): { path: string; line?: number | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) =>
    isRecord(item) && typeof item["path"] === "string"
      ? [{ path: item["path"], line: typeof item["line"] === "number" ? item["line"] : null }]
      : [],
  );
}

function unknown(sessionUpdate: string): AcpEvent {
  return { type: "unknown", sessionUpdate };
}

/**
 * Variants the protocol defines and this phase does not render.
 *
 * Listed by name rather than caught by a default branch, so that adding one to
 * the UI means deleting a line here — and so a variant that appears in a future
 * adapter still reaches the user as `unknown` instead of vanishing.
 */
const IGNORED = new Set([
  /*
   * Handled elsewhere, or nowhere.
   *
   * The two `*_update` config variants are absorbed by `AcpManager` before reaching
   * here, because they are partial and merging them needs the session's state —
   * they stay listed so that a path which does reach this function treats them as
   * known rather than reporting them in grey.
   *
   * `session_info_update` is the only one with no home planned at all: it reports a
   * session title, and nothing in the design shows one.
   */
  "current_mode_update",
  "config_option_update",
  "session_info_update",
]);

/**
 * Every `sessionUpdate` name this daemon recognises — rendered or ignored.
 *
 * One list, because two would drift: `unknown-updates.ts` needs exactly the same
 * answer to decide what the pinned SDK would choke on, and a variant that is in
 * one list and not the other is either dropped silently or reported twice.
 */
export const KNOWN_SESSION_UPDATES: ReadonlySet<string> = new Set([
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "plan_update",
  "plan_removed",
  "usage_update",
  "available_commands_update",
  ...IGNORED,
]);

export function translateSessionUpdate(
  update: unknown,
  { fallbackMessageId }: TranslateContext,
): AcpEvent | null {
  if (!isRecord(update)) return unknown("<missing>");

  const kind = update["sessionUpdate"];
  if (typeof kind !== "string") return unknown("<missing>");
  if (IGNORED.has(kind)) return null;

  switch (kind) {
    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      const text = textOf(update["content"]);
      if (text === null) return null;

      const messageId =
        typeof update["messageId"] === "string" ? update["messageId"] : fallbackMessageId;

      if (kind === "agent_thought_chunk") return { type: "thought", messageId, text };
      return {
        type: "message",
        messageId,
        role: kind === "user_message_chunk" ? "user" : "agent",
        text,
      };
    }

    case "tool_call": {
      const toolCallId = update["toolCallId"];
      const title = update["title"];
      if (typeof toolCallId !== "string" || typeof title !== "string") {
        return unknown("tool_call:malformed");
      }

      // A new call always has a state, so the absent case resolves to `pending`
      // here rather than staying open like it does on an update.
      const mapped = mapStatus(update["status"], "pending");
      if (mapped === null || mapped === undefined) {
        return unknown(`tool_call:status=${String(update["status"])}`);
      }
      const status: AcpToolStatus = mapped;

      return {
        type: "tool_call",
        toolCallId,
        title,
        name: typeof update["name"] === "string" ? update["name"] : null,
        kind: toolKind(update["kind"]),
        status,
        locations: toolLocations(update["locations"]),
      };
    }

    case "tool_call_update": {
      const toolCallId = update["toolCallId"];
      if (typeof toolCallId !== "string") return unknown("tool_call_update:malformed");

      const status = mapStatus(update["status"], undefined);
      if (status === null) {
        return unknown(`tool_call_update:status=${String(update["status"])}`);
      }

      // Only what moved. Filling in the rest would overwrite a title the client
      // already holds with a blank — the adapter sends deltas, not snapshots.
      const event: Extract<AcpEvent, { type: "tool_call_update" }> = {
        type: "tool_call_update",
        toolCallId,
      };
      if (status !== undefined) event.status = status;
      if (typeof update["title"] === "string") event.title = update["title"];
      const content = toolContent(update["content"]);
      if (content !== undefined) event.content = content;
      if (Array.isArray(update["locations"])) {
        event.locations = toolLocations(update["locations"]);
      }
      return event;
    }

    case "plan":
    case "plan_update": {
      /*
       * Both spellings, one event.
       *
       * The protocol has `plan` and `plan_update`, and the adapter has been seen
       * to send either — but both carry the *whole* plan, not a delta, so telling
       * them apart downstream would be a distinction with no consequence. The
       * client keeps one card and rewrites it either way.
       */
      const entries = planEntries(update["entries"]);
      if (entries === null) return unknown(`${kind}:malformed`);
      return { type: "plan", entries };
    }

    case "plan_removed":
      return { type: "plan_removed" };

    case "available_commands_update": {
      const commands = commandsOf(update["availableCommands"]);
      if (commands === null) return unknown("available_commands_update:malformed");
      return { type: "commands", commands };
    }

    case "usage_update": {
      const used = update["used"];
      const size = update["size"];
      // A window of zero is not a window: everything downstream divides by it.
      if (typeof used !== "number" || typeof size !== "number" || size <= 0) {
        return unknown("usage_update:malformed");
      }

      return {
        type: "usage",
        used: Math.max(0, Math.round(used)),
        size: Math.round(size),
        cost: costOf(update["cost"]),
        rateLimit: rateLimitOf(update["_meta"]),
      };
    }

    default:
      return unknown(kind);
  }
}

/**
 * The slash commands the agent offers, or null when the payload is not a list.
 *
 * A command missing its name is skipped rather than dropping the list: unlike a
 * plan, the menu is a set of independent entries, and losing every command because
 * one arrived malformed would take away a feature over a typo.
 *
 * `takesInput` decides whether choosing the command leaves the caret waiting. ACP
 * models it as an `input` object; whether it is present is the only part the menu
 * needs.
 */
function commandsOf(raw: unknown): AcpCommand[] | null {
  if (!Array.isArray(raw)) return null;

  return raw.flatMap((item) => {
    if (!isRecord(item) || typeof item["name"] !== "string") return [];
    return [
      {
        name: item["name"],
        description: typeof item["description"] === "string" ? item["description"] : "",
        takesInput: isRecord(item["input"]),
      },
    ];
  });
}

/**
 * What the turn cost, when the agent says.
 *
 * Null rather than zero when it does not. An agent that reports no money must not
 * be made to look like one that charged nothing — the footer shows a dash, and a
 * dash is the honest answer.
 */
function costOf(raw: unknown): { amount: number; currency: string } | null {
  if (!isRecord(raw)) return null;
  const amount = raw["amount"];
  const currency = raw["currency"];
  if (typeof amount !== "number" || typeof currency !== "string") return null;
  return { amount, currency };
}

/**
 * The subscription's own limit, from `_meta._claude/rateLimit`.
 *
 * A Claude extension, read defensively for exactly that reason: another agent
 * will not send it, and a future version of this one may change its shape. A
 * missing or malformed block means "no information about the limit", which is a
 * state the footer already has to render — not a reason to lose a usage report
 * that is otherwise perfectly good.
 *
 * `isUsingOverage` turning true is what the PRD calls the detector that arrives
 * before the invoice, so it is the one field this refuses to guess: absent means
 * absent, and the whole block is dropped rather than defaulted to `false`.
 */
function rateLimitOf(meta: unknown): AcpRateLimit | null {
  if (!isRecord(meta)) return null;
  const raw = meta["_claude/rateLimit"];
  if (!isRecord(raw)) return null;

  const utilization = raw["utilization"];
  const isUsingOverage = raw["isUsingOverage"];
  if (typeof utilization !== "number" || typeof isUsingOverage !== "boolean") return null;

  return {
    utilization,
    isUsingOverage,
    surpassedThreshold:
      typeof raw["surpassedThreshold"] === "number" ? raw["surpassedThreshold"] : null,
    resetsAt: typeof raw["resetsAt"] === "number" ? Math.round(raw["resetsAt"]) : null,
    kind: typeof raw["rateLimitType"] === "string" ? raw["rateLimitType"] : null,
  };
}

const PLAN_STATUSES: readonly AcpPlanStatus[] = ["pending", "in_progress", "completed"];

/**
 * The plan's steps, or null when the payload is not a plan at all.
 *
 * A step with an unrecognised status drops the whole plan rather than being
 * guessed at: a plan is read as a sequence, and one step silently downgraded to
 * `pending` would misreport progress in the one place that exists to report it.
 * An empty list is a legitimate plan — the agent announcing it has one before
 * filling it in.
 */
function planEntries(raw: unknown): AcpPlanEntry[] | null {
  if (!Array.isArray(raw)) return null;

  const entries: AcpPlanEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const content = item["content"];
    const status = item["status"];
    if (typeof content !== "string") return null;
    if (!PLAN_STATUSES.includes(status as AcpPlanStatus)) return null;

    entries.push({
      content,
      status: status as AcpPlanStatus,
      priority: isPriority(item["priority"]) ? item["priority"] : null,
    });
  }
  return entries;
}

function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

/**
 * `undefined` when the field is absent, `null` when it is present and unknown.
 *
 * The distinction is the point: an absent status on an update means "nothing
 * changed here", while a status nobody defined means the daemon must not guess.
 * Guessing `failed` paints a red card over something that may have succeeded,
 * and guessing `ok` is worse.
 */
function mapStatus(
  raw: unknown,
  fallback: AcpToolStatus | undefined,
): AcpToolStatus | undefined | null {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") return null;
  return TOOL_STATUS[raw] ?? null;
}
