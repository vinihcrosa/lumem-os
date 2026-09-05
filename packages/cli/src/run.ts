import { fileURLToPath } from "node:url";

import { HELP, parseCommand } from "./args.js";
import { openInBrowser } from "./open.js";
import { probePort } from "./port.js";

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
  open?: typeof openInBrowser;
}

/** Where the bundled daemon sits, relative to `bin/lumem.mjs`. */
export const DAEMON_ENTRY = "../dist/server/main.mjs";

export async function run(argv: readonly string[], deps: RunDeps): Promise<number> {
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

  const port = command.port ?? Number(env["LUMEM_PORT"] ?? DEFAULT_PORT);
  const host = command.host ?? env["LUMEM_HOST"] ?? DEFAULT_HOST;
  const origin = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${String(port)}`;

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
