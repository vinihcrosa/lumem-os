import type { RawData } from "ws";

/**
 * The text of a WebSocket frame, whatever shape `ws` hands it in.
 *
 * `RawData` is `Buffer | ArrayBuffer | Buffer[]`, and `.toString()` is right only
 * for the first: an `ArrayBuffer` prints `[object ArrayBuffer]`, and fragments
 * join with commas. The default `binaryType` makes it a `Buffer` today, which is
 * why nothing failed — the lint (`no-base-to-string`, T9 of the dev-harness)
 * found the other two.
 */
export function frameText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return raw.toString("utf8");
}
