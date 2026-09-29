import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Where the daemon's log goes when `LUMEM_LOG_FILE` is set: the file **and**
 * stdout (T11 of docs/features/024-dev-harness/tasks.md).
 *
 * Before this, the Fastify logger was on and structured and went only to stdout:
 * an agent that had not started the daemon could not ask it what it did, and a
 * runtime bug needed a person reading the `pnpm dev` terminal. The log does not
 * **leave** the terminal — it now exists in both places.
 *
 * One `.1` is kept past `maxBytes`, with no new dependency. The writes are
 * synchronous on purpose: this is the development daemon's request log, and a
 * line that is lost when the process dies is the line that explained the death.
 */
export const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024;

export interface LogSink {
  write(line: string): void;
}

export interface LogSinkOptions {
  file: string;
  maxBytes?: number;
  /** Where the copy goes. `process.stdout` in the daemon, a stub in tests. */
  echo?: { write(line: string): unknown };
}

export function createLogSink({ file, maxBytes = DEFAULT_MAX_LOG_BYTES, echo = process.stdout }: LogSinkOptions): LogSink {
  mkdirSync(dirname(file), { recursive: true });
  let size = existsSync(file) ? statSync(file).size : 0;
  return {
    write(line: string): void {
      echo.write(line);
      const bytes = Buffer.byteLength(line);
      if (size > 0 && size + bytes > maxBytes) {
        renameSync(file, `${file}.1`);
        size = 0;
      }
      appendFileSync(file, line);
      size += bytes;
    },
  };
}
