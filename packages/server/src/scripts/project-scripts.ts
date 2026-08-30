import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse as parseToml } from "smol-toml";

import { DomainError } from "../errors.js";
import { PROJECT_FILE } from "../memory/project-identity.js";

/**
 * Os scripts do projeto, na tabela `[scripts]` do `<checkout>/.lumem/project.toml`.
 *
 * O arquivo já existia com o `id` dentro (Q3.1 da workspace-memory) e o comentário
 * de lá já dizia o que ia acontecer: *"amanhã aquele arquivo carrega script de setup
 * e de run"*. A regra que o delimita continua a mesma, e é ela que autoriza estes
 * três a morarem lá:
 *
 * > O que é do repositório é do time; o que é da instância é do Lumem.
 *
 * Script de setup e de run passa nessa regra por definição: quem clona o repositório
 * precisa dos dois, com Lumem ou sem. O que **não** passa é script que só uma pessoa
 * roda — esse mora no banco, e a S10 já nomeou o lugar dele.
 *
 * O que este módulo lê é sempre o arquivo do **checkout** (S7): cada worktree tem o
 * seu, e uma branch que mexe no setup muda o setup só dela.
 */

export const SCRIPT_PHASES = ["setup", "run", "teardown"] as const;
export type ScriptPhase = (typeof SCRIPT_PHASES)[number];

/** Uma fase por chave, e `null` para a que o repositório não declarou. */
export type ProjectScripts = Readonly<Record<ScriptPhase, string | null>>;

export const NO_SCRIPTS: ProjectScripts = { setup: null, run: null, teardown: null };

export interface ReadScriptsOptions {
  /** Recebe o motivo de um valor ter sido ignorado. Silencioso por padrão. */
  warn?: (message: string) => void;
}

/** Onde o arquivo do checkout está, exista ele ou não. */
export function projectFilePath(checkoutPath: string): string {
  return join(checkoutPath, PROJECT_FILE);
}

/**
 * Lê `[scripts]` do checkout.
 *
 * **Arquivo ausente não é erro**, e essa é a decisão de produto mais importante deste
 * módulo: é assim que todo projeto entra no Lumem. Erro é TOML quebrado — aí alguém
 * escreveu algo e o Lumem está ignorando em silêncio, que é o único jeito de a pessoa
 * achar que declarou um script e não ter declarado.
 */
export async function readProjectScripts(
  checkoutPath: string,
  { warn }: ReadScriptsOptions = {},
): Promise<ProjectScripts> {
  const path = projectFilePath(checkoutPath);
  const text = await readFile(path, "utf8").catch(() => null);
  if (text === null) return NO_SCRIPTS;

  let root: Record<string, unknown>;
  try {
    root = parseToml(text) as Record<string, unknown>;
  } catch (error) {
    // Diferente do `readProjectId`, que cai para um regex e segue: lá a
    // consequência de desistir era gerar uma identidade nova por cima de uma que
    // existe. Aqui a consequência de desistir é rodar o comando errado, ou
    // nenhum, sem ninguém saber por quê.
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${PROJECT_FILE} não é TOML válido: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const table = root["scripts"];
  if (table === undefined) return NO_SCRIPTS;
  if (typeof table !== "object" || table === null || Array.isArray(table)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${PROJECT_FILE}: \`scripts\` precisa ser uma tabela — \`[scripts]\` com uma linha por fase`,
    );
  }

  const declared = table as Record<string, unknown>;
  const scripts: Record<ScriptPhase, string | null> = { ...NO_SCRIPTS };

  for (const phase of SCRIPT_PHASES) {
    const value = declared[phase];
    if (value === undefined) continue;

    // String vazia e valor de outro tipo viram ausência — mas ausência **avisada**.
    // Um `run = ""` que some sem ruído é a pessoa jurando que declarou.
    if (typeof value !== "string" || value.trim() === "") {
      warn?.(
        `${PROJECT_FILE}: \`scripts.${phase}\` foi ignorado — esperava um comando em texto, ` +
          `veio ${value === "" ? "texto vazio" : typeof value}`,
      );
      continue;
    }
    scripts[phase] = value.trim();
  }

  return scripts;
}

