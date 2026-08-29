import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";

import { DomainError } from "../errors.js";
import { execGit } from "./exec.js";

/**
 * Running one `git clone`, with progress, cancellation and cleanup.
 *
 * `spawn` rather than the buffered `execFile` of `exec.ts`, for three reasons
 * that all come from the same fact — a clone is long:
 *
 * - `DEFAULT_GIT_TIMEOUT_MS` is thirty seconds, which kills a legitimate clone;
 * - there is no progress to show while a buffer is still filling;
 * - `maxBuffer` is a ceiling a hostile server chooses when to hit.
 *
 * Nothing here touches the database or the job store. This is the process and
 * only the process, so it can be diagnosed without tRPC in the way.
 */

export type ClonePhase =
  | "connecting"
  | "counting"
  | "compressing"
  | "receiving"
  | "resolving"
  | "checkout";

/** Which kind of failure it was. Only `auth` has a flow of its own, F6.10. */
export type CloneFailure = "auth" | "network" | "refused" | "git" | "internal";

export interface CloneProgress {
  phase: ClonePhase | null;
  /** 0–100, or null when the phase has no percentage to give. */
  percent: number | null;
  /** git's last line, cleaned and truncated. */
  message: string | null;
}

export class CloneError extends DomainError {
  constructor(
    readonly failure: CloneFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(failure === "internal" ? "BLOCKED" : "GIT_FAILED", message, options);
    this.name = "CloneError";
  }
}

export interface CloneOptions {
  /**
   * The address as pasted, credentials included.
   *
   * This is the one place a secret is allowed to travel, and it goes no further
   * than one process's argv. Everything reported back carries `url` instead.
   */
  rawUrl: string;
  /** Sanitized. What `origin` is left pointing at when the clone is done. */
  url: string;
  /** Where the repository ends up. */
  targetPath: string;
  /** Sibling of the target, so the final `rename` stays on one filesystem. */
  tempPath: string;
  onProgress?: (progress: CloneProgress) => void;
  /** Aborting kills the process and removes the temporary directory. */
  signal?: AbortSignal;
  /** How long git may say nothing before it is considered stuck. */
  silenceMs?: number;
  /** Injected only so a test can prove what is composed onto it. */
  env?: NodeJS.ProcessEnv;
}

/** No total timeout: a 4 GiB monorepo on hotel wifi is slow, not stuck. */
export const DEFAULT_SILENCE_MS = 120_000;

/** How long a killed git gets to finish writing a packfile before SIGKILL. */
const SIGKILL_GRACE_MS = 5_000;

/** A hostile server can print for as long as it likes; memory cannot. */
const STDERR_RING_BYTES = 64 * 1024;

/** One line of remote-controlled text is not a paragraph. */
const MAX_LINE = 500;

export async function cloneRepository(options: CloneOptions): Promise<void> {
  const { targetPath, tempPath } = options;
  try {
    await runClone(options);
    await rewriteOrigin(options);
    // The instant the repository starts existing for anyone looking. Atomic
    // because the temporary is its sibling, so this never crosses a filesystem.
    await rename(tempPath, targetPath);
  } catch (error) {
    // The temporary is the only thing on disk between the start and the end,
    // and §8 is explicit that a creation which fails leaves nothing behind.
    await rm(tempPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * The argv, spelled out because every piece of it is load-bearing.
 *
 * - `protocol.allow=never` plus four `always` closes everything the allowlist
 *   did not open — including what a **redirect** from an https server tries to
 *   open after the process has already started. `parseGitUrl` validates what
 *   was pasted; this validates what the server answers.
 * - `--` separates options from arguments. U2 already refuses a URL starting
 *   with a dash; the two defences cost one argv token.
 * - `--no-recurse-submodules` is the default, and is written anyway: a
 *   submodule's URL comes from the remote repository's `.gitmodules`, which is
 *   chosen by whoever controls the repository rather than by whoever pasted the
 *   address. Same class of problem as `ext::`, different owner.
 */
function cloneArgs(rawUrl: string, tempPath: string): string[] {
  return [
    "-c",
    "protocol.allow=never",
    "-c",
    "protocol.https.allow=always",
    "-c",
    "protocol.http.allow=always",
    "-c",
    "protocol.ssh.allow=always",
    "-c",
    "protocol.file.allow=always",
    "clone",
    "--progress",
    "--no-recurse-submodules",
    "--",
    rawUrl,
    tempPath,
  ];
}

/**
 * An environment in which nothing can ask the user anything.
 *
 * A daemon has nobody to ask. Every interactive prompt turns into a process
 * that hangs until the silence timeout, and a timeout is a worse message than
 * the truth was.
 *
 * `GIT_SSH_COMMAND` is **composed** rather than overwritten: whoever runs a
 * self-hosted git server often already has one there with `-i` and `-p`.
 * `BatchMode=yes` does not loosen host verification — it stays the user's own
 * `known_hosts`. It only trades *asking* for *failing out loud*.
 */
export function cloneEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const ssh = base["GIT_SSH_COMMAND"]?.trim();
  return {
    ...base,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_SSH_COMMAND: `${ssh === undefined || ssh === "" ? "ssh" : ssh} -o BatchMode=yes`,
  };
}

function runClone({
  rawUrl,
  tempPath,
  onProgress,
  signal,
  silenceMs = DEFAULT_SILENCE_MS,
  env,
}: CloneOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", cloneArgs(rawUrl, tempPath), {
      env: cloneEnv(env),
      stdio: ["ignore", "ignore", "pipe"],
    });

    const errors = new Ring(STDERR_RING_BYTES);
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const silence = new SilenceTimer(silenceMs, () => {
      // Not a total timeout: this fires on a hung DNS lookup, a TCP connection
      // that never closes, a server that accepted and vanished — never on
      // someone who is merely slow.
      finish(new CloneError("network", `git ficou ${Math.round(silenceMs / 1000)}s sem responder`));
      kill();
    });

    /** SIGTERM, then SIGKILL: killing outright leaves git mid-packfile. */
    function kill(): void {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), SIGKILL_GRACE_MS);
      killTimer.unref?.();
    }

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      silence.stop();
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    }

    function onAbort(): void {
      finish(new CloneError("internal", "clone cancelado"));
      kill();
    }

    if (signal?.aborted) {
      child.kill("SIGKILL");
      finish(new CloneError("internal", "clone cancelado"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    const reader = new ProgressReader((progress) => {
      silence.touch();
      onProgress?.(progress);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      errors.push(chunk);
      reader.push(chunk.toString("utf8"));
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(
        error.code === "ENOENT"
          ? new CloneError("internal", "git não está instalado ou não está no PATH", {
              cause: error,
            })
          : new CloneError("internal", error.message, { cause: error }),
      );
    });

    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (code === 0) return finish();
      const stderr = errors.text();
      finish(new CloneError(classify(stderr), lastMeaningfulLine(stderr) || `git saiu com ${code}`));
    });
  });
}

