import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { DEFAULT_SERVER_PORT, DEFAULT_WEB_PORT, isLoopbackHost } from "@lumem/shared";

import { parseWebOrigins } from "./auth/origin-policy.js";

import { parsePortRange, type PortRange } from "./scripts/ports.js";

export interface ServerConfig {
  /** TCP port the HTTP server binds to. */
  port: number;
  /**
   * Interface the HTTP server binds to. Loopback, and only loopback (S5).
   *
   * Until the daemon authenticates who talks to it (daemon-auth, phase 2), a
   * non-loopback host is refused at load time rather than accepted with a
   * warning: `lumem --host 0.0.0.0` was a shell published on the network, one
   * argument away, with no credential in front of it.
   */
  host: string;
  /**
   * Browser origins, besides the daemon's own, allowed to drive it (F2).
   *
   * The daemon serves the web on its own port, so in production the only origin
   * is its own and this list adds nothing. It exists for development, where vite
   * is a second origin — the default is the dev server's default port, and
   * `scripts/workspace/run.sh` exports the port it actually chose.
   */
  webOrigins: readonly string[];
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
  /**
   * Onde está o web construído, quando não é o lugar de sempre.
   *
   * Quase sempre `null`: o daemon empacotado acha o `dist/web` ao lado de si
   * mesmo, e rodando do código-fonte não existe nenhum — é o vite que serve.
   * A variável existe para quem serve um build de outro lugar (um bisect entre
   * duas versões do web, um bundle servido de fora do pacote).
   */
  webRoot: string | null;
  /** Quantas perguntas de uma sessão podem subir agente. O orçamento do §5.4. */
  autoLearnBudget: number;
  /**
   * De onde saem as portas que cada checkout reserva para rodar (S5).
   *
   * Configurável porque a faixa boa depende da máquina — quem tem um serviço
   * corporativo morando nos 45000 precisa de outra —, e um default que não dá para
   * mudar vira um bug que só aparece na máquina de alguém.
   */
  runPortRange: PortRange;
}

/** Only the variables this module reads. Keeps tests from touching process.env. */
export type ConfigEnv = Partial<
  Record<
    | "LUMEM_PORT"
    | "LUMEM_HOST"
    | "LUMEM_WEB_ORIGINS"
    | "LUMEM_STATE_DIR"
    | "LUMEM_DB_PATH"
    | "LUMEM_DEFAULT_CWD"
    | "LUMEM_WEB_ROOT"
    | "LUMEM_MEMORY_DISTILL"
    | "LUMEM_MEMORY_AUTO_LEARN"
    | "LUMEM_MEMORY_AUTO_LEARN_BUDGET"
    | "LUMEM_RUN_PORT_RANGE"
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
 * S5: a bind address that is not this machine does not start the daemon.
 *
 * The sentence names the phase that will lift this, because the refusal takes a
 * capability away — the one of exposing yourself by mistake — and the person
 * reading it deserves to know it is temporary.
 */
function readHost(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "127.0.0.1";
  const host = raw.trim();
  if (!isLoopbackHost(host)) {
    throw new Error(
      `LUMEM_HOST=${host} não é loopback. Até o daemon autenticar quem fala com ele ` +
        "(daemon-auth, fase 2), ele só escuta em 127.0.0.1, localhost ou ::1.",
    );
  }
  return host;
}

const DEFAULT_WEB_ORIGINS: readonly string[] = [
  `http://127.0.0.1:${String(DEFAULT_WEB_PORT)}`,
  `http://localhost:${String(DEFAULT_WEB_PORT)}`,
];

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
    host: readHost(env.LUMEM_HOST),
    webOrigins: parseWebOrigins(env.LUMEM_WEB_ORIGINS, DEFAULT_WEB_ORIGINS),
    stateDir,
    databasePath: env.LUMEM_DB_PATH ?? join(stateDir, "lumem.db"),
    workspacesDir: join(stateDir, "workspaces"),
    transcriptsDir: join(stateDir, "transcripts"),
    // /bin/sh exists on every POSIX system this daemon can run on; SHELL is
    // unset under launchd and in some containers.
    shell: env.SHELL === undefined || env.SHELL === "" ? "/bin/sh" : env.SHELL,
    defaultCwd: env.LUMEM_DEFAULT_CWD ?? homedir(),
    webRoot:
      env.LUMEM_WEB_ROOT === undefined || env.LUMEM_WEB_ROOT === ""
        ? null
        : absoluteDir(env.LUMEM_WEB_ROOT),
    // Só `1` e `true` ligam. Um valor que ninguém reconhece é um valor que
    // alguém digitou errado, e o lado seguro de "não entendi" é desligado.
    distill: env.LUMEM_MEMORY_DISTILL === "1" || env.LUMEM_MEMORY_DISTILL === "true",
    autoLearn: env.LUMEM_MEMORY_AUTO_LEARN === "1" || env.LUMEM_MEMORY_AUTO_LEARN === "true",
    autoLearnBudget: readBudget(env.LUMEM_MEMORY_AUTO_LEARN_BUDGET),
    runPortRange: parsePortRange(env.LUMEM_RUN_PORT_RANGE),
  };
}
