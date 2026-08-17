import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { newId } from "@lumem/shared";

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
 * `--git-common-dir` em vez de `--show-toplevel` porque a entrada pode ser uma
 * **worktree**: o toplevel dela é ela mesma, e o que interessa é o projeto a que
 * ela pertence. O common dir aponta para o `.git` do repositório principal, e o
 * pai dele é a raiz.
 */
export async function resolveRepoRoot(path: string, exec: GitExec = execGit): Promise<string> {
  const { stdout } = await exec(["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: path,
  });
  const commonDir = stdout.trim();
  // Em repositório comum o common dir é `<raiz>/.git`; em bare, é a própria raiz.
  return commonDir.endsWith(`${join("", ".git")}`) || commonDir.endsWith("/.git")
    ? dirname(commonDir)
    : resolve(commonDir);
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

/** Lê o `id` do `project.toml`, sem se importar com o resto do arquivo. */
export async function readProjectId(repoRoot: string): Promise<string | null> {
  const text = await readFile(join(repoRoot, PROJECT_FILE), "utf8").catch(() => null);
  if (text === null) return null;
  return ID_LINE.exec(text)?.[1] ?? null;
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

  const updated = ID_LINE.test(current)
    ? current.replace(ID_LINE, `id = "${id}"`)
    : `${current.trimEnd()}\n\nid = "${id}"\n`;
  await writeFile(path, updated, "utf8");
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
