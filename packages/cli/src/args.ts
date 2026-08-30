import { parseArgs } from "node:util";

/**
 * What `lumem` was asked to do.
 *
 * A verb plus options, and not a bare set of flags, because the shape has to
 * survive the answer to D2: the daemon runs in the foreground today and will run
 * in the background later, and `lumem stop` needs a place to exist that does not
 * require re-teaching everyone the command they already know.
 */
export type Command =
  | { kind: "start"; port: number | null; host: string | null; stateDir: string | null; open: boolean }
  | { kind: "version" }
  | { kind: "help" }
  /** Refused before anything started. `message` is already user-facing. */
  | { kind: "invalid"; message: string };

export const HELP = `lumem — harness local de agentes de código

Uso:
  lumem [start] [opções]     sobe o daemon e serve a interface
  lumem version              imprime a versão
  lumem help                 imprime esta ajuda

Opções:
  -p, --port <porta>         porta do daemon (padrão: 4317)
      --host <endereço>      interface de escuta (padrão: 127.0.0.1)
      --state-dir <caminho>  onde o Lumem guarda tudo (padrão: ~/.lumem)
      --open                 abre o navegador quando subir
  -v, --version              o mesmo que \`lumem version\`
  -h, --help                 o mesmo que \`lumem help\`

O daemon escuta em 127.0.0.1 por padrão, e nada nele autentica: apontá-lo para
outra interface é publicar um shell na rede.`;

function toPort(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const port = Number.parseInt(raw.trim(), 10);
  return port >= 0 && port <= 65535 ? port : null;
}

export function parseCommand(argv: readonly string[]): Command {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        port: { type: "string", short: "p" },
        host: { type: "string" },
        "state-dir": { type: "string" },
        open: { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    // node's message already names the offending argument, which is the one
    // thing the reader needs and the one thing a generic "usage:" dump hides.
    return { kind: "invalid", message: error instanceof Error ? error.message : String(error) };
  }

  const { values, positionals } = parsed;
  if (values.help === true) return { kind: "help" };
  if (values.version === true) return { kind: "version" };

  const verb = positionals[0] ?? "start";
  if (positionals.length > 1) {
    return { kind: "invalid", message: `comando desconhecido: ${positionals.slice(1).join(" ")}` };
  }
  if (verb === "help") return { kind: "help" };
  if (verb === "version") return { kind: "version" };
  if (verb !== "start") return { kind: "invalid", message: `comando desconhecido: ${verb}` };

  const port = values.port === undefined ? null : toPort(values.port);
  if (values.port !== undefined && port === null) {
    return { kind: "invalid", message: `--port tem que ser um número entre 0 e 65535, e veio: ${values.port}` };
  }

  return {
    kind: "start",
    port,
    host: values.host ?? null,
    stateDir: values["state-dir"] ?? null,
    open: values.open === true,
  };
}
