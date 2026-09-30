import { realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HELP, parseCommand, type Command, type Where } from "./args.js";
import { lastLines, logs } from "./logs.js";
import { openInBrowser } from "./open.js";
import { probePort, readHealth } from "./port.js";
import {
  START_TIMEOUT_MS,
  daemonLogPath,
  installService,
  isCurrent,
  isLoaded,
  nodeServiceHost,
  serviceIdentity,
  stopService,
  waitUntil,
  type ServiceHost,
  type ServiceSpec,
} from "./service.js";
import { upgrade as runUpgrade } from "./upgrade.js";

/** Mirrors `DEFAULT_SERVER_PORT` in @lumem/shared, which the bundle also carries. */
const DEFAULT_PORT = 4317;
const DEFAULT_HOST = "127.0.0.1";

export interface RunDeps {
  /** Written to; never `console.log`, so tests read a string instead of a spy. */
  out: (line: string) => void;
  err: (line: string) => void;
  env: NodeJS.ProcessEnv;
  version: string;
  /**
   * Starts the daemon **in this process**.
   *
   * An import, not a child process: `dist/server/main.mjs` reads its whole
   * configuration from the environment and installs its own signal handlers, so
   * spawning a child would only add a process whose job is to forward signals to
   * the one that already knows how to shut down.
   */
  startDaemon?: () => Promise<void>;
  probe?: typeof probePort;
  /** O `/trpc/health` inteiro, para o `status`; o `probe` só diz quem está na porta. */
  health?: typeof readHealth;
  /** O sistema (launchctl, systemctl, disco, relógio). A máquina de verdade por padrão. */
  service?: ServiceHost;
  /** Quando abortado, `logs -f` para. Por padrão, o SIGINT ou o SIGTERM. */
  interrupt?: AbortSignal;
  open?: typeof openInBrowser;
  upgrade?: typeof runUpgrade;
}

/** Where the bundled daemon sits, relative to `bin/lumem.mjs`. */
export const DAEMON_ENTRY = "../dist/server/main.mjs";

export async function run(argv: readonly string[], deps: RunDeps): Promise<number> {
  const { out, err, env, version } = deps;

  const command = parseCommand(argv);

  if (command.kind === "help") {
    out(HELP);
    return 0;
  }
  if (command.kind === "version") {
    out(version);
    return 0;
  }
  if (command.kind === "invalid") {
    err(command.message);
    err("`lumem help` lista o que existe.");
    return 2;
  }

  const probe = deps.probe ?? probePort;

  if (command.kind === "upgrade") {
    // No daemon is started, and none is stopped: the upgrade rewrites files on
    // disk, and a daemon already running is told so at the end.
    return await (deps.upgrade ?? runUpgrade)({
      out,
      err,
      current: version,
      check: command.check,
      origin: originOf(Number(env["LUMEM_PORT"] ?? DEFAULT_PORT), env["LUMEM_HOST"] ?? DEFAULT_HOST),
      probe,
    });
  }

  if (command.kind === "run") return await runForeground(command, deps);

  // Do serviço para baixo, o sistema entra por `ServiceHost`.
  const host = deps.service ?? nodeServiceHost(env, ownPath());
  const where = resolveWhere(command, env, host.home);

  switch (command.kind) {
    case "start":
      return await start(command, deps, host, where);
    case "stop":
      return await stop(deps, host, where);
    case "status":
      return await status(deps, where);
    case "logs":
      return await logs({
        path: daemonLogPath(where.stateDir),
        follow: command.follow,
        out,
        err,
        interrupt: deps.interrupt ?? (command.follow ? untilInterrupted() : new AbortController().signal),
        sleep: host.sleep,
      });
  }
}

/**
 * Só o `logs -f` escuta o sinal: `lumem start` esperando o health, ou o `run`,
 * que tem os handlers do daemon, morreriam com o padrão do Node — e um listener
 * a mais aqui os deixaria imortais.
 */
function untilInterrupted(): AbortSignal {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      controller.abort();
    });
  }
  return controller.signal;
}

