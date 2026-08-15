import { z } from "zod";

/**
 * Wire protocol between a browser terminal and the daemon's PTY endpoint.
 *
 * It lives in `shared` because both ends must agree byte for byte, and because
 * the daemon is the only thing that can be trusted to enforce it: a websocket
 * frame arrives as an opaque string, so every message is validated on receipt
 * rather than cast.
 */

/** Path the daemon serves PTY websockets on. */
export const PTY_WS_PATH = "/pty";

/** Query parameter carrying the session id on attach. */
export const PTY_SESSION_PARAM = "session";

/**
 * Application close codes.
 *
 * 4000–4999 is the range RFC 6455 reserves for applications; anything lower
 * would collide with codes the browser generates on its own, and a client
 * cannot tell "the daemon refused you" from "the network died" without one.
 */
export const PTY_CLOSE_SESSION_NOT_FOUND = 4404;

export const ptySessionStateSchema = z.enum(["running", "exited"]);
export type PtySessionState = z.infer<typeof ptySessionStateSchema>;

export const ptyErrorCodeSchema = z.enum([
  /** No session with that id — the attach is refused and the socket closes. */
  "SESSION_NOT_FOUND",
  /** The process is gone; input has nowhere to land. */
  "SESSION_EXITED",
  /** The frame was not a valid message. The connection stays open. */
  "INVALID_MESSAGE",
  /** A defect on the daemon side, already logged there. */
  "INTERNAL",
]);
export type PtyErrorCode = z.infer<typeof ptyErrorCodeSchema>;

/**
 * Upper bound on a terminal dimension.
 *
 * `PtyManager.resize` only demands a positive integer, and a client asking for
 * 10 million columns would have the kernel allocate a line buffer to match.
 */
const MAX_DIMENSION = 5_000;

export const ptyClientMessageSchema = z.discriminatedUnion("type", [
  /** Keystrokes, verbatim. Never trimmed — a lone \r is meaningful. */
  z.object({ type: z.literal("input"), data: z.string() }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(1).max(MAX_DIMENSION),
    rows: z.number().int().min(1).max(MAX_DIMENSION),
  }),
]);
export type PtyClientMessage = z.infer<typeof ptyClientMessageSchema>;

export const ptyServerMessageSchema = z.discriminatedUnion("type", [
  /**
   * Always the first frame of a successful attach, and it carries the whole
   * scrollback: the client repaints from `snapshot` and only then starts
   * applying `output`.
   */
  z.object({
    type: z.literal("attached"),
    sessionId: z.string(),
    state: ptySessionStateSchema,
    cols: z.number().int(),
    rows: z.number().int(),
    snapshot: z.string(),
  }),
  z.object({ type: z.literal("output"), data: z.string() }),
  z.object({
    type: z.literal("exit"),
    exitCode: z.number().int(),
    signal: z.number().int().nullable(),
  }),
  z.object({ type: z.literal("error"), code: ptyErrorCodeSchema, message: z.string() }),
]);
export type PtyServerMessage = z.infer<typeof ptyServerMessageSchema>;

/**
 * Outcome of decoding a frame.
 *
 * A result rather than an exception because every caller is inside a socket
 * event handler, where a throw takes down the daemon instead of the one client
 * that sent nonsense.
 */
export type PtyDecodeResult<TMessage> =
  | { ok: true; message: TMessage }
  | { ok: false; error: string };

function decode<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: string,
): PtyDecodeResult<z.infer<TSchema>> {
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

export function decodePtyClientMessage(raw: string): PtyDecodeResult<PtyClientMessage> {
  return decode(ptyClientMessageSchema, raw);
}

export function decodePtyServerMessage(raw: string): PtyDecodeResult<PtyServerMessage> {
  return decode(ptyServerMessageSchema, raw);
}

export function encodePtyClientMessage(message: PtyClientMessage): string {
  return JSON.stringify(message);
}

export function encodePtyServerMessage(message: PtyServerMessage): string {
  return JSON.stringify(message);
}
