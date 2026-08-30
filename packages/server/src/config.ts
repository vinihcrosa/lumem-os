import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { DEFAULT_SERVER_PORT } from "@lumem/shared";

export interface ServerConfig {
  /** TCP port the HTTP server binds to. */
  port: number;
  /** Interface the HTTP server binds to. Loopback by default — this is a local daemon. */
  host: string;
  /** Root of all Lumem state on disk. */
  stateDir: string;
  /** SQLite database file. */
  databasePath: string;
  /**
   * Root of the tree that mirrors the product's hierarchy on disk, Q20.
   *
   * `<workspacesDir>/<workspace>/<projeto>/{repo,worktrees}` — the clone under
   * `repo/`, every worktree under `worktrees/`, for a project that was cloned
   * and for one that was registered by path alike. There is no second tree:
   * `worktreesDir` used to be one, and two trees describing one hierarchy is
   * how they drift.
   */
  workspacesDir: string;
  /**
   * One SQLite file per session, holding its whole conversation (F5.4, D10).
   *
   * Beside the registry rather than inside it: these are the only files here that
   * grow without a ceiling, and keeping them in their own directory is what makes
   * "archive last year" a directory listing instead of a query.
   */
  transcriptsDir: string;
  /**
   * Shell used for interactive sessions.
   *
   * The user's login shell, because a session that ignores their aliases and
   * prompt is a session they will not use.
   */
  shell: string;
  /**
   * Working directory for a session with no scope yet.
   *
   * Temporary: from T29 on, a session's cwd comes from the project or worktree
   * it belongs to. Until then the vertical slice needs *somewhere* to run.
   */
  defaultCwd: string;
  /**
   * A destilação de fim de sessão está ligada (workspace-memory §10).
   *
   * **Desligada por padrão**, e o PRD é explícito sobre o porquê: *"até o portão
   * provar que segura"*. É a única parte do sistema que gasta token sem você
   * pedir — uma sessão de agente por sessão de agente —, e ligar isso por default
   * seria dobrar o custo do produto numa linha de configuração que ninguém leu.
   */
  distill: boolean;
  /**
   * O auto-learn está ligado (§5.2 do context-delivery).
   *
   * **Desligado por padrão**, e por um motivo mais forte que o da destilação:
   * aqui uma pergunta passa a **criar memória**, sem você pedir e sem ninguém
   * revisar no momento. As contenções todas existem — evidência, portão, inbox —,
   * e mesmo assim o default é não.
   */
  autoLearn: boolean;
  /** Quantas perguntas de uma sessão podem subir agente. O orçamento do §5.4. */
  autoLearnBudget: number;
}

/** Only the variables this module reads. Keeps tests from touching process.env. */
export type ConfigEnv = Partial<
  Record<
    | "LUMEM_PORT"
    | "LUMEM_HOST"
    | "LUMEM_STATE_DIR"
    | "LUMEM_DB_PATH"
    | "LUMEM_DEFAULT_CWD"
    | "LUMEM_MEMORY_DISTILL"
    | "LUMEM_MEMORY_AUTO_LEARN"
    | "LUMEM_MEMORY_AUTO_LEARN_BUDGET"
    | "SHELL",
    string
  >
>;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_SERVER_PORT;

  // parseInt stops at the first invalid character, so "4317abc" and "80.9"
  // would both parse to something plausible-looking. Reject them outright.
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`LUMEM_PORT must be an integer between 0 and 65535, got: ${raw}`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed > 65535) {
    throw new Error(`LUMEM_PORT must be an integer between 0 and 65535, got: ${raw}`);
  }
  return parsed;
}

/**
 * `~` and relative paths, resolved against the daemon's own home and cwd.
 *
 * `LUMEM_STATE_DIR` is external input, and every path the daemon computes hangs
 * off it — including the ones it later deletes. A relative state dir would move
 * with the working directory the daemon happened to start from, and `~` written
 * literally is a directory named `~`, which is nobody's intent.
 */
function absoluteDir(raw: string): string {
  const expanded =
    raw === "~" || raw.startsWith("~/") ? join(homedir(), raw.slice(1)) : raw;
  return isAbsolute(expanded) ? join(expanded) : resolve(expanded);
}

/**
 * Reads configuration from an environment map.
 *
 * The map is a parameter rather than a direct `process.env` read so tests can
 * pass a literal instead of mutating (and having to restore) global state.
 */
/**
 * O orçamento de auto-learn por sessão.
 *
 * Valor ilegível cai no default em vez de estourar: o daemon não pode deixar de
 * subir por causa de um número torto numa variável opcional, e o default é
 * conservador — três perguntas por sessão.
 */
function readBudget(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return 3;
  return Number.parseInt(raw.trim(), 10);
}

export function loadConfig(env: ConfigEnv = process.env): ServerConfig {
  const stateDir = absoluteDir(env.LUMEM_STATE_DIR ?? join(homedir(), ".lumem"));
  return {
    port: readPort(env.LUMEM_PORT),
    host: env.LUMEM_HOST ?? "127.0.0.1",
    stateDir,
    databasePath: env.LUMEM_DB_PATH ?? join(stateDir, "lumem.db"),
    workspacesDir: join(stateDir, "workspaces"),
    transcriptsDir: join(stateDir, "transcripts"),
    // /bin/sh exists on every POSIX system this daemon can run on; SHELL is
    // unset under launchd and in some containers.
    shell: env.SHELL === undefined || env.SHELL === "" ? "/bin/sh" : env.SHELL,
    defaultCwd: env.LUMEM_DEFAULT_CWD ?? homedir(),
    // Só `1` e `true` ligam. Um valor que ninguém reconhece é um valor que
    // alguém digitou errado, e o lado seguro de "não entendi" é desligado.
    distill: env.LUMEM_MEMORY_DISTILL === "1" || env.LUMEM_MEMORY_DISTILL === "true",
    autoLearn: env.LUMEM_MEMORY_AUTO_LEARN === "1" || env.LUMEM_MEMORY_AUTO_LEARN === "true",
    autoLearnBudget: readBudget(env.LUMEM_MEMORY_AUTO_LEARN_BUDGET),
  };
}
