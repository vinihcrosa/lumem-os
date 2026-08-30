import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DomainError } from "../errors.js";

const run = promisify(execFile);

/** Long enough for `worktree add` on a big repo, short enough to not hang the daemon. */
export const DEFAULT_GIT_TIMEOUT_MS = 30_000;

export interface GitExecOptions {
  cwd: string;
  timeoutMs?: number;
  /**
   * Replaces the daemon's environment for this command.
   *
   * Only the commands that reach the network need it — a fetch has to run
   * where nothing can ask the user anything (F7.15). Everything else inherits
   * the environment below, which is already the right one.
   */
  env?: NodeJS.ProcessEnv;
}

export interface GitResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs one git command.
 *
 * Injectable as a whole so the service can be exercised without a repository —
 * though almost nothing is: `docs/project/testing.md` says git is never mocked,
 * because `git worktree` has edge cases around slashes in names and existing
 * branches that no double reproduces.
 */
export type GitExec = (args: readonly string[], options: GitExecOptions) => Promise<GitResult>;

export const execGit: GitExec = async (args, { cwd, timeoutMs = DEFAULT_GIT_TIMEOUT_MS, env }) => {
  try {
    const { stdout, stderr } = await run("git", [...args], {
      cwd,
      timeout: timeoutMs,
      // Paths with accents come back as café.ts instead of "caf\303\251.ts".
      // Nothing reads them as paths yet; the day something does, this is the
      // bug nobody would think to look for.
      env: {
        ...(env ?? process.env),
        // Without this a repository needing credentials hangs the daemon until
        // the timeout instead of failing with something readable.
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    throw asGitFailure(error, args);
  }
};

interface ExecFailure {
  stderr?: string;
  stdout?: string;
  message: string;
  killed?: boolean;
  code?: number | string;
}

/**
 * The PRD is explicit: git's error reaches the user literally, untranslated.
 *
 * So the message is git's own stderr whenever there is one. Only when git said
 * nothing — a timeout, a missing binary — does this supply words of its own.
 */
function asGitFailure(error: unknown, args: readonly string[]): DomainError {
  const failure = error as ExecFailure;
  const stderr = failure.stderr?.trim();

  if (failure.killed) {
    return new DomainError(
      "GIT_FAILED",
      `git ${args.join(" ")} não respondeu a tempo`,
      { cause: error },
    );
  }
  if (failure.code === "ENOENT") {
    return new DomainError("GIT_FAILED", "git não está instalado ou não está no PATH", {
      cause: error,
    });
  }

  return new DomainError("GIT_FAILED", stderr && stderr.length > 0 ? stderr : failure.message, {
    cause: error,
  });
}
