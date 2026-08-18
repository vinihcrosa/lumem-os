import { join, relative, sep } from "node:path";

import { DomainError } from "../errors.js";

import { entryFilename, type MemoryScope, type MemoryType } from "./entry.js";

/**
 * Onde cada escopo mora dentro do `~/.lumem` (§5 do PRD).
 *
 * ```text
 * memory/                                     → global (você)
 * workspaces/<ws>/memory/                     → workspace
 * workspaces/<ws>/projects/<proj>/memory/     → projeto
 * ```
 *
 * Worktree não aparece aqui, e não é esquecimento: a Q5 decidiu que worktree é
 * **origem**, não escopo. Ela entra na proveniência da memória, nunca no caminho.
 */

export interface ScopeTarget {
  scope: MemoryScope;
  /** Obrigatório em `workspace` e `project`. */
  workspaceId?: string;
  /** Obrigatório em `project`. */
  projectId?: string;
}

/** O diretório de memórias de um escopo, absoluto. */
export function memoryDirFor(stateDir: string, target: ScopeTarget): string {
  switch (target.scope) {
    case "global":
      return join(stateDir, "memory");
    case "workspace":
      return join(stateDir, "workspaces", requireId(target.workspaceId, "workspaceId"), "memory");
    case "project":
      return join(
        stateDir,
        "workspaces",
        requireId(target.workspaceId, "workspaceId"),
        "projects",
        requireId(target.projectId, "projectId"),
        "memory",
      );
    default:
      // O `switch` fecha, e não é zelo de estilo: `target.scope` chega de fora
      // — flag de CLI, corpo de requisição —, e sem este ramo um valor fora da
      // taxonomia sai daqui como `undefined` e morre lá adiante num
      // `TypeError` do `node:path`, em vez de erro de domínio aqui.
      return assertNeverScope(target.scope);
  }
}

function assertNeverScope(scope: never): never {
  throw new DomainError("INVALID_ARGUMENT", `escopo inválido: ${String(scope)}`);
}

/** O arquivo de uma memória, absoluto. */
export function entryPathFor(
  stateDir: string,
  target: ScopeTarget,
  type: MemoryType,
  slug: string,
): string {
  return join(memoryDirFor(stateDir, target), entryFilename(type, slug));
}

/**
 * O caminho relativo ao `~/.lumem`, com barra — que é como o git fala.
 *
 * Existe para que `git add` receba sempre a mesma forma, em qualquer sistema:
 * no Windows o `join` devolve `\`, e o git não entende aquilo como caminho.
 */
export function repoRelative(stateDir: string, absolutePath: string): string {
  const rel = relative(stateDir, absolutePath);
  if (rel === "" || rel.startsWith("..")) {
    throw new DomainError("INVALID_ARGUMENT", `caminho fora do state dir: ${absolutePath}`);
  }
  return rel.split(sep).join("/");
}

/**
 * Um id que vira **segmento de caminho** não pode conter caminho.
 *
 * O id vem do banco e não do usuário — mas a guarda é barata, e a alternativa é
 * um `..` chegando aqui um dia por um caminho que ninguém previu.
 */
function requireId(value: string | undefined, field: string): string {
  if (value === undefined || value === "") {
    throw new DomainError("INVALID_ARGUMENT", `${field} é obrigatório neste escopo`);
  }
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new DomainError("INVALID_ARGUMENT", `${field} inválido: ${value}`);
  }
  return value;
}
