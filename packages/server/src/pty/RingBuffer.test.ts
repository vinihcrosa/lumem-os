import { describe, expect, it } from "vitest";

import { RingBuffer } from "./RingBuffer.js";

describe("RingBuffer", () => {
  it("replays what was appended", () => {
    const buffer = new RingBuffer({ maxLines: 10 });

    buffer.append("hello ");
    buffer.append("world");

    expect(buffer.snapshot()).toBe("hello world");
  });

  it("preserves escape sequences verbatim", () => {
    // The client repaints by replaying this; mangling the sequences leaves the
    // terminal in whatever mode the broken half set.
    const buffer = new RingBuffer({ maxLines: 10 });
    const colored = "[31mred[0m";

    buffer.append(colored);

    expect(buffer.snapshot()).toBe(colored);
  });

  it("keeps a chunk split across appends on one line", () => {
    const buffer = new RingBuffer({ maxLines: 10 });

    buffer.append("abc");
    buffer.append("def\n");

    expect(buffer.snapshot()).toBe("abcdef\n");
    expect(buffer.size).toBe(2);
  });

  it("drops the oldest lines past the cap", () => {
    const buffer = new RingBuffer({ maxLines: 3 });

    for (let i = 1; i <= 5; i += 1) buffer.append(`line${i}\n`);

    // Five appends produce five newlines, so the trailing empty line counts.
    expect(buffer.snapshot()).toBe("line4\nline5\n");
    expect(buffer.size).toBe(3);
  });

  it("counts how many lines it evicted", () => {
    const buffer = new RingBuffer({ maxLines: 2 });

    for (let i = 0; i < 10; i += 1) buffer.append(`x\n`);

    expect(buffer.dropped).toBe(9);
  });

  it("never exceeds the cap regardless of chunk shape", () => {
    const buffer = new RingBuffer({ maxLines: 4 });

    // One chunk carrying many lines must trim as hard as many small ones.
    buffer.append("a\nb\nc\nd\ne\nf\ng\n");

    expect(buffer.size).toBe(4);
  });

  it("bounds a single line that never ends", () => {
    // A binary dump or a \r progress bar writes megabytes without a newline.
    // Without the cap this grows one entry until the daemon dies.
    const buffer = new RingBuffer({ maxLines: 10, maxLineLength: 100 });

    for (let i = 0; i < 50; i += 1) buffer.append("0123456789");

    expect(buffer.snapshot()).toHaveLength(100);
  });

  it("keeps the newest end of an over-long line", () => {
    // Terminals show the tail; dropping the head is what a user expects.
    const buffer = new RingBuffer({ maxLines: 10, maxLineLength: 5 });

    buffer.append("abcdefghij");

    expect(buffer.snapshot()).toBe("fghij");
  });

  it("ignores an empty chunk", () => {
    const buffer = new RingBuffer({ maxLines: 3 });

    buffer.append("a");
    buffer.append("");

    expect(buffer.snapshot()).toBe("a");
    expect(buffer.size).toBe(1);
  });

  it("clears back to empty", () => {
    const buffer = new RingBuffer({ maxLines: 3 });
    buffer.append("a\nb\nc\nd\n");

    buffer.clear();

    expect(buffer.snapshot()).toBe("");
    expect(buffer.size).toBe(1);
    expect(buffer.dropped).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects maxLines of %s", (value) => {
    expect(() => new RingBuffer({ maxLines: value })).toThrow(RangeError);
  });

  it.each([0, -1, 2.5])("rejects maxLineLength of %s", (value) => {
    expect(() => new RingBuffer({ maxLines: 10, maxLineLength: value })).toThrow(RangeError);
  });
});
