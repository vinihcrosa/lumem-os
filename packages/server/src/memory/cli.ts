import { loadConfig, type ConfigEnv } from "../config.js";
import { openDatabase } from "../db/index.js";
import { DomainError } from "../errors.js";

import { MemoryService } from "./MemoryService.js";
import {
  MEMORY_ACTORS,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  type MemoryActor,
  type MemoryScope,
  type MemoryType,
} from "./entry.js";
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
 * A PR 02 pôs o portão atrás desta superfície: `write`, `forget` e `revert`
 * passam pelo scan e viram decisão no WAL, e `decisions` é a leitura dele —
 * inclusive do que **não** virou arquivo. A inbox de propostas continua sendo a
 * PR 05; até lá, o que a regra não resolve é recusa explícita, nunca palpite.
 */

const USAGE = `uso: lumem-memory <comando>

  write   --name <n> --type <t> [--description <d>] [--body <texto>]
          [--scope <global|workspace|project>] [--workspace <id>] [--project <id>]
          [--actor <human|agent|distiller|auto_research|import>]
  read    --name <n> --type <t> [--scope ...] [--workspace <id>] [--project <id>]
  forget  --name <n> --type <t> [--scope ...] [--workspace <id>] [--project <id>]
  list
  revert  --path <caminho relativo ao ~/.lumem>
  decisions [--path <caminho>] [--limit <n>]
  reindex

tipos: ${MEMORY_TYPES.join(", ")}

sobre os valores:
  --flag=valor    a forma para valor com espaço ou começado por traço
  --flag valor    o token seguinte é sempre o valor, mesmo começando por --,
                  inclusive depois de flag desconhecida: ela engole o token
`;

interface Flags {
  [key: string]: string | undefined;
}

/**
 * `--flag valor` e `--flag=valor`, e **o token seguinte é sempre o valor**.
 *
 * Antes, um valor começado por `--` era lido como flag nova: `--body "--- regra"`
 * gravava o corpo `"true"` e saía 0. Como nenhuma flag daqui é booleana, tratar
 * o próximo token como valor não tira nada e devolve o corpo que o usuário
 * digitou. Quem precisa de valor com espaço ou traço tem o `=` como saída.
 */
function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || !token.startsWith("--")) continue;

    const equals = token.indexOf("=");
    if (equals !== -1) {
      flags[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }

    const next = argv[index + 1];
    flags[token.slice(2)] = next ?? "true";
    if (next !== undefined) index += 1;
  }
  return flags;
}

function required(flags: Flags, name: string): string {
  const value = flags[name];
  if (value === undefined) throw new DomainError("INVALID_ARGUMENT", `--${name} é obrigatório`);
  return value;
}

/**
 * A fronteira da A9, também na entrada.
 *
 * Valor de flag é texto de fora, e um `as` não valida nada: sem estas três
 * guardas, `--actor hacker` gravava e **commitava** um arquivo que o próprio
 * `parseEntry` recusa depois, e `--scope worktree` morria num `TypeError` do
 * `node:path` em vez de erro de domínio.
 */
function oneOf<T extends string>(allowed: readonly T[], label: string, value: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new DomainError("INVALID_ARGUMENT", `${label} inválido: ${value}. Um de: ${allowed.join(", ")}`);
  }
  return value as T;
}

function asType(value: string): MemoryType {
  return oneOf(MEMORY_TYPES, "tipo", value);
}

function asScope(value: string): MemoryScope {
  return oneOf(MEMORY_SCOPES, "escopo", value);
}

function asActor(value: string): MemoryActor {
  return oneOf(MEMORY_ACTORS, "ator", value);
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
          actor: asActor(flags.actor ?? "human"),
          ...(flags.scope ? { scope: asScope(flags.scope) } : {}),
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
          flags.scope === undefined ? undefined : asScope(flags.scope),
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

      case "forget": {
        const result = await memory.forget(
          asType(required(flags, "type")),
          required(flags, "name"),
          flags.scope as MemoryScope | undefined,
          {
            ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
            ...(flags.project ? { projectId: flags.project } : {}),
          },
        );
        out(`esquecida: ${result.path}\ncommit: ${result.commit ?? "(nenhum)"}\n`);
        return 0;
      }

      case "revert": {
        const result = await memory.revert(required(flags, "path"));
        out(
          `${result.outcome === "deleted" ? "apagada" : "revertida"}: ${result.path}\n` +
            `commit: ${result.commit ?? "(nenhum)"}\n`,
        );
        return 0;
      }

      case "decisions": {
        const rows = memory.decisions({
          ...(flags.path ? { path: flags.path } : {}),
          ...(flags.limit ? { limit: Number.parseInt(flags.limit, 10) } : {}),
        });
        if (rows.length === 0) {
          out("nenhuma decisão registrada\n");
          return 0;
        }
        for (const row of rows) {
          const trace = row.ruleTrace.length > 0 ? ` [${row.ruleTrace.join(", ")}]` : "";
          const motivo = row.reason === null ? "" : ` — ${row.reason}`;
          out(`${row.outcome.padEnd(8)} ${row.operation.padEnd(6)} ${row.path}${trace}${motivo}\n`);
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