function originOf(port: number, host: string): string {
  return `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${String(port)}`;
}

/** O `bin/lumem.mjs` de verdade, já sem o symlink que o gerenciador de pacote põe no PATH. */
function ownPath(): string {
  const invoked = process.argv[1] ?? "";
  try {
    return realpathSync(invoked);
  } catch {
    return invoked;
  }
}

interface Resolved {
  port: number;
  host: string;
  origin: string;
  stateDir: string;
  /** O que a pessoa pediu explicitamente — flag ou ambiente — e que o serviço tem de levar. */
  requested: Record<string, string>;
}

/**
 * Onde o Lumem está, pelas mesmas três respostas de sempre: flag, ambiente, padrão.
 *
 * O state dir segue o que o daemon faz com `LUMEM_STATE_DIR` (`~` e caminho
 * relativo resolvidos): o log que o `lumem logs` procura tem de ser o que o
 * serviço escreve.
 */
function resolveWhere(command: Where, env: NodeJS.ProcessEnv, home: string): Resolved {
  const port = command.port ?? Number(env["LUMEM_PORT"] ?? DEFAULT_PORT);
  const host = command.host ?? env["LUMEM_HOST"] ?? DEFAULT_HOST;
  const rawStateDir = command.stateDir ?? env["LUMEM_STATE_DIR"];

  const requested: Record<string, string> = {};
  if (command.port !== null || env["LUMEM_PORT"] !== undefined) requested["LUMEM_PORT"] = String(port);
  if (command.host !== null || env["LUMEM_HOST"] !== undefined) requested["LUMEM_HOST"] = host;
  const stateDir = absolute(rawStateDir ?? join(home, ".lumem"), home);
  if (rawStateDir !== undefined) requested["LUMEM_STATE_DIR"] = stateDir;

  return { port, host, origin: originOf(port, host), stateDir, requested };
}

function absolute(raw: string, home: string): string {
  const expanded = raw === "~" || raw.startsWith("~/") ? join(home, raw.slice(1)) : raw;
  return isAbsolute(expanded) ? join(expanded) : resolve(expanded);
}

/** `lumem run`: o daemon **neste processo**, como `lumem` foi até a 038. */
async function runForeground(
  command: Extract<Command, { kind: "run" }>,
  deps: RunDeps,
): Promise<number> {
  const {
    out,
    err,
    env,
    version,
    startDaemon = async () => {
      await import(fileURLToPath(new URL(DAEMON_ENTRY, import.meta.url)));
    },
    probe = probePort,
    open = openInBrowser,
  } = deps;

  const port = command.port ?? Number(env["LUMEM_PORT"] ?? DEFAULT_PORT);
  const host = command.host ?? env["LUMEM_HOST"] ?? DEFAULT_HOST;
  const origin = originOf(port, host);

  const occupant = await probe({ origin });
  if (occupant.kind === "lumem") {
    // Not an error: what the person wanted is already running, and starting a
    // second daemon on the same ~/.lumem would put two writers on one SQLite
    // file. Say where it is, and open it if that is what was asked.
    out(`já tem um Lumem em ${origin} (v${occupant.version})`);
    if (command.open) open({ url: origin });
    return 0;
  }
  if (occupant.kind === "other") {
    err(`a porta ${String(port)} está ocupada por outra coisa. Use \`lumem --port <outra>\`.`);
    return 1;
  }

  // Set before the import, because the daemon reads its configuration at module
  // load and never again.
  env["LUMEM_PORT"] = String(port);
  env["LUMEM_HOST"] = host;
  if (command.stateDir !== null) env["LUMEM_STATE_DIR"] = command.stateDir;

  out(`Lumem v${version} — ${origin}`);
  await startDaemon();

  if (command.open) open({ url: origin });
  return 0;
}

/** Quantas linhas do log `lumem start` mostra quando o daemon não sobe. */
const START_FAILURE_LOG_LINES = 20;