/**
 * Points `origin` at the address without the credential, §4.3.
 *
 * `git clone` writes the URL it was given into `.git/config` verbatim. A token
 * pasted into the address would sit there in plain text, inside the repository
 * — which is the worst place it could be, because that is the file the agent
 * reads. Runs before the `rename`, so the credential never exists at the final
 * path at all.
 */
async function rewriteOrigin({ rawUrl, url, tempPath }: CloneOptions): Promise<void> {
  if (rawUrl === url) return;
  await execGit(["remote", "set-url", "origin", url], { cwd: tempPath });
}

/**
 * Which kind of failure git reported.
 *
 * Only `auth` needs to be told apart with any care, because it is the only one
 * with a screen of its own (F6.10) — and it is the most common failure there
 * is. `terminal prompts disabled` belongs here rather than under a category of
 * its own: it is what §4.2 produces when git wanted to ask for a password.
 *
 * A failed host key check is filed here too. It is not a credential problem,
 * but it is an ssh problem, and the screen shows git's own sentence — which
 * names `known_hosts` and is more use than any category name would be.
 */
export function classify(stderr: string): CloneFailure {
  if (
    /authentication failed|could not read username|could not read password|invalid username or password|permission denied \(publickey|terminal prompts disabled|host key verification failed/i.test(
      stderr,
    )
  ) {
    return "auth";
  }
  if (/connection refused/i.test(stderr)) return "refused";
  if (
    /could not resolve host|couldn't connect to server|connection timed out|operation timed out|network is unreachable|no route to host/i.test(
      stderr,
    )
  ) {
    return "network";
  }
  return "git";
}

/** The last line worth showing: git's final `fatal:` beats its progress noise. */
function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split(/[\r\n]+/)
    .map((line) => clean(line))
    .filter((line) => line !== "");
  const fatal = lines.filter((line) => /^(fatal|error):/i.test(line)).at(-1);
  return fatal ?? lines.at(-1) ?? "";
}

/**
 * Text the remote server chose, made safe to put on a screen, §4.5.
 *
 * `remote: …` lines are written by whoever runs the other end. They are shown
 * as text and never as markup, and they arrive here first: escape sequences and
 * control bytes out, length capped.
 */
export function clean(line: string): string {
  const stripped = line
    // CSI and the rest of the ANSI zoo.
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return stripped.length > MAX_LINE ? `${stripped.slice(0, MAX_LINE)}…` : stripped;
}

const PHASES: Array<[RegExp, ClonePhase]> = [
  [/^cloning into/i, "connecting"],
  [/enumerating objects|counting objects/i, "counting"],
  [/compressing objects/i, "compressing"],
  [/receiving objects/i, "receiving"],
  [/resolving deltas/i, "resolving"],
  [/updating files|checking out files/i, "checkout"],
];

export function phaseOf(line: string): ClonePhase | null {
  for (const [pattern, phase] of PHASES) if (pattern.test(line)) return phase;
  return null;
}

export function percentOf(line: string): number | null {
  const match = /(\d{1,3})%/.exec(line);
  if (!match) return null;
  return Math.min(100, Number(match[1]));
}

/**
 * git's progress, split into lines.
 *
 * Both `\r` and `\n`, because git uses both: a percentage counting up rewrites
 * one line with carriage returns, and a phase that finishes ends with a
 * newline. Splitting on `\n` alone would deliver one enormous line per phase,
 * at the end — which is exactly when it stops being progress.
 */
export class ProgressReader {
  private buffer = "";
  private phase: ClonePhase | null = null;

  constructor(private readonly emit: (progress: CloneProgress) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const parts = this.buffer.split(/[\r\n]/);
    this.buffer = parts.pop() ?? "";
    for (const part of parts) this.line(part);
  }

  private line(raw: string): void {
    const message = clean(raw);
    if (message === "") return;
    this.phase = phaseOf(message) ?? this.phase;
    this.emit({ phase: this.phase, percent: percentOf(message), message });
  }
}

/** The last N bytes of a stream nobody on this end controls the size of. */
export class Ring {
  private chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.limit && this.chunks.length > 1) {
      this.size -= this.chunks.shift()!.length;
    }
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  get bytes(): number {
    return this.size;
  }
}

/** Fires when nothing has been heard for a while. Reset by every line. */
export class SilenceTimer {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ms: number,
    private readonly onSilence: () => void,
  ) {
    this.touch();
  }

  touch(): void {
    this.stop();
    this.timer = setTimeout(this.onSilence, this.ms);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
