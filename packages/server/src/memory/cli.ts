import { loadConfig, type ConfigEnv } from "../config.js";
import { openDatabase } from "../db/index.js";
import { DomainError } from "../errors.js";

import { MemoryService } from "./MemoryService.js";
import { MEMORY_TYPES, type MemoryActor, type MemoryScope, type MemoryType } from "./entry.js";
import { ensureMemoryHome } from "./home.js";

/**
 * A superfície mínima da T7: escrever, ler, listar, reindexar.
 *
 * Linha de comando primeiro, e não por acaso. A PR 03 vai expor as **mesmas**
 * funções por MCP, e o princípio de paridade do estudo do Compozy diz que as
 * duas superfícies chamam o mesmo núcleo com o mesmo contrato de erro. Começar
 * pela CLI é o que garante que o núcleo exista antes das superfícies — e é o
 * que permite inspecionar a memória sem subir o daemon.
 *
 * Ainda **sem portão**: o scan, o WAL e a inbox são a PR 02. Por isso nada aqui
 * está exposto a agente nenhum; quem chama é você.
 */

const USAGE = `uso: lumem-memory <comando>

  write   --name <n> --type <t> [--description <d>] [--body <texto>]
          [--scope <global|workspace|project>] [--workspace <id>] [--project <id>]
          [--actor <human|agent|distiller|auto_research|import>]
  read    --name <n> --type <t> [--scope ...] [--workspace <id>] [--project <id>]
  list
  reindex

tipos: ${MEMORY_TYPES.join(", ")}
`;

interface Flags {
  [key: string]: string | undefined;
}

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || !token.startsWith("--")) continue;
    const next = argv[index + 1];
    flags[token.slice(2)] = next !== undefined && !next.startsWith("--") ? next : "true";
    if (next !== undefined && !next.startsWith("--")) index += 1;
  }
  return flags;
}

function required(flags: Flags, name: string): string {
  const value = flags[name];
  if (value === undefined) throw new DomainError("INVALID_ARGUMENT", `--${name} é obrigatório`);
  return value;
}

function asType(value: string): MemoryType {
  if (!(MEMORY_TYPES as readonly string[]).includes(value)) {
    throw new DomainError("INVALID_ARGUMENT", `tipo inválido: ${value}. Um de: ${MEMORY_TYPES.join(", ")}`);
  }
  return value as MemoryType;
}

export interface MemoryCliIo {
  /** Injetáveis para o teste não ter que capturar `process.stdout` global. */
  out?: (text: string) => void;
  err?: (text: string) => void;
  /** O ambiente lido pelo `loadConfig` — parâmetro, e não `process.env`, pelo mesmo motivo. */
  env?: ConfigEnv;
}

export async function runMemoryCli(
  argv: readonly string[],
  { out = (text) => process.stdout.write(text), err = (text) => process.stderr.write(text), env }: MemoryCliIo = {},
): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    out(USAGE);
    return command === undefined ? 1 : 0;
  }

  const flags = parseFlags(rest);
  const config = loadConfig(env);
  await ensureMemoryHome({ stateDir: config.stateDir });
  const database = openDatabase({ path: config.databasePath });

  try {
    const memory = new MemoryService({ db: database.db, stateDir: config.stateDir });

    switch (command) {
      case "write": {
        const result = await memory.write({
          name: required(flags, "name"),
          description: flags.description ?? required(flags, "name"),
          type: asType(required(flags, "type")),
          body: flags.body ?? "",
          actor: (flags.actor ?? "human") as MemoryActor,
          ...(flags.scope ? { scope: flags.scope as MemoryScope } : {}),
          ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
          ...(flags.project ? { projectId: flags.project } : {}),
        });
        out(
          `${result.created ? "escrita" : "atualizada"}: ${result.path}\n` +
            `commit: ${result.commit ?? "(nenhum — veja o aviso acima)"}\n`,
        );
        return 0;
      }

      case "read": {
        const entry = await memory.read(
          asType(required(flags, "type")),
          required(flags, "name"),
          flags.scope as MemoryScope | undefined,
          {
            ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
            ...(flags.project ? { projectId: flags.project } : {}),
          },
        );
        out(`${entry.name} — ${entry.description}\n\n${entry.body}\n`);
        return 0;
      }

      case "list": {
        const rows = memory.list();
        if (rows.length === 0) {
          out("nenhuma memória ainda\n");
          return 0;
        }
        for (const row of rows) {
          out(`${row.scope.padEnd(9)} ${row.type.padEnd(9)} ${row.name}\n`);
        }
        return 0;
      }

      case "reindex": {
        const result = await memory.reindex();
        out(`indexadas: ${result.indexed}\n`);
        for (const failure of result.failures) {
          err(`falhou: ${failure.path} — ${failure.reason}\n`);
        }
        // Falha de leitura é resultado, não crash: o operador precisa saber que
        // existe arquivo quebrado, e o índice das outras continua válido.
        return result.failures.length === 0 ? 0 : 2;
      }

      default:
        err(`comando desconhecido: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    if (error instanceof DomainError) {
      err(`${error.message}\n`);
      return 1;
    }
    throw error;
  } finally {
    database.close();
  }
}
