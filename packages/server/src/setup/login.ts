import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";

import { DomainError } from "../errors.js";
import type { PtyManager } from "../pty/PtyManager.js";

/**
 * Running the adapter's own login command, in a terminal the daemon owns.
 *
 * This is what the two Claude logins *are*. Measured, not inferred:
 * `claude-agent-acp` advertises both `claude-ai-login` and `console-login` as
 * `type: "terminal"`, and its `authenticate` throws "Method not implemented" for
 * either of them. The browser that opens during a subscription login is opened by
 * that command, not by the protocol.
 *
 * Not a session, for the same reason the probe is not one (onboarding D4): there
 * is no scope it belongs to — no project, no worktree — and a row in `session`
 * would be a conversation that never existed. The client attaches to it over the
 * PTY socket it already speaks, watches it exit, and then asks the daemon to
 * probe again. Nobody is asked to confirm they logged in: the adapter answering
 * `session/new` is the confirmation.
 */

export interface LoginOptions {
  ptyManager: PtyManager;
  /** From `authMethods`: the binary the adapter said to run. */
  command: string;
  args: readonly string[];
  /** Somewhere that exists. The login writes to the user's home, not here. */
  cwd: string;
  cols?: number | undefined;
  rows?: number | undefined;
}

export interface LoginTerminal {
  /** The PTY id the client attaches to. Not a session id. */
  ptySessionId: string;
  command: string;
  args: readonly string[];
}

export function startLogin({
  ptyManager,
  command,
  args,
  cwd,
  cols,
  rows,
}: LoginOptions): LoginTerminal {
  if (command.trim() === "") {
    // The adapter offered a method it did not say how to run. Refusing here is
    // what keeps the screen from drawing a button that opens an empty terminal.
    throw new DomainError(
      "INVALID_ARGUMENT",
      "este método de login não veio com um comando; o adaptador não disse o que rodar",
    );
  }

  if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });

  const info = ptyManager.spawn({
    command,
    args,
    cwd,
    ...(cols === undefined ? {} : { cols }),
    ...(rows === undefined ? {} : { rows }),
  });

  return { ptySessionId: info.id, command, args: [...args] };
}
