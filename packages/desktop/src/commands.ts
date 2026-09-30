import { DEFAULT_SERVER_PORT, type DesktopConfig } from "@lumem/shared";

const DEFAULT_ORIGIN = `http://127.0.0.1:${String(DEFAULT_SERVER_PORT)}`;

export interface CommandsDeps {
  config: DesktopConfig;
  home: string;
  /** Roda e espera. @returns o código de saída. */
  exec(command: string, args: string[], env: Record<string, string>): Promise<number>;
}

export interface Commands {
  start(): Promise<number>;
  stop(): Promise<number>;
}

/**
 * Onde o daemon está, como o `lumem start` entende: só o que **não** é o padrão.
 *
 * Dizer o padrão explicitamente mudaria o arquivo de serviço que o `start` escreve, e o
 * próximo `lumem` sem verbo o veria como diferente do que roda e reiniciaria o daemon.
 */
function whereEnv(config: DesktopConfig, home: string): Record<string, string> {
  const env: Record<string, string> = {};
  const origin = new URL(config.origin);
  const defaults = new URL(DEFAULT_ORIGIN);
  if (origin.port !== defaults.port) env["LUMEM_PORT"] = origin.port;
  if (origin.hostname !== defaults.hostname) env["LUMEM_HOST"] = origin.hostname;
  if (config.stateDir !== `${home}/.lumem`) env["LUMEM_STATE_DIR"] = config.stateDir;
  return env;
}

/**
 * `Iniciar` e `Parar` (`038`, AC 64): o **mesmo** `lumem` que o CLI gravou, com o `node`
 * que o rodava. O app não procura nada no `PATH` — o que ele herda do Finder é
 * `/usr/bin:/bin`, e o `PATH` que o daemon precisa é o do terminal, que o CLI deixou no
 * arquivo para o `start` gravar de novo no serviço.
 */
export function createCommands({ config, home, exec }: CommandsDeps): Commands {
  const env = (): Record<string, string> => ({
    ...(process.env as Record<string, string>),
    ...(config.path === undefined ? {} : { PATH: config.path }),
    ...whereEnv(config, home),
  });
  return {
    start: () => exec(config.node, [config.lumem, "start"], env()),
    stop: () => exec(config.node, [config.lumem, "stop"], env()),
  };
}
