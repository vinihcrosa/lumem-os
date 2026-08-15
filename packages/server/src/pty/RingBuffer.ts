/**
 * Bounded scrollback for one PTY session.
 *
 * Holds the raw terminal stream, escape sequences and all, so a reconnecting
 * client can repaint by replaying it verbatim. Trimming happens at line
 * boundaries: cutting mid-sequence would leave the terminal in whatever mode
 * the truncated escape half-set.
 *
 * Lives in memory only. It does not survive a daemon restart, and the PRD says
 * neither do sessions, so there is nothing to persist.
 */
export interface RingBufferOptions {
  /** Lines kept before the oldest are dropped. */
  maxLines: number;
  /**
   * Characters kept in a single line.
   *
   * A process that writes megabytes without a newline — a binary dump, a
   * progress bar redrawing with \r — would otherwise grow one entry without
   * bound, and the line cap is the only thing standing between that and the
   * daemon's heap.
   */
  maxLineLength?: number;
}

const DEFAULT_MAX_LINE_LENGTH = 64 * 1024;

export class RingBuffer {
  /** Completed lines, oldest first. The tail is the line still being written. */
  private lines: string[] = [""];
  private readonly maxLines: number;
  private readonly maxLineLength: number;
  private droppedLines = 0;

  constructor({ maxLines, maxLineLength = DEFAULT_MAX_LINE_LENGTH }: RingBufferOptions) {
    if (!Number.isInteger(maxLines) || maxLines < 1) {
      throw new RangeError(`maxLines must be a positive integer, got: ${String(maxLines)}`);
    }
    if (!Number.isInteger(maxLineLength) || maxLineLength < 1) {
      throw new RangeError(
        `maxLineLength must be a positive integer, got: ${String(maxLineLength)}`,
      );
    }
    this.maxLines = maxLines;
    this.maxLineLength = maxLineLength;
  }

  append(chunk: string): void {
    if (chunk === "") return;

    const parts = chunk.split("\n");

    // The first part continues the line already in progress.
    this.lines[this.lines.length - 1] = this.cap(
      (this.lines[this.lines.length - 1] ?? "") + (parts[0] ?? ""),
    );

    for (let i = 1; i < parts.length; i += 1) {
      this.lines.push(this.cap(parts[i] ?? ""));
    }

    this.trim();
  }

  /** The whole buffer as the client should repaint it. */
  snapshot(): string {
    return this.lines.join("\n");
  }

  /** Lines currently held, including the one in progress. */
  get size(): number {
    return this.lines.length;
  }

  /** Lines evicted since the session started. Useful for telling the user. */
  get dropped(): number {
    return this.droppedLines;
  }

  clear(): void {
    this.lines = [""];
    this.droppedLines = 0;
  }

  private cap(line: string): string {
    return line.length > this.maxLineLength ? line.slice(-this.maxLineLength) : line;
  }

  private trim(): void {
    const excess = this.lines.length - this.maxLines;
    if (excess <= 0) return;
    this.lines.splice(0, excess);
    this.droppedLines += excess;
  }
}
