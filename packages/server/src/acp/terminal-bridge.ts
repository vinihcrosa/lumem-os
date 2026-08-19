import { newId } from "@lumem/shared";

import { DomainError } from "../errors.js";
import type { PtyManager } from "../pty/PtyManager.js";

/**
 * The terminal the agent asks for (F3, A5, D7).
 *
 * This is the one place the two transports meet, and the meeting is the point:
 * `terminal/create` is the agent asking the *client* for a shell, and the client
 * already owns one — `PtyManager`. So there is **no new process manager**, no new
 * streaming path, and no second idea of what a running command is.
 *
 * What falls out of that is the whole reason D7 is written down: the terminal has a
 * PTY session id, so the `xterm` embedded in the card attaches to
 * `/pty?session=<id>` exactly like any other terminal. The `Terminal` component
 * goes in unmodified.
 *
 * The session ids stay out of the worktree's tab strip. These are not sessions the
 * user started and cannot be closed by them — the agent owns their lifetime, and a
 * tab for one would offer a close button that fights the agent for control.
 */

export interface TerminalCreateRequest {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  /** Defaults to the ACP session's own checkout. */
  cwd?: string | null;
  /** How much output to keep. The `PtyManager`'s ring buffer already bounds it. */
  outputByteLimit?: number | null;
}

export interface TerminalOutput {
  output: string;
  truncated: boolean;
  exitStatus: { exitCode: number | null; signal: string | null } | null;
}

export interface TerminalBridge {
  /** Answers `terminal/create`. Returns the ids the agent and the card each need. */
  create(request: TerminalCreateRequest): { terminalId: string; ptySessionId: string };
  output(terminalId: string): TerminalOutput;
  /** Resolves when the process ends. Answers immediately if it already has. */
  waitForExit(terminalId: string): Promise<{ exitCode: number | null; signal: string | null }>;
  kill(terminalId: string): void;
  /** Forgets the terminal. The process must be gone; killing is `kill`. */
  release(terminalId: string): void;
  /** Every PTY session this bridge started, for cleanup when the agent dies. */
  ptySessionIds(): string[];
}

export interface TerminalBridgeOptions {
  ptyManager: PtyManager;
  /** The ACP session's checkout, and the default cwd for anything it runs. */
  cwd: string;
}

interface Entry {
  ptySessionId: string;
  /** Resolved by the PTY's own exit, so `wait_for_exit` needs no polling. */
  exited: Promise<{ exitCode: number | null; signal: string | null }>;
  settled: { exitCode: number | null; signal: string | null } | null;
}

export function createTerminalBridge({
  ptyManager,
  cwd,
}: TerminalBridgeOptions): TerminalBridge {
  const terminals = new Map<string, Entry>();

  function require_(terminalId: string): Entry {
    const entry = terminals.get(terminalId);
    if (!entry) {
      throw new DomainError("NOT_FOUND", `nenhum terminal ${terminalId} nesta sessão`);
    }
    return entry;
  }

  return {
    create(request) {
      if (request.command.trim() === "") {
        throw new DomainError("INVALID_ARGUMENT", "o comando do terminal não pode ser vazio");
      }

      const spawned = ptyManager.spawn({
        command: request.command,
        ...(request.args ? { args: [...request.args] } : {}),
        // The agent may name a directory, and it goes through no guard here: it is
        // spawning a process, not reading a file, and a shell can `cd` anywhere the
        // user can regardless. The default is the session's own checkout, which is
        // the answer that is almost always wanted.
        cwd: request.cwd ?? cwd,
        ...(request.env ? { env: request.env } : {}),
      });

      // A terminal id of the agent's own, distinct from the PTY session id. They
      // could be the same value, and keeping them apart is deliberate: the agent's
      // id is protocol vocabulary and the session id is ours, and conflating them
      // would leak one into the other's error messages.
      const terminalId = newId();

      const entry: Entry = {
        ptySessionId: spawned.id,
        settled: null,
        exited: new Promise((resolve) => {
          ptyManager.onExit(spawned.id, ({ exitCode, signal }) => {
            const status = { exitCode, signal: signal === null ? null : String(signal) };
            entry.settled = status;
            resolve(status);
          });
        }),
      };
      terminals.set(terminalId, entry);

      return { terminalId, ptySessionId: spawned.id };
    },

    output(terminalId) {
      const entry = require_(terminalId);
      const snapshot = ptyManager.snapshot(entry.ptySessionId);

      return {
        output: snapshot,
        // The ring buffer drops the oldest lines rather than growing, so anything
        // long has lost its beginning. Reporting it is the difference between the
        // agent reasoning about partial output and reasoning about output it thinks
        // is whole.
        truncated: ptyManager.droppedLines(entry.ptySessionId) > 0,
        exitStatus: entry.settled,
      };
    },

    waitForExit(terminalId) {
      const entry = require_(terminalId);
      // Already gone answers now rather than never: the agent may ask after the
      // fact, and a promise that resolved before it subscribed still has to.
      return entry.settled ? Promise.resolve(entry.settled) : entry.exited;
    },

    kill(terminalId) {
      ptyManager.kill(require_(terminalId).ptySessionId);
    },

    release(terminalId) {
      const entry = require_(terminalId);
      // Forgotten here, and forgotten in the manager too — otherwise the record
      // outlives every reference to it and `list()` grows for the life of the
      // daemon. `forget` refuses a running process, which is the right refusal:
      // releasing something still running is the agent losing track of it.
      terminals.delete(terminalId);
      ptyManager.forget(entry.ptySessionId);
    },

    ptySessionIds() {
      return [...terminals.values()].map((entry) => entry.ptySessionId);
    },
  };
}
