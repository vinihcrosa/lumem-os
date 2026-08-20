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
import { createPlaybookService, lifecycleOf } from "./playbook.js";

/**
 * A superfície mínima da T7: escrever, ler, listar, reindexar.
 *
 * Linha de comando primeiro, e não por acaso. A segunda superfície — o router
 * tRPC da PR 03 — expõe as **mesmas** funções, e o princípio de paridade do
 * estudo do Compozy diz que as duas chamam o mesmo núcleo, com o mesmo contrato
 * de erro e o **mesmo schema de entrada**. Começar pela CLI é o que garante que o
 * núcleo exista antes das superfícies — e é o que permite inspecionar a memória
 * sem subir o daemon.
 *
 * A PR 02 pôs o portão atrás desta superfície: `write`, `forget` e `revert`
 * passam pelo scan e viram decisão no WAL, e `decisions` é a leitura dele —
 * inclusive do que **não** virou arquivo. A inbox de propostas continua sendo a
 * PR 05, e ela está de pé: escrita de agente para cima sai como `proposta:`, não
 * como escrita. O que a regra não resolve continua sendo recusa explícita.
 *
 * Paridade inclui o que `list` quer dizer: aqui e no router, `list` é o que o
 * escopo **enxerga** (resolvido por shadow). A lista crua do catálogo é outra
 * pergunta, e mora atrás de `--all`.
 */

