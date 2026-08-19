import { KNOWN_SESSION_UPDATES } from "./translate.js";

/**
 * Keeps an evolving protocol from breaking a pinned SDK.
 *
 * `@agentclientprotocol/sdk@1.3.0` validates every `session/update` against the
 * `SessionUpdate` union it was built with, and it does so in
 * `SessionUpdateRouter.handleMessage` — *before* any handler runs, and
 * unconditionally, whether or not a session is attached. A registered params
 * parser does not help, because the router never asks for one.
 *
 * So an update carrying a variant the pinned SDK does not know is dropped, and
 * the SDK prints a zod error tree to stderr. The session survives, which is the
 * important half. What is lost is the other half of D3: the daemon never hears
 * about the event, so it cannot log which one it was, and the tab cannot say
 * "ignored" in grey. The PRD lists that grey line as the mitigation for "an
 * unknown event takes down the tab" — a mitigation nothing implements is worth
 * writing down or worth building, and building it is cheaper.
 *
 * This is the cheap version: sniff the newline-delimited stream on the way in,
 * divert the lines the SDK would choke on, and pass everything else through
 * byte for byte. The SDK sees a clean stream and stays quiet; the daemon gets
 * its event.
 *
 * It is deliberately narrow. It recognises exactly one thing — a
 * `session/update` notification whose `sessionUpdate` is not a name this daemon
 * knows — and forwards literally everything else, including malformed JSON,
 * which is the SDK's business to complain about.
 */

export interface SniffOptions {
  /** Called with the variant name for each diverted update. */
  onUnknown(sessionUpdate: string): void;
}

/**
 * True when this line is a `session/update` the pinned SDK would reject.
 *
 * Conservative on purpose: anything that does not parse, or that is not a
 * `session/update`, or whose variant is known, is somebody else's problem.
 */
function unknownVariantOf(line: string): string | null {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof message !== "object" || message === null) return null;
  const record = message as Record<string, unknown>;
  if (record["method"] !== "session/update") return null;

  const params = record["params"];
  if (typeof params !== "object" || params === null) return null;
  const update = (params as Record<string, unknown>)["update"];
  if (typeof update !== "object" || update === null) return null;

  const variant = (update as Record<string, unknown>)["sessionUpdate"];
  if (typeof variant !== "string") return "<missing>";
  return KNOWN_SESSION_UPDATES.has(variant) ? null : variant;
}

/**
 * Wraps the agent's stdout, diverting updates the SDK cannot parse.
 *
 * Reassembles lines rather than forwarding raw chunks, because a JSON-RPC
 * message can arrive split across reads. Content is unchanged; only the chunk
 * boundaries move, and `ndJsonStream` splits on newlines anyway.
 */
export function sniffUnknownUpdates(
  source: ReadableStream<Uint8Array>,
  { onUnknown }: SniffOptions,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          // A trailing line with no newline is still a message. Dropping it
          // would lose the last event of a conversation that ended abruptly.
          if (pending !== "") {
            const variant = unknownVariantOf(pending);
            if (variant !== null) onUnknown(variant);
            else controller.enqueue(encoder.encode(pending));
            pending = "";
          }
          controller.close();
          return;
        }

        pending += decoder.decode(value, { stream: true });

        let out = "";
        let newline = pending.indexOf("\n");
        while (newline !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);

          const variant = line.trim() === "" ? null : unknownVariantOf(line);
          if (variant !== null) onUnknown(variant);
          else out += `${line}\n`;

          newline = pending.indexOf("\n");
        }

        // Only hand control back once something is actually there to read; an
        // empty enqueue would spin the consumer for every diverted line.
        if (out !== "") {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}