/**
 * `lumem start`: escreve o serviço de agora, carrega, e só volta quando o
 * `/trpc/health` responde — sair 0 antes disso seria dizer "subiu" de um daemon
 * que pode ter morrido no primeiro import.
 */
async function start(
  command: Extract<Command, { kind: "start" }>,
  deps: RunDeps,
  host: ServiceHost,
  where: Resolved,
): Promise<number> {
  const { out, err, env } = deps;
  const probe = deps.probe ?? probePort;
  const open = deps.open ?? openInBrowser;
  const spec: ServiceSpec = {
    ...serviceIdentity(env),
    stateDir: where.stateDir,
    env: where.requested,
  };

  const occupant = await probe({ origin: where.origin });
  if (occupant.kind === "other") {
    err(`a porta ${String(where.port)} está ocupada por outra coisa. Use \`lumem start --port <outra>\`.`);
    return 1;
  }
  if (occupant.kind === "lumem") {
    if (!(await isLoaded(host, spec))) {
      err(
        `outro Lumem (v${occupant.version}) roda fora do serviço em ${where.origin}. ` +
          "Pare-o (Ctrl-C no terminal do `lumem run`) e rode `lumem start` de novo, ou use --port.",
      );
      return 1;
    }
    if (isCurrent(host, spec)) {
      // `lumem` sem verbo é `start`: quem digita para abrir o Lumem não pediu
      // para reiniciá-lo, e reiniciar derrubaria as sessões.
      out(`o Lumem já roda como serviço em ${where.origin} (v${occupant.version})`);
      if (command.open) open({ url: where.origin });
      return 0;
    }
    out("o arquivo do serviço mudou (PATH, node ou lumem); reiniciando o serviço.");
  }

  const installed = await installService(host, spec);
  if (!installed.ok) {
    err(installed.reason);
    return 1;
  }

  let running = "?";
  const answered = await waitUntil(
    host,
    async () => {
      const now = await probe({ origin: where.origin });
      if (now.kind === "lumem") running = now.version;
      return now.kind === "lumem";
    },
    START_TIMEOUT_MS,
  );
  if (!answered) {
    reportStartFailure(deps, host, where);
    return 1;
  }

  out(`Lumem v${running} rodando como serviço — ${where.origin}`);
  out("`lumem logs` mostra o log; `lumem stop` para o serviço.");
  if (command.open) open({ url: where.origin });
  return 0;
}

function reportStartFailure(deps: RunDeps, host: ServiceHost, where: Resolved): void {
  const { err } = deps;
  const path = daemonLogPath(where.stateDir);
  err(`o Lumem não respondeu em ${where.origin} em ${String(START_TIMEOUT_MS / 1_000)} s.`);
  const log = host.read(path);
  if (log === null) {
    err(`(sem log em ${path})`);
    return;
  }
  err(`últimas linhas de ${path}:`);
  for (const line of lastLines(log, START_FAILURE_LOG_LINES)) err(line);
}

async function stop(deps: RunDeps, host: ServiceHost, where: Resolved): Promise<number> {
  const { out, err, env } = deps;
  const probe = deps.probe ?? probePort;
  const spec: ServiceSpec = { ...serviceIdentity(env), stateDir: where.stateDir, env: {} };

  const result = await stopService(
    host,
    spec,
    async () => (await probe({ origin: where.origin })).kind === "lumem",
  );
  if (!result.ok) {
    err(result.reason);
    return 1;
  }
  out("Lumem parado.");
  return 0;
}

async function status(deps: RunDeps, where: Resolved): Promise<number> {
  const { out } = deps;
  const health = await (deps.health ?? readHealth)({ origin: where.origin });
  if (health.kind === "lumem") {
    const how = health.supervised ? "supervisionado" : "em primeiro plano";
    out(`rodando · v${health.version} · ${where.origin} · ${how}`);
    return 0;
  }
  const stranger = health.kind === "other" ? " · a porta responde, mas não é um Lumem" : "";
  out(`parado · ${where.origin}${stranger}`);
  return 3;
}
