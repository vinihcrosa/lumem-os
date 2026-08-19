import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

import { DomainError } from "../errors.js";

/**
 * The subprocess seam.
 *
 * `AcpManager` never touches `child_process` directly, and that is not for
 * testability alone: the SDK's `ndJsonStream` speaks web streams, so *something*
 * has to adapt Node's stdio either way. Naming that adapter makes it the one
 * place a fake agent can take the real one's place — and a fake the manager
 * could detect would only ever test the fake.
 */

export interface AcpProcess {
  /** Where the client writes. The agent's stdin. */
  readonly stdin: WritableStream<Uint8Array>;
  /** Where the client reads. The agent's stdout. */
  readonly stdout: ReadableStream<Uint8Array>;
  /** Resolves when the process is gone, however it went. */
  readonly exited: Promise<{ exitCode: number | null; signal: string | null }>;
  kill(signal?: NodeJS.Signals): void;
}

export interface AcpSpawnRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
}

export type AcpProcessSpawner = (request: AcpSpawnRequest) => AcpProcess;

/**
 * Spawns the adapter as a child of the daemon.
 *
 * `stderr` is inherited rather than piped. An adapter that dies on a stack
 * trace should print it where the daemon's own log goes — piping it means
 * someone has to remember to drain the pipe, and a full stderr buffer blocks
 * the child, which looks exactly like a hung agent.
 */
export function spawnAcpProcess({ command, args, cwd, env }: AcpSpawnRequest): AcpProcess {
  const child = spawn(command, [...args], {
    cwd,
    env: { ...(process.env as Record<string, string>), ...env },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const exited = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
    // `error` fires instead of `exit` when the binary does not exist. Without
    // this the promise never settles and the session hangs forever, looking
    // like an agent that simply never answers.
    child.once("error", () => resolve({ exitCode: null, signal: null }));
  });

  if (!child.stdin || !child.stdout) {
    throw new DomainError("SPAWN_FAILED", `${command} started without a usable stdio pipe`);
  }

  return {
    stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    exited,
    kill: (signal) => {
      child.kill(signal);
    },
  };
}