/**
 * Escreve as fases pedidas **sem tocar no resto do arquivo**.
 *
 * A A5 não é cautela genérica: este arquivo é do time, tem o `id` do projeto dentro,
 * e vai ter mais coisa amanhã. Reescrever o TOML inteiro a partir do que o daemon
 * entende seria apagar em silêncio o que ele ainda não entende — no repositório de
 * outra pessoa, e num arquivo que ela commita.
 *
 * Como o `writeProjectId`, isto **não commita**: quem commita é quem está lendo.
 */
export async function writeProjectScripts(
  checkoutPath: string,
  changes: Partial<Record<ScriptPhase, string | null>>,
): Promise<ProjectScripts> {
  const path = projectFilePath(checkoutPath);
  const current = await readFile(path, "utf8").catch(() => null);

  const next = withScriptsTable(current ?? "", changes);

  // A verificação é do mesmo tipo que a do `withRootId`: o que vai para o disco é
  // relido com o parser da leitura antes de virar arquivo de alguém.
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(next) as Record<string, unknown>;
  } catch (error) {
    throw new DomainError(
      "BLOCKED",
      `${PROJECT_FILE} não aceita a tabela [scripts] sem quebrar o TOML — o arquivo tem ` +
        `valor multilinha ou está em edição. Escreva as linhas à mão e tente de novo.`,
      { cause: error },
    );
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");

  const table = (parsed["scripts"] ?? {}) as Record<string, unknown>;
  return {
    setup: typeof table["setup"] === "string" ? table["setup"] : null,
    run: typeof table["run"] === "string" ? table["run"] : null,
    teardown: typeof table["teardown"] === "string" ? table["teardown"] : null,
  };
}

const SCRIPTS_HEADER = /^\s*\[\s*scripts\s*\]\s*$/;
const TABLE_HEADER = /^\s*\[/;

function keyLine(phase: ScriptPhase): RegExp {
  return new RegExp(`^\\s*${phase}\\s*=`);
}

/**
 * Substitui dentro do `[scripts]` que existe, ou acrescenta a tabela no fim.
 *
 * No fim de propósito, ao contrário do `id`: tabela no fim do arquivo é uma tabela;
 * chave solta no fim do arquivo cai dentro da última tabela. Os dois casos são
 * simétricos e a assimetria do código é a consequência disso, não um descuido.
 */
function withScriptsTable(
  current: string,
  changes: Partial<Record<ScriptPhase, string | null>>,
): string {
  const lines = current === "" ? [] : current.split("\n");
  const start = lines.findIndex((line) => SCRIPTS_HEADER.test(line));

  if (start === -1) {
    const body = SCRIPT_PHASES.filter((phase) => typeof changes[phase] === "string").map(
      (phase) => `${phase} = ${quote(changes[phase] as string)}`,
    );
    if (body.length === 0) return current;

    const head = [...lines];
    while (head.length > 0 && head[head.length - 1]?.trim() === "") head.pop();
    const preamble =
      head.length === 0
        ? [
            "# Os scripts deste projeto, lidos pelo Lumem.",
            "#",
            "# Commite este arquivo: quem clonar depois herda o mesmo setup, com Lumem",
            "# ou sem. Cada comando roda no diretório do checkout, pelo shell de login.",
            "",
          ]
        : [...head, ""];
    return [...preamble, "[scripts]", ...body, ""].join("\n");
  }

  // Onde a tabela termina: a próxima linha que abre outra, ou o fim do arquivo.
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TABLE_HEADER.test(lines[index] as string)) {
      end = index;
      break;
    }
  }

  const body = lines.slice(start + 1, end);
  for (const phase of SCRIPT_PHASES) {
    if (!(phase in changes)) continue;
    const value = changes[phase];
    const at = body.findIndex((line) => keyLine(phase).test(line));

    if (value === null || value === undefined) {
      if (at !== -1) body.splice(at, 1);
      continue;
    }
    const line = `${phase} = ${quote(value)}`;
    if (at === -1) body.push(line);
    else body[at] = line;
  }

  return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join("\n");
}

/** Aspas de TOML básicas, com o que elas exigem escapado. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
