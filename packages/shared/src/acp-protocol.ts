import { z } from "zod";

/**
 * Wire protocol between the conversation in the browser and the daemon's ACP
 * endpoint.
 *
 * It lives in `shared` for the reason `pty-protocol.ts` does: a websocket frame
 * arrives as an opaque string, and the only place both ends can agree byte for
 * byte is here. Every message is validated on receipt rather than cast.
 *
 * **This is not the Agent Client Protocol.** ACP is what the daemon speaks to
 * the adapter over stdio; this is what the daemon speaks to the browser. The
 * daemon translates, once, at that boundary — so the browser never sees a raw
 * `session/update`, never sees `_meta`, and never has to know which adapter
 * version produced a frame. Three things follow from that, and they are the
 * whole reason the two protocols are not the same shape:
 *
 * - **Card state is our vocabulary, not ACP's.** See `acpToolStatusSchema`.
 * - **An unrecognised event is representable.** See the `unknown` variant.
 * - **Transport and conversation are separate layers.** `attached` and `error`
 *   are transport; everything the user reads is an `AcpEvent`, and the same
 *   event shapes are what `attached` replays. That is what lets the client
 *   prove replay and live streaming produce the same state.
 */

/** Path the daemon serves ACP websockets on. */
export const ACP_WS_PATH = "/acp";

/** Query parameter carrying the session id on attach. */
export const ACP_SESSION_PARAM = "session";

/**
 * Application close code for an attach to a session that does not exist.
 *
 * The same number the PTY endpoint uses, on purpose: it means the same thing,
 * and a client that learned to read one should not have to learn a second.
 */
export const ACP_CLOSE_SESSION_NOT_FOUND = 4404;

export const acpSessionStateSchema = z.enum(["running", "exited"]);
export type AcpSessionState = z.infer<typeof acpSessionStateSchema>;

/**
 * State of a tool call, in the Lumem vocabulary.
 *
 * ACP has four (`pending`, `in_progress`, `completed`, `failed`) and none of
 * them is `cancelled`. The mapping is the daemon's job:
 *
 * | ACP                          | here        |
 * |------------------------------|-------------|
 * | `pending`                    | `pending`   |
 * | `in_progress`                | `running`   |
 * | `completed`                  | `ok`        |
 * | `failed`                     | `failed`    |
 * | — (`stopReason: cancelled`)  | `cancelled` |
 *
 * The fifth state has no ACP counterpart: it is derived when a turn ends as
 * `cancelled` while a call is still `pending` or `running`. It exists because
 * interrupting is not failing — nothing broke, the user stopped — and a red
 * card teaches that pressing stop was a mistake.
 */
export const acpToolStatusSchema = z.enum(["pending", "running", "ok", "failed", "cancelled"]);
export type AcpToolStatus = z.infer<typeof acpToolStatusSchema>;

/**
 * Category of tool, passed through from ACP's `ToolKind`.
 *
 * Passed through rather than narrowed because it drives a glyph and nothing
 * else: an unknown category would degrade to a generic icon, whereas a
 * narrowed enum would reject the frame that carried it.
 */
export const acpToolKindSchema = z.enum([
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
]);
export type AcpToolKind = z.infer<typeof acpToolKindSchema>;

export const acpToolLocationSchema = z.object({
  /** Absolute path. The client is what decides how to shorten it. */
  path: z.string(),
  line: z.number().int().nullish(),
});
export type AcpToolLocation = z.infer<typeof acpToolLocationSchema>;

/**
 * What a tool call produced.
 *
 * `terminal` is carried but not rendered until the embedded terminal exists
 * (F3): a variant the wire refuses is a frame the daemon cannot forward, and
 * the agent would sit waiting on a call the client silently dropped.
 */
export const acpToolContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("content"), text: z.string() }),
  z.object({
    type: z.literal("diff"),
    path: z.string(),
    /** Absent for a file being created. */
    oldText: z.string().nullish(),
    newText: z.string(),
  }),
  z.object({ type: z.literal("terminal"), terminalId: z.string() }),
]);
export type AcpToolContent = z.infer<typeof acpToolContentSchema>;

export const acpPermissionOptionKindSchema = z.enum([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
]);
export type AcpPermissionOptionKind = z.infer<typeof acpPermissionOptionKindSchema>;

