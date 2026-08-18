import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { newId } from "@lumem/shared";

import { parse as parseToml } from "smol-toml";

import { DomainError } from "../errors.js";
import { execGit, type GitExec } from "../git/exec.js";

/**
 * A identidade do projeto, decidida na Q3.1.
 *
 * Ela mora em `<repo>/.lumem/project.toml`, **commitada**, porque um id igual
 * para você e para o seu colega é característica **do projeto**, não da sua
 * instalação. É a única coisa do Lumem que entra no repositório do usuário — a
 * memória continua toda fora dele.
 *
 * A regra que delimita o arquivo, e que vale além desta feature:
 *
 * > O que é do repositório é do time; o que é da instância é do Lumem.
 *
 * Por isso este módulo **nunca reescreve o arquivo inteiro**: ele lê o `id` e,
 * quando precisa escrever, preserva o que já estava lá. Amanhã aquele arquivo
 * carrega script de setup e de run, e sobrescrever config de time seria a
 * definição de intrusão.
 */

/** Onde o arquivo fica, relativo à raiz do repositório. */
export const PROJECT_FILE = join(".lumem", "project.toml");

const ID_LINE = /^\s*id\s*=\s*["']([^"']+)["']\s*$/m;
const TABLE_HEADER = /^\s*\[/;

export interface ProjectFingerprint {
  /** `git rev-list --max-parents=0 HEAD`. Vazio em repositório sem commit. */
  rootCommits: readonly string[];
  /** `remote.origin.url`, quando existe. */
  remote: string | null;
}

export interface ProjectIdentity {
  id: string;
  /** `file` = veio do `project.toml`; `generated` = nasceu agora; `local` = ficou só no banco. */
  origin: "file" | "generated" | "local";
  /** Raiz canônica do repositório — a de verdade, mesmo se a entrada era uma worktree. */
  repoRoot: string;
  fingerprint: ProjectFingerprint;
  /** Verdadeiro quando o arquivo foi escrito agora e ainda não está commitado. */
  wroteFile: boolean;
}

export interface ResolveIdentityOptions {
  /** Qualquer caminho dentro do repositório — inclusive uma worktree. */
  path: string;
  /**
   * Permissão para escrever no repositório do usuário.
   *
   * Falso por padrão, e é decisão de produto, não cautela genérica: escrever num
   * repositório que talvez nem seja seu suja a árvore de trabalho de alguém que
   * não pediu nada. Sem permissão, o id existe só no banco — estado legítimo.
   */
  writeFile?: boolean;
  exec?: GitExec;
  /** Injetável para o teste que precisa de id previsível. */
  generateId?: () => string;
}

/**
 * Resolve a raiz **canônica** do repositório a partir de qualquer caminho dentro
 * dele.
 *
 * Canônica porque é o git quem responde, e ele resolve symlink: no macOS o
 * `/tmp` é `/private/tmp`, e comparar caminho não canônico com caminho de git é
 * comparar sorte. A `path-guard` da file-editor já tinha aprendido isso.
 *
 * Quem decide o caminho é a comparação `--git-dir` × `--git-common-dir`, e não o
 * formato do nome: iguais é repositório comum (ou submódulo, ou bare), e vale o
 * `--show-toplevel`; diferentes é **worktree vinculada**, cujo toplevel é ela
 * mesma e cujo projeto é o pai do common dir.
 */
export async function resolveRepoRoot(path: string, exec: GitExec = execGit): Promise<string> {
  const { stdout } = await exec(
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    { cwd: path },
  );
  const [gitDir = "", commonDir = ""] = stdout.trim().split("\n");

  // Iguais quer dizer "não é worktree vinculada" — inclusive no submódulo, cujo
  // git dir é `<pai>/.git/modules/<nome>` e cuja raiz é o próprio toplevel.
  // Adivinhar pelo sufixo `.git` do common dir, como antes, mandava o
  // `project.toml` do submódulo para dentro do `.git` do repositório pai.
  if (gitDir === commonDir) {
    const toplevel = await exec(["rev-parse", "--path-format=absolute", "--show-toplevel"], {
      cwd: path,
    })
      .then(({ stdout: top }) => top.trim())
      // Repositório bare não tem árvore de trabalho: a raiz é o próprio git dir.
      // Só que "falhou" não quer dizer "é bare": um timeout ou um git ausente
      // caem aqui do mesmo jeito, e tratá-los como bare manda o `project.toml`
      // para dentro do git dir **em silêncio**. Quem diz que é bare é o git.
      .catch((error: unknown) => {
        if (isOutsideWorkTree(error)) return "";
        throw error;
      });
    return toplevel === "" ? resolve(commonDir) : resolve(toplevel);
  }

  // Worktree vinculada: o git dir é `<principal>/.git/worktrees/<nome>` e o
  // common dir é o `.git` do repositório principal — cujo pai é a raiz.
  return dirname(commonDir);
}

/** A recusa que o git dá quando não há árvore de trabalho — e só ela. */
function isOutsideWorkTree(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("this operation must be run in a work tree");
}

/**
 * A impressão digital do repositório.
 *
 * Ela **não é** a identidade — a Q3.1 fechou nisso depois de eu propor o
 * contrário. O commit raiz e o remote servem para **reconhecer**: quando dois
 * caminhos reivindicam o mesmo id, é o remote que distingue clone de fork.
 */
export async function fingerprintOf(
  repoRoot: string,
  exec: GitExec = execGit,
): Promise<ProjectFingerprint> {
  const rootCommits = await exec(["rev-list", "--max-parents=0", "HEAD"], { cwd: repoRoot })
    .then(({ stdout }) => stdout.trim().split("\n").filter(Boolean))
    // Repositório sem commit nenhum é o caso comum de projeto recém-criado.
    .catch(() => []);

  const remote = await exec(["config", "--get", "remote.origin.url"], { cwd: repoRoot })
    .then(({ stdout }) => stdout.trim() || null)
    .catch(() => null);

  return { rootCommits, remote };
}

/**
 * Lê o `id` da **raiz** do `project.toml`, sem se importar com o resto do arquivo.
 *
 * Por parser TOML, e pelo mesmo motivo que justificou a dependência `yaml` no
 * frontmatter: o arquivo é do time e vai crescer com tabela de scripts. Um
 * regex de linha ignora tabela, então ele adotava como identidade do projeto
 * qualquer `id = "..."` que outra ferramenta tivesse posto num `[bloco]` dela.
 */
export async function readProjectId(repoRoot: string): Promise<string | null> {
  const text = await readFile(join(repoRoot, PROJECT_FILE), "utf8").catch(() => null);
  if (text === null) return null;

  try {
    const root = parseToml(text) as Record<string, unknown>;
    return typeof root.id === "string" && root.id !== "" ? root.id : null;
  } catch {
    // TOML inválido é arquivo em edição, não ausência de identidade: ler a
    // seção raiz na mão evita gerar um id novo por cima de um que existe.
    return ID_LINE.exec(rootSection(text))?.[1] ?? null;
  }
}

/** O trecho antes da primeira tabela — a única parte onde um `id` é da raiz. */
function rootSection(text: string): string {
  const lines = text.split("\n");
  const firstTable = lines.findIndex((line) => TABLE_HEADER.test(line));
  return (firstTable === -1 ? lines : lines.slice(0, firstTable)).join("\n");
}

/**
 * Escreve o `id` preservando o que já existia no arquivo.
 *
 * Nunca commita: quem commita é o usuário. O daemon escreve e diz o que falta —
 * um arquivo que aparece já commitado no repositório de alguém é exatamente o
 * tipo de surpresa que a Q3.1 quis evitar.
 */
export async function writeProjectId(repoRoot: string, id: string): Promise<void> {
  const path = join(repoRoot, PROJECT_FILE);
  const current = await readFile(path, "utf8").catch(() => null);

  if (current === null) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      [
        "# Identidade deste projeto para o Lumem.",
        "#",
        "# Commite este arquivo: um id igual em todas as máquinas é característica",
        "# do projeto, e é o que faz worktree, clone e o Lumem do seu colega caírem",
        "# no mesmo projeto. Nada de instância entra aqui — nem caminho, nem memória.",
        "",
        `id = "${id}"`,
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  await writeFile(path, withRootId(current, id), "utf8");
}

/**
 * Põe o `id` na **raiz** do arquivo, e não no fim dele.
 *
 * Anexar no fim parece inofensivo até o arquivo ter uma tabela — `[scripts]`, o
 * caso do time — e aí o `id` cai **dentro** dela: para qualquer parser TOML o
 * valor vira `scripts.id`, e a raiz fica sem identidade. Por isso ele entra
 * antes do primeiro `[`.
 *
 * O que **não** dá para fazer é confiar nessa conta: "onde a raiz termina" é
 * decidido por regex de linha, e valor multilinha cuja continuação começa com
 * `[` — um array de arrays, uma string com `[isto]` dentro — é indistinguível
 * de um cabeçalho de tabela olhando linha a linha. O primeiro caso gravava TOML
 * **inválido** no repositório do time (o arquivo que a A5 manda commitar); o
 * segundo enterrava o `id` dentro do literal, e aí `readProjectId` devolvia
 * `null` e o boot seguinte gerava outro id — rotação de identidade que ninguém
 * pediu, que é o caso grave da Q3.1.
 *
 * Então a inserção **verifica a própria saída** com o mesmo parser que a
 * leitura usa, e tem um plano B (o topo do arquivo, que é sempre a raiz). Se
 * nem ele passar, isto recusa: a A6 já prevê o id viver só no banco, e um
 * `project.toml` corrompido não tem volta parecida.
 */
export function withRootId(current: string, id: string): string {
  // Um candidato que não parseia, ou que não põe o `id` na raiz, é descartado:
  // ele danificou outra coisa no caminho, e essa outra coisa é do time.
  for (const candidate of [inRootSection(current, id), `id = "${id}"\n\n${current}`]) {
    if (rootIdOf(candidate) === id) return candidate;
  }

  throw new DomainError(
    "BLOCKED",
    `${PROJECT_FILE} não aceita o id sem quebrar o TOML — o arquivo tem valor ` +
      `multilinha ou está em edição. Escreva \`id = "${id}"\` na raiz dele à mão, ` +
      `ou siga sem: o id continua valendo só neste Lumem.`,
  );
}

/** A inserção que respeita o formato — antes da primeira linha que parece tabela. */
function inRootSection(current: string, id: string): string {
  const lines = current.split("\n");
  const firstTable = lines.findIndex((line) => TABLE_HEADER.test(line));
  const rootEnd = firstTable === -1 ? lines.length : firstTable;

  const existing = lines.findIndex((line, index) => index < rootEnd && ID_LINE.test(line));
  if (existing !== -1) {
    lines[existing] = `id = "${id}"`;
    return lines.join("\n");
  }

  // Antes da tabela, com uma linha em branco separando — e sem engolir a que
  // eventualmente já estava lá.
  const head = lines.slice(0, rootEnd);
  while (head.length > 0 && head[head.length - 1]?.trim() === "") head.pop();
  return [...head, `id = "${id}"`, "", ...lines.slice(rootEnd)].join("\n").replace(/\n+$/, "\n");
}

/** O `id` da raiz segundo o parser — `null` quando o texto nem é TOML. */
function rootIdOf(text: string): string | null {
  try {
    const root = parseToml(text) as Record<string, unknown>;
    return typeof root.id === "string" ? root.id : null;
  } catch {
    return null;
  }
}

/**
 * O fluxo da Q3.1: lê, adota, ou gera e pede permissão.
 *
 * O caso do **fork** — dois caminhos reivindicando o mesmo id — não é decidido
 * aqui: este módulo devolve id e impressão digital, e quem tem a tabela na mão
 * (o serviço) é quem sabe se aquele id já está preso a outro caminho com outro
 * remote. Separar assim mantém isto testável sem banco.
 */
export async function resolveProjectIdentity({
  path,
  writeFile: allowWrite = false,
  exec = execGit,
  generateId = newId,
}: ResolveIdentityOptions): Promise<ProjectIdentity> {
  const repoRoot = await resolveRepoRoot(path, exec);
  const fingerprint = await fingerprintOf(repoRoot, exec);

  const existing = await readProjectId(repoRoot);
  if (existing !== null) {
    return { id: existing, origin: "file", repoRoot, fingerprint, wroteFile: false };
  }

  const id = generateId();
  if (!allowWrite) {
    return { id, origin: "local", repoRoot, fingerprint, wroteFile: false };
  }

  await writeProjectId(repoRoot, id);
  return { id, origin: "generated", repoRoot, fingerprint, wroteFile: true };
}

export interface ForkCheck {
  /** O mesmo id, visto num caminho diferente. */
  knownRepoRoot: string;
  knownRemote: string | null;
  candidate: ProjectIdentity;
}

/**
 * Clone ou fork?
 *
 * Fork carrega o `project.toml` do pai, e template copia tudo — dois
 * repositórios afirmando a mesma identidade. O que os distingue é o remote: o
 * mesmo remote é o mesmo projeto em outro diretório; remote diferente é um
 * projeto novo que herdou o arquivo.
 *
 * Devolve `"ask"` porque a decisão é do usuário: o daemon não rotaciona id de
 * ninguém por conta própria.
 */
export function classifyClaim({
  knownRepoRoot,
  knownRemote,
  candidate,
}: ForkCheck): "same-project" | "ask" {
  if (candidate.repoRoot === knownRepoRoot) return "same-project";
  if (knownRemote !== null && candidate.fingerprint.remote === knownRemote) return "same-project";
  return "ask";
}