const USAGE = `uso: lumem-memory <comando>

  write   --name <n> --type <t> [--description <d>] [--body <texto>]
          [--scope <global|workspace|project>] [--workspace <id>] [--project <id>]
          [--actor <human|agent|distiller|auto_research|import>]
  read    --name <n> --type <t> [--scope ...] [--workspace <id>] [--project <id>]
  forget  --name <n> --type <t> [--scope ...] [--workspace <id>] [--project <id>]
  list    [--workspace <id>] [--project <id>] [--all]
          sem --workspace, o escopo ativo é só o global; --all mostra o catálogo cru
  revert  --path <caminho relativo ao ~/.lumem>
  search  --query "<pergunta>" [--workspace <id>] [--project <id>] [--limit <n>]
          [--session <id>]   registra o uso — é o caminho do agente
  usage
  decisions [--path <caminho>] [--limit <n>]
  reindex

  playbook list  [--workspace <id>] [--project <id>] [--archived]
  playbook show  --path <caminho>   projeta o procedimento, e conta como uso
  playbook write --task-class <classe> --description <d> --body <texto>
                 --scope <workspace|project> [--workspace <id>] [--project <id>]

sobre escrever playbook — a ordem de preferência é fechada (§9 do PRD):
  1. atualize o playbook que estava carregado
  2. atualize um guarda-chuva que já existe
  3. acrescente arquivo de apoio
  4. só então crie um novo
  e o nome é a **classe de tarefa** — "investigar teste flaky", nunca "consertar o PR 412"

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

/** `--limit abc` é erro de uso, não um `NaN` viajando até o SQL. */
function integer(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new DomainError("INVALID_ARGUMENT", `--${name} precisa ser um número`);
  }
  return parsed;
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
          // Validado pela mesma lista que o schema do núcleo usa, e revalidado
          // por ele: o cast de antes fazia a CLI aceitar o que a API recusava.
          //
          // Declarado por quem chama, e o mesmo default do router. Onde o ator
          // passa a ser **imposto** é a Q46 (aberta) em
          // docs/prd/workspace-memory/open-questions.md.
          actor: asActor(flags.actor ?? "human"),
          ...(flags.scope ? { scope: asScope(flags.scope) } : {}),
          ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
          ...(flags.project ? { projectId: flags.project } : {}),
        });
        // Proposta não é escrita, e a CLI não pode dizer que gravou: quem grava é
        // você, pela inbox. O motivo do núcleo já carrega o id da proposta.
        if (result.outcome === "proposed") {
          out(`proposta: ${result.path}\n${result.reason ?? "aguardando revisão"}\n`);
          return 0;
        }
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
        // O mesmo comando responde igual nas duas superfícies: `list` é o que o
        // escopo **enxerga**, resolvido por shadow, como no router. A lista crua
        // do catálogo continua alcançável, atrás de `--all`, porque inspecionar o
        // que está no disco é outra pergunta.
        if (flags.all !== undefined) {
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

        const { visible, shadowed } = memory.visible({
          workspaceId: flags.workspace ?? null,
          projectId: flags.project ?? null,
        });
        if (visible.length === 0) {
          out("nenhuma memória ainda\n");
          return 0;
        }
        for (const row of visible) {
          out(`${row.scope.padEnd(9)} ${row.type.padEnd(9)} ${row.name}\n`);
        }
        // Esconder sem dizer o que foi escondido é como o shadow vira mistério.
        for (const pair of shadowed) {
          out(`sombreada ${pair.loser.type}/${pair.loser.slug} por ${pair.winner.path}\n`);
        }
        return 0;
      }

      case "forget": {
        const result = await memory.forget(
          asType(required(flags, "type")),
          required(flags, "name"),
          flags.scope === undefined ? undefined : asScope(flags.scope),
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

      case "search": {
        // A pergunta antes do reparo: `reindex` substitui o catálogo, e comando
        // que vai falhar por falta de argumento não pode ter escrito nada.
        const query = required(flags, "query");

        // A CLI existe para inspecionar a memória **sem** subir o daemon, então
        // ela não pode contar com o reparo do boot: num banco anterior a esta
        // feature o índice não existe, e a busca não acharia nada. Só aqui, e
        // não no início de todo comando: `list` e `read` não leem o índice, e
        // reconstruir o catálogo num comando de leitura é escrita escondida.
        const { indexed, failures } = await memory.ensureIndexFresh();
        if (indexed > 0) err(`índice reconstruído: ${indexed} memórias\n`);
        // Concreto, e não um "índice atrasado" genérico: o que sobrou de fora
        // tem nome, e o `reindex` **substitui** o catálogo — quem não pôde ser
        // lido sumiu da lista, não só da busca.
        for (const failure of failures) err(`fora do índice: ${failure.path} — ${failure.reason}\n`);

        // Só o caminho do agente registra: uma busca de inspeção não pode
        // inflar o contador que decide poda e consolidação (Q25).
        const result = memory.search(query, {
          ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
          ...(flags.project ? { projectId: flags.project } : {}),
          ...(flags.limit ? { limit: integer(flags.limit, "limit") } : {}),
          ...(flags.session ? { record: true, sessionId: flags.session } : {}),
        });
        if (result.skipped === "trivial_query") {
          // Dizer que **não buscou** é diferente de dizer que não achou.
          err("busca não realizada: menos de dois termos significativos\n");
          return 1;
        }
        if (result.hits.length === 0) {
          out("nada encontrado\n");
          return 0;
        }
        for (const hit of result.hits) {
          out(`${hit.entry.scope.padEnd(9)} ${hit.entry.type.padEnd(9)} ${hit.entry.name}\n`);
          out(`  ${hit.why.join(" · ")}\n`);
        }
        return 0;
      }

      case "usage": {
        const rows = memory.usageSummary();
        if (rows.length === 0) {
          out("nenhum uso registrado ainda\n");
          return 0;
        }
        for (const row of rows) {
          out(
            `${row.kind.padEnd(8)} eventos=${String(row.events).padEnd(5)} ` +
              `sessões=${String(row.sessions).padEnd(4)} ` +
              `total=${String(row.totalAmount).padEnd(6)} média=${row.averageDurationMs}ms\n`,
          );
        }
        return 0;
      }

      case "decisions": {
        const rows = memory.decisions({
          ...(flags.path ? { path: flags.path } : {}),
          ...(flags.limit ? { limit: integer(flags.limit, "limit") } : {}),
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

      case "playbook": {
        // Subcomando, e não `playbook-list`: playbook tem verbo próprio para
        // listar, mostrar e escrever, e achatar isso em nomes com hífen faria a
        // ajuda crescer numa lista plana que ninguém lê até o fim.
        const [verb] = rest;
        const playbooks = createPlaybookService({ db: database.db, stateDir: config.stateDir });
        const sub = parseFlags(rest.slice(1));

        switch (verb) {
          case "list": {
            const rows = playbooks.list({
              ...(sub.workspace ? { workspaceId: sub.workspace } : {}),
              ...(sub.project ? { projectId: sub.project } : {}),
              archived: rest.includes("--archived"),
            });
            if (rows.length === 0) {
              out("nenhum playbook aqui\n");
              return 0;
            }
            for (const row of rows) {
              // O estado é derivado na hora, e é o que a CLI tem para dizer
              // sobre "isto ainda vale?".
              out(
                `${lifecycleOf(row).padEnd(8)} ${String(row.loads).padStart(4)}× ` +
                  `${row.taskClass}\n  ${row.path}\n`,
              );
            }
            return 0;
          }

          case "show": {
            const path = required(sub, "path");
            const entry = await playbooks.read(path);
            // Contar **antes** de imprimir: quem chamou já pediu o procedimento,
            // e um `EPIPE` na saída não desfaz o fato de ele ter sido carregado.
            playbooks.recordLoad(path);
            out(`# ${entry.task_class}\n\n${entry.description}\n\n${entry.body}\n`);
            return 0;
          }

          case "write": {
            const scope = sub.scope === "project" ? "project" : "workspace";
            const result = await playbooks.write({
              taskClass: required(sub, "task-class"),
              description: sub.description ?? required(sub, "task-class"),
              body: sub.body ?? "",
              scope,
              ...(sub.workspace ? { workspaceId: sub.workspace } : {}),
              ...(sub.project ? { projectId: sub.project } : {}),
              actor: sub.actor ?? "human",
            });
            out(`${result.created ? "criado" : "atualizado"} ${result.path}\n`);
            return 0;
          }

          default:
            err(`playbook: comando desconhecido: ${verb ?? "(nenhum)"}\n\n${USAGE}`);
            return 1;
        }
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