export const acpPermissionOptionSchema = z.object({
  optionId: z.string(),
  /** The agent's own label, shown verbatim (A13). */
  name: z.string(),
  kind: acpPermissionOptionKindSchema,
});
export type AcpPermissionOption = z.infer<typeof acpPermissionOptionSchema>;

/** Passed through from ACP's `StopReason`. */
export const acpStopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);
export type AcpStopReason = z.infer<typeof acpStopReasonSchema>;

/**
 * A step of the agent's plan (F2.5).
 *
 * Three statuses, and they are ACP's own — unlike the tool card, which needed a
 * fifth. A plan step has no equivalent of "you pressed stop": a cancelled turn
 * leaves its steps exactly where they were, which is the truth about them.
 */
export const acpPlanStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export type AcpPlanStatus = z.infer<typeof acpPlanStatusSchema>;

export const acpPlanEntrySchema = z.object({
  content: z.string(),
  status: acpPlanStatusSchema,
  /** Passed through. The client does not render it yet, and may never. */
  priority: z.enum(["high", "medium", "low"]).nullish(),
});
export type AcpPlanEntry = z.infer<typeof acpPlanEntrySchema>;

/**
 * What the subscription's own limit is doing.
 *
 * From `_meta._claude/rateLimit`, which the spike found the adapter sends per
 * turn — and which is why the conversation no longer needs `/usage`. Optional
 * because it is a Claude extension: another agent will not send it, and a client
 * that required it would refuse a perfectly good usage report.
 */
export const acpRateLimitSchema = z.object({
  /** 0..1. What fraction of the window is spent. */
  utilization: z.number(),
  /** The threshold the agent itself calls "worth warning about". */
  surpassedThreshold: z.number().nullish(),
  isUsingOverage: z.boolean(),
  /** Epoch seconds, as the protocol sends it. */
  resetsAt: z.number().int().nullish(),
  /** `seven_day`, `five_hour` — the agent's own words. */
  kind: z.string().nullish(),
});
export type AcpRateLimit = z.infer<typeof acpRateLimitSchema>;

/**
 * One option of a `configOptions` select, flattened.
 *
 * Flattened because the protocol allows the options to arrive grouped, and the
 * real adapter keys them by `value` rather than `id` — both facts cost a bug
 * before a real handshake said so. The client sees one flat list either way.
 */
export const acpConfigChoiceSchema = z.object({
  value: z.string(),
  name: z.string(),
  /** The agent's own words, verbatim (A13). */
  description: z.string().nullish(),
});
export type AcpConfigChoice = z.infer<typeof acpConfigChoiceSchema>;

export const acpConfigOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `mode`, `model`, `effort` — what the selector is for. */
  category: z.string().nullish(),
  currentValue: z.string(),
  choices: z.array(acpConfigChoiceSchema),
});
export type AcpConfigOption = z.infer<typeof acpConfigOptionSchema>;

/** A slash command the agent offers (F2.8). */
export const acpCommandSchema = z.object({
  name: z.string(),
  /** Verbatim (A13). The repository's own skills show up here. */
  description: z.string(),
  /** True when choosing it should leave the caret waiting for an argument. */
  takesInput: z.boolean(),
});
export type AcpCommand = z.infer<typeof acpCommandSchema>;

/**
 * One thing that happened in the conversation.
 *
 * These are the units the client reduces into a view, and the units `attached`
 * replays. Keeping them one union — rather than folding them into the server
 * message union — is what makes "reopening the tab shows the same thing"
 * something a test can state directly: reduce the transcript, reduce the same
 * events arriving live, compare.
 */
