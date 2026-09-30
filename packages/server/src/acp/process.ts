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
  /** O pid do sistema, para o painel de recursos. Ausente num agente de mentira. */
  readonly pid?: number | undefined;
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
  /**
   * Variáveis que o processo **não** herda do daemon (`034` T5).
   *
   * Existe porque o `env` acima só acrescenta: a conta que sobe sem a variável
   * do CLI a receberia de volta do `process.env` de um daemon aberto num
   * terminal que a exportou — e subiria no diretório de outra conta.
   */
  unsetEnv?: readonly string[];
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
export function spawnAcpProcess({
  command,
  args,
  cwd,
  env,
  unsetEnv = [],
}: AcpSpawnRequest): AcpProcess {
  const merged: Record<string, string> = { ...(process.env as Record<string, string>), ...env };
  for (const name of unsetEnv) delete merged[name];
  const child = spawn(command, [...args], {
    cwd,
    env: merged,
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
    pid: child.pid,
    stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    exited,
    kill: (signal) => {
      child.kill(signal);
    },
  };
}

/** Um comando curto do próprio adaptador, fora do protocolo (`034` T6). */
export interface AcpCliRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
  unsetEnv?: readonly string[];
  timeoutMs: number;
}

export interface AcpCliResult {
  stdout: string;
  /** `null` quando o processo morreu por sinal ou pelo teto de tempo. */
  exitCode: number | null;
}

/**
 * Roda `<adaptador> --cli …` e devolve o que ele escreveu.
 *
 * É a conferência de conta do Claude (`--cli auth status`), e passa pelo mesmo
 * ambiente da conta que o `spawn` — o `unsetEnv` inclusive, pelo mesmo motivo.
 * O código de saída **não** decide nada aqui: o `auth status` deslogado sai com
 * erro e escreve o JSON que diz isso, e quem lê o JSON é quem decide.
 */
export function runCliProcess({
  command,
  args,
  cwd,
  env,
  unsetEnv = [],
  timeoutMs,
}: AcpCliRequest): Promise<AcpCliResult> {
  const merged: Record<string, string> = { ...(process.env as Record<string, string>), ...env };
  for (const name of unsetEnv) delete merged[name];

  return new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd, env: merged, stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), exitCode });
    };
    child.once("close", (code) => done(code));
    child.once("error", () => done(null));
  });
}
