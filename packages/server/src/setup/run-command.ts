import { execFile } from "node:child_process";

/**
 * A command's output, or why there is none.
 *
 * This never throws, and that is the whole design. Everything that calls it is a
 * *check*, and a check that can explode is a check that takes the screen down
 * with it — the preflight exists precisely for the machine where something is
 * wrong, so its own failure mode has to be a value.
 */
export interface CommandOutcome {
  ok: boolean;
  /** `stdout` when there is any, `stderr` otherwise — several CLIs use the latter. */
  output: string;
  /** Set when the command could not run or did not finish. */
  failure: string | null;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<CommandOutcome>;

/** Long enough for a `--version`, short enough that a hung binary is not a hung screen. */
export const DEFAULT_VERSION_TIMEOUT_MS = 3_000;

export const runCommand: CommandRunner = (command, args, { timeoutMs = DEFAULT_VERSION_TIMEOUT_MS } = {}) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = (stdout.trim() !== "" ? stdout : stderr).trim();

        if (error === null) {
          resolve({ ok: true, output, failure: null });
          return;
        }

        // A binary that answers `--version` on stderr and exits non-zero is
        // still a binary that answered. The caller decides whether the text is
        // useful; this only reports what happened.
        const killed = (error as { killed?: boolean }).killed === true;
        resolve({
          ok: false,
          output,
          failure: killed ? `não respondeu em ${timeoutMs} ms` : error.message,
        });
      },
    );
  });