export const acpEventSchema = z.discriminatedUnion("type", [
  /**
   * A slice of a message. Chunks sharing a `messageId` belong to one message,
   * and a change of id means a new one started — so the client appends rather
   * than guessing where a message ends.
   */
  z.object({
    type: z.literal("message"),
    messageId: z.string(),
    role: z.enum(["user", "agent"]),
    text: z.string(),
  }),
  /** Reasoning. Collapsed by default in the client (A3). */
  z.object({ type: z.literal("thought"), messageId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("tool_call"),
    toolCallId: z.string(),
    /** Human-readable, always present. */
    title: z.string(),
    /** Programmatic name — `Edit`, `Bash`. Absent on adapters that omit it. */
    name: z.string().nullish(),
    kind: acpToolKindSchema,
    status: acpToolStatusSchema,
    locations: z.array(acpToolLocationSchema).default([]),
  }),
  /**
   * A change to a call already announced. Every field but the id is optional:
   * the adapter sends only what moved, and a client that required the whole
   * call again would have to diff it back out.
   */
  z.object({
    type: z.literal("tool_call_update"),
    toolCallId: z.string(),
    status: acpToolStatusSchema.optional(),
    title: z.string().optional(),
    content: z.array(acpToolContentSchema).optional(),
    locations: z.array(acpToolLocationSchema).optional(),
  }),
  /**
   * The one event that stops everything: with no answer the agent waits
   * forever. `command` and `cwd` are separate from `title` because the client
   * shows the command whole and unwrapped — a truncated `rm -rf` is an `rm -rf`
   * approved in the dark.
   */
  z.object({
    type: z.literal("permission_request"),
    requestId: z.string(),
    toolCallId: z.string(),
    title: z.string(),
    command: z.string().nullish(),
    cwd: z.string(),
    options: z.array(acpPermissionOptionSchema).min(1),
  }),
  z.object({
    type: z.literal("permission_resolved"),
    requestId: z.string(),
    /** `"cancelled"` is the agent giving up on the ask, not the user denying. */
    outcome: z.union([z.literal("cancelled"), z.object({ optionId: z.string() })]),
  }),
  /**
   * The plan, whole (F2.5).
   *
   * Whole rather than as a delta, because that is what the agent sends: it
   * reissues the entire plan on every change. The client keeps one card and
   * rewrites it — a block per version would fill the conversation with
   * near-identical copies.
   */
  z.object({ type: z.literal("plan"), entries: z.array(acpPlanEntrySchema) }),
  /** The plan is gone. Distinct from an empty plan, which is a plan with no steps. */
  z.object({ type: z.literal("plan_removed") }),
  /**
   * What the turn cost, and what the limit is doing (F2.7).
   *
   * `cost` is optional and stays optional: an agent that does not report money
   * must not be made to look like one that charged nothing.
   */
  z.object({
    type: z.literal("usage"),
    used: z.number().int().nonnegative(),
    size: z.number().int().positive(),
    cost: z.object({ amount: z.number(), currency: z.string() }).nullish(),
    rateLimit: acpRateLimitSchema.nullish(),
  }),
  /**
   * The selectors' current state (F2.6).
   *
   * Sent on attach and again whenever the agent changes something on its own —
   * `current_mode_update` after a `/plan` command, say. One event for all of them,
   * because the client renders them the same way and the protocol groups them.
   */
  z.object({
    type: z.literal("config"),
    /** The current mode id, kept beside the options it belongs to. */
    mode: z.string(),
    options: z.array(acpConfigOptionSchema),
  }),
  /** What `/` offers (F2.8). An empty list means the agent offers none. */
  z.object({ type: z.literal("commands"), commands: z.array(acpCommandSchema) }),
  /**
   * A terminal the agent asked for (F3, D7).
   *
   * Carries a **PTY session id**, not a channel of its own: the daemon answers
   * `terminal/create` with the `PtyManager` that already exists, so the embedded
   * `xterm` attaches to `/pty?session=<id>` exactly like any other terminal and no
   * new streaming path exists to get wrong.
   */
  z.object({
    type: z.literal("terminal"),
    terminalId: z.string(),
    /** The PTY session the embedded terminal attaches to. */
    ptySessionId: z.string(),
    command: z.string(),
  }),
  z.object({ type: z.literal("turn_end"), stopReason: acpStopReasonSchema }),
  /**
   * An event the daemon received and could not name.
   *
   * A deliberate shape, not a hole: the daemon produces it after failing to
   * recognise a `session/update`, so the tab can say "ignored" in grey instead
   * of going quiet. A misspelling in our own code still fails to decode.
   */
  z.object({ type: z.literal("unknown"), sessionUpdate: z.string() }),
]);
export type AcpEvent = z.infer<typeof acpEventSchema>;

/**
 * One transcript entry: an event, and when the daemon saw it.
 *
 * The timestamp lives on the envelope rather than inside every variant, because
 * it is not part of what happened — it is when. Every event needs it and no
 * event is about it.
 *
 * It exists because the card shows elapsed time, and elapsed time cannot be
 * derived in the browser without reading a clock. A reducer that reads a clock
 * is a reducer whose output depends on when it ran, and then replaying a
 * transcript no longer reproduces what the live stream produced — which is the
 * one property the whole replay design rests on. The daemon is also the only
 * thing that can stamp it truthfully: it is what was listening.
 */
