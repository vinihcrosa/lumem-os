import { existsSync } from "node:fs";

import { newId } from "@lumem/shared";
import { spawn as spawnPty, type IPty } from "node-pty";

import { DomainError } from "../errors.js";
import { RingBuffer } from "./RingBuffer.js";

export const DEFAULT_SCROLLBACK_LINES = 10_000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export type SessionState = "running" | "exited";

export interface SpawnOptions {
  command: string;
  args?: readonly string[];
  cwd: string;
  /** Merged over the daemon's own environment. */
  env?: Readonly<Record<string, string>>;
  cols?: number;
  rows?: number;
}

export interface SessionInfo {
  id: string;
  command: string;
  args: readonly string[];
  cwd: string;
  state: SessionState;
  exitCode: number | null;
  signal: number | null;
  cols: number;
  rows: number;
}

export type DataListener = (chunk: string) => void;
export type ExitListener = (exit: { exitCode: number; signal: number | null }) => void;

interface Session {
  info: SessionInfo;
  pty: IPty;
  buffer: RingBuffer;
  dataListeners: Set<DataListener>;
  exitListeners: Set<ExitListener>;
}

export interface PtyManagerOptions {
  scrollbackLines?: number;
}

/**
 * Owns every PTY the daemon has spawned.
 *
 * Sessions live here rather than on a connection because that is the whole
 * point: closing the browser must not kill the shell. Clients attach and
 * detach; the process does not notice.
 */
export class PtyManager {
  private readonly sessions = new Map<string, Session>();
  private readonly scrollbackLines: number;

  constructor({ scrollbackLines = DEFAULT_SCROLLBACK_LINES }: PtyManagerOptions = {}) {
    this.scrollbackLines = scrollbackLines;
  }

  spawn(options: SpawnOptions): SessionInfo {
    const { command, args = [], cwd, env, cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = options;

    if (command.trim() === "") {
      throw new DomainError("INVALID_ARGUMENT", "command must not be empty");
    }

    // node-pty does not fail loudly here: a missing cwd produces a PTY that
    // exits with code 1 and writes nothing at all. Checking first is the
    // difference between "no such directory: /x" and a blank terminal that
    // closed for no visible reason.
    if (!existsSync(cwd)) {
      throw new DomainError("INVALID_ARGUMENT", `working directory does not exist: ${cwd}`);
    }

    const id = newId();
    let pty: IPty;
    try {
      pty = spawnPty(command, [...args], {
        cwd,
        cols,
        rows,
        name: "xterm-256color",
        env: { ...(process.env as Record<string, string>), ...env },
      });
    } catch (error) {
      // node-pty rarely throws synchronously — a missing binary exits with
      // code 1 asynchronously instead. It does throw when its own prebuilt
      // spawn-helper is unusable, which is worth surfacing rather than
      // crashing the daemon.
      throw new DomainError(
        "SPAWN_FAILED",
        `cannot start "${command}" in ${cwd}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const session: Session = {
      info: {
        id,
        command,
        args: [...args],
        cwd,
        state: "running",
        exitCode: null,
        signal: null,
        cols,
        rows,
      },
      pty,
      buffer: new RingBuffer({ maxLines: this.scrollbackLines }),
      dataListeners: new Set(),
      exitListeners: new Set(),
    };
    this.sessions.set(id, session);

    pty.onData((chunk) => {
      session.buffer.append(chunk);
      // A throwing listener must not take down the daemon or starve the other
      // attached clients.
      for (const listener of [...session.dataListeners]) {
        try {
          listener(chunk);
        } catch {
          /* a broken client is the client's problem */
        }
      }
    });

    pty.onExit(({ exitCode, signal }) => {
      session.info.state = "exited";
      session.info.exitCode = exitCode;
      session.info.signal = signal ?? null;
      for (const listener of [...session.exitListeners]) {
        try {
          listener({ exitCode, signal: signal ?? null });
        } catch {
          /* same */
        }
      }
      session.dataListeners.clear();
      session.exitListeners.clear();
    });

    return { ...session.info };
  }

  write(id: string, data: string): void {
    const session = this.require(id);
    if (session.info.state === "exited") {
      throw new DomainError("SESSION_EXITED", `session ${id} has exited`);
    }
    session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      throw new DomainError("INVALID_ARGUMENT", `invalid size ${cols}x${rows}`);
    }
    const session = this.require(id);
    if (session.info.state === "exited") return; // resizing a corpse is a no-op, not an error

    session.pty.resize(cols, rows);
    session.info.cols = cols;
    session.info.rows = rows;
  }

  kill(id: string, signal?: string): void {
    const session = this.require(id);
    if (session.info.state === "exited") return;
    session.pty.kill(signal);
  }

  /** Everything the client needs to repaint on attach. */
  snapshot(id: string): string {
    return this.require(id).buffer.snapshot();
  }

  get(id: string): SessionInfo | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session.info } : undefined;
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((session) => ({ ...session.info }));
  }

  /** Returns an unsubscribe function. Detaching must never kill the process. */
  onData(id: string, listener: DataListener): () => void {
    const session = this.require(id);
    session.dataListeners.add(listener);
    return () => session.dataListeners.delete(listener);
  }

  onExit(id: string, listener: ExitListener): () => void {
    const session = this.require(id);
    if (session.info.state === "exited") {
      // Already gone: tell the caller now rather than never.
      listener({ exitCode: session.info.exitCode ?? 0, signal: session.info.signal });
      return () => {};
    }
    session.exitListeners.add(listener);
    return () => session.exitListeners.delete(listener);
  }

  /** Drops the record entirely. The process must already be gone. */
  forget(id: string): void {
    const session = this.require(id);
    if (session.info.state === "running") {
      throw new DomainError("INVALID_ARGUMENT", `session ${id} is still running`);
    }
    this.sessions.delete(id);
  }

  /**
   * Kills every session and waits for them to actually die.
   *
   * This is what `bootstrap`'s `beforeClose` calls: `app.close()` knows nothing
   * about these children, and a daemon that exits without them leaves orphaned
   * shells attached to nothing.
   */
  async killAll(timeoutMs = 2_000): Promise<void> {
    const running = [...this.sessions.values()].filter((s) => s.info.state === "running");

    await Promise.all(
      running.map(
        (session) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, timeoutMs);
            timer.unref?.();
            session.exitListeners.add(() => {
              clearTimeout(timer);
              resolve();
            });
            try {
              session.pty.kill();
            } catch {
              clearTimeout(timer);
              resolve();
            }
          }),
      ),
    );
  }

  private require(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new DomainError("SESSION_NOT_FOUND", `no session ${id}`);
    return session;
  }
}
