import { describe, expect, it } from "vitest";

import { sniffUnknownUpdates } from "./unknown-updates.js";

/**
 * The shim that keeps a pinned SDK from choking on a protocol that moved.
 *
 * Two promises, and both matter equally: what it diverts, and that everything
 * else comes out byte for byte. A sniffer that mangled a diff would be far worse
 * than the problem it solves.
 */

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

function line(update: Record<string, unknown>): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId: "s-1", update },
  })}\n`;
}

async function sniff(...chunks: string[]): Promise<{ out: string; diverted: string[] }> {
  const diverted: string[] = [];
  const out = await drain(
    sniffUnknownUpdates(streamOf(...chunks), { onUnknown: (name) => diverted.push(name) }),
  );
  return { out, diverted };
}

describe("what it diverts", () => {
  it("takes out an update whose variant this daemon does not know", async () => {
    const { out, diverted } = await sniff(line({ sessionUpdate: "steering_update" }));

    expect(diverted).toEqual(["steering_update"]);
    expect(out).toBe("");
  });

  it("takes out an update with no variant name at all", async () => {
    const { diverted } = await sniff(line({ nothing: true }));

    expect(diverted).toEqual(["<missing>"]);
  });

  it("reports each unknown variant once, in order", async () => {
    const { diverted } = await sniff(
      line({ sessionUpdate: "steering_update" }),
      line({ sessionUpdate: "goal_update" }),
    );

    expect(diverted).toEqual(["steering_update", "goal_update"]);
  });
});

describe("what it must not touch", () => {
  it("passes a known update through unchanged", async () => {
    const known = line({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "olá" },
    });

    const { out, diverted } = await sniff(known);

    expect(out).toBe(known);
    expect(diverted).toEqual([]);
  });

  it("passes a variant it does not render but does recognise", async () => {
    // A plan is known and ignored downstream. Diverting it here would report it
    // as unrecognised — the exact confusion the two lists exist to avoid.
    const plan = line({ sessionUpdate: "plan", entries: [] });

    const { out, diverted } = await sniff(plan);

    expect(out).toBe(plan);
    expect(diverted).toEqual([]);
  });

  it("passes anything that is not a session/update", async () => {
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1 } })}\n`;

    const { out } = await sniff(request);

    expect(out).toBe(request);
  });

  it("leaves malformed JSON for the SDK to complain about", async () => {
    // Not this module's job. Swallowing it would hide a broken adapter behind a
    // silence that looks like an idle agent.
    const { out, diverted } = await sniff("{not json\n");

    expect(out).toBe("{not json\n");
    expect(diverted).toEqual([]);
  });

  it("preserves content that happens to contain a newline", async () => {
    const withNewline = line({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "primeira\nsegunda" },
    });

    const { out } = await sniff(withNewline);

    // JSON escapes it, so the message is still one line — and that is exactly
    // the property that makes a newline-delimited protocol safe to sniff.
    expect(out).toBe(withNewline);
    expect(out.split("\n").filter(Boolean)).toHaveLength(1);
  });
});

describe("chunk boundaries", () => {
  it("reassembles a message split across reads", async () => {
    const known = line({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "partido ao meio" },
    });
    const half = Math.floor(known.length / 2);

    const { out } = await sniff(known.slice(0, half), known.slice(half));

    expect(out).toBe(known);
  });

  it("diverts an unknown update even when it arrives in pieces", async () => {
    const raw = line({ sessionUpdate: "steering_update" });

    const { diverted, out } = await sniff(raw.slice(0, 20), raw.slice(20));

    expect(diverted).toEqual(["steering_update"]);
    expect(out).toBe("");
  });

  it("handles several messages in one read", async () => {
    const first = line({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "a" } });
    const second = line({ sessionUpdate: "steering_update" });
    const third = line({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "b" } });

    const { out, diverted } = await sniff(first + second + third);

    expect(out).toBe(first + third);
    expect(diverted).toEqual(["steering_update"]);
  });

  it("does not lose a final line that never got its newline", async () => {
    // An adapter killed mid-write leaves one. Dropping it would lose the last
    // event of the conversation, which is the one the user was waiting for.
    const known = line({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "fim" } });

    const { out } = await sniff(known.trimEnd());

    expect(out).toBe(known.trimEnd());
  });

  it("survives a stream that only ever carried diverted lines", async () => {
    const { out, diverted } = await sniff(
      line({ sessionUpdate: "steering_update" }),
      line({ sessionUpdate: "goal_update" }),
    );

    expect(out).toBe("");
    expect(diverted).toHaveLength(2);
  });

  it("passes a blank line through without calling it unknown", async () => {
    // Forwarded rather than swallowed: the promise is "byte for byte unless it
    // would break the SDK", and `ndJsonStream` skips blank lines by itself.
    // Deciding here that whitespace is noise would be this module inventing a
    // rule that is not its to make.
    const { out, diverted } = await sniff("\n\n");

    expect(out).toBe("\n\n");
    expect(diverted).toEqual([]);
  });
});