export const acpTranscriptEntrySchema = z.object({
  /** Epoch milliseconds, from the daemon's clock. */
  at: z.number().int().nonnegative(),
  event: acpEventSchema,
});
export type AcpTranscriptEntry = z.infer<typeof acpTranscriptEntrySchema>;

export const acpErrorCodeSchema = z.enum([
  /** No session with that id — the attach is refused and the socket closes. */
  "SESSION_NOT_FOUND",
  /** The agent is gone; a prompt has nowhere to land. */
  "SESSION_EXITED",
  /** The frame was not a valid message. The connection stays open. */
  "INVALID_MESSAGE",
  /** The adapter could not be launched, or the handshake failed (F1.6). */
  "ADAPTER_UNAVAILABLE",
  /** A defect on the daemon side, already logged there. */
  "INTERNAL",
]);
export type AcpErrorCode = z.infer<typeof acpErrorCodeSchema>;

export const acpClientMessageSchema = z.discriminatedUnion("type", [
  /** Empty is refused here, not in the UI: an empty turn still costs a turn. */
  z.object({ type: z.literal("prompt"), text: z.string().min(1) }),
  z.object({ type: z.literal("cancel") }),
  z.object({
    type: z.literal("permission_response"),
    requestId: z.string(),
    optionId: z.string(),
  }),
  /**
   * Switch a mode, a model, an effort — anything `configOptions` offers (D8).
   *
   * One message rather than one per selector. The protocol treats mode specially
   * (`session/set_mode`) and everything else generically, and the daemon is the
   * only side that should have to know that: a `set_mode` and a `set_model` on the
   * wire would put the protocol's own irregularity into the browser.
   */
  z.object({
    type: z.literal("set_config"),
    optionId: z.string().min(1),
    value: z.string().min(1),
  }),
]);
export type AcpClientMessage = z.infer<typeof acpClientMessageSchema>;

export const acpServerMessageSchema = z.discriminatedUnion("type", [
  /**
   * Always the first frame of a successful attach, and it carries the whole
   * conversation: the client rebuilds from `transcript` and only then starts
   * applying `event`. The PTY endpoint makes the same promise with `snapshot`.
   */
  z.object({
    type: z.literal("attached"),
    sessionId: z.string(),
    state: acpSessionStateSchema,
    acpSessionId: z.string(),
    model: z.string(),
    mode: z.string(),
    /**
     * The selectors, already filled in.
     *
     * On attach rather than only via the `config` event: a tab that opened with
     * empty dropdowns until the agent happened to mention something would look
     * broken for as long as nothing changed.
     */
    configOptions: z.array(acpConfigOptionSchema).default([]),
    transcript: z.array(acpTranscriptEntrySchema),
  }),
  z.object({
    type: z.literal("event"),
    at: z.number().int().nonnegative(),
    event: acpEventSchema,
  }),
  z.object({
    type: z.literal("error"),
    code: acpErrorCodeSchema,
    message: z.string(),
    /**
     * A command that fixes it, when one exists.
     *
     * Separate from `message` because the tab renders it as a copyable block:
     * a launch failure is a domain answer with a way out, not a stack trace
     * (F1.6).
     */
    remedy: z.string().optional(),
  }),
]);
export type AcpServerMessage = z.infer<typeof acpServerMessageSchema>;

/**
 * Outcome of decoding a frame.
 *
 * A result rather than an exception, for the reason the PTY protocol gives:
 * every caller sits in a socket event handler, where a throw takes down the
 * daemon instead of the one client that sent nonsense.
 */
export type AcpDecodeResult<TMessage> =
  | { ok: true; message: TMessage }
  | { ok: false; error: string };

function decode<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: string,
): AcpDecodeResult<z.infer<TSchema>> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `not valid JSON: ${(error as Error).message}` };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: detail };
  }
  return { ok: true, message: parsed.data };
}

export function decodeAcpClientMessage(raw: string): AcpDecodeResult<AcpClientMessage> {
  return decode(acpClientMessageSchema, raw);
}

export function decodeAcpServerMessage(raw: string): AcpDecodeResult<AcpServerMessage> {
  return decode(acpServerMessageSchema, raw);
}

export function encodeAcpClientMessage(message: AcpClientMessage): string {
  return JSON.stringify(message);
}

export function encodeAcpServerMessage(message: AcpServerMessage): string {
  return JSON.stringify(message);
}
