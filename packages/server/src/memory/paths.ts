import { join, relative, sep } from "node:path";

import { DomainError } from "../errors.js";

import { entryFilename, MEMORY_TYPES, type MemoryScope, type MemoryType } from "./entry.js";

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

/**
 * O charset de um id que vira segmento de caminho.
 *
 * Fechado, e não "sem barra": o caminho que sai daqui é entregue ao git como
 * **pathspec**, e pathspec não é nome — `*`, `?`, `[` e `:` mudam o significado
 * do comando. É a armadilha registrada em `docs/project/testing.md`, e ela volta
 * por qualquer campo que aceite mais do que um id tem. Os ids são UUID
 * (`newId`), então isto não aperta nada que exista.
 */
const ID_SEGMENT = "[A-Za-z0-9_-]+";

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

/**
 * O diretório de um playbook, absoluto — um diretório por playbook.
 *
 * Diretório e não arquivo solto desde o primeiro dia, porque o `references/` do
 * §9 vai morar ao lado do `PLAYBOOK.md`. Mudar isso depois seria migrar o disco
 * de quem já usa, por um detalhe que era barato acertar agora.
 */
export function playbookDirFor(stateDir: string, target: ScopeTarget, slug: string): string {
  if (target.scope === "global") {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "playbook não tem escopo global: procedimento é de um repositório ou de um time",
    );
  }
  return join(scopeDirFor(stateDir, target), "playbooks", assertSlug(slug));
}

/** O `PLAYBOOK.md` de um playbook, absoluto. */
export function playbookPathFor(stateDir: string, target: ScopeTarget, slug: string): string {
  return join(playbookDirFor(stateDir, target, slug), PLAYBOOK_FILE);
}

export const PLAYBOOK_FILE = "PLAYBOOK.md";

/** A raiz de um escopo, sem o `memory/` no fim. */
function scopeDirFor(stateDir: string, target: ScopeTarget): string {
  switch (target.scope) {
    case "global":
      return stateDir;
    case "workspace":
      return join(stateDir, "workspaces", requireId(target.workspaceId, "workspaceId"));
    case "project":
      return join(
        stateDir,
        "workspaces",
        requireId(target.workspaceId, "workspaceId"),
        "projects",
        requireId(target.projectId, "projectId"),
      );
    default:
      return assertNeverScope(target.scope);
  }
}

const SLUG_ONLY = /^[a-z0-9-]{1,80}$/;

function assertSlug(slug: string): string {
  if (!SLUG_ONLY.test(slug)) {
    throw new DomainError("INVALID_ARGUMENT", `slug inválido: ${slug}`);
  }
  return slug;
}

/**
 * A forma exata do caminho de um playbook.
 *
 * O mesmo raciocínio do `ENTRY_PATH`: o caminho vem do cliente e vira pathspec de
 * git, então a contenção é por forma, com charset fechado.
 */
const PLAYBOOK_PATH = new RegExp(
  `^workspaces/${ID_SEGMENT}(?:/projects/${ID_SEGMENT})?/playbooks/[a-z0-9-]{1,80}/${PLAYBOOK_FILE}$`,
);

/** Devolve o caminho quando ele é o de um playbook; estoura quando não é. */
export function assertPlaybookPath(path: string): string {
  const normalized = path.split(sep).join("/");
  if (!PLAYBOOK_PATH.test(normalized)) {
    throw new DomainError("INVALID_ARGUMENT", `${path} não é caminho de playbook`);
  }
  return normalized;
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

/** `memory/user_estilo.md` + `user` → `estilo`. O inverso de `entryFilename`. */
export function slugOf(path: string, type: MemoryType): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(new RegExp(`^${type}_`), "").replace(/\.md$/, "");
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
 * Um id que vira **segmento de caminho** não pode conter caminho, nem glob.
 *
 * O id vem do cliente hoje — `workspaceId` e `projectId` chegam pelo input do
 * router, e a sessão só vai derivá-los na `acp-sessions`. Então a lista fechada
 * não é zelo: o caminho montado aqui vira pathspec de git, e `*` ali casa arquivo
 * que ninguém pediu.
 */
const ID_ONLY = new RegExp(`^${ID_SEGMENT}$`);

function requireId(value: string | undefined, field: string): string {
  if (value === undefined || value === "") {
    throw new DomainError("INVALID_ARGUMENT", `${field} é obrigatório neste escopo`);
  }
  if (!ID_ONLY.test(value)) {
    throw new DomainError("INVALID_ARGUMENT", `${field} inválido: ${value}`);
  }
  return value;
}

/**
 * A forma **exata** que um caminho de memória tem, e nada além dela.
 *
 * Existe porque `revert` recebe um caminho do cliente e o traduz em `rm` + commit
 * dentro do `~/.lumem`. O git barra `../`, mas não barra `.gitignore`: sem esta
 * guarda, desfazer podia apagar qualquer arquivo *tracked* do repositório do
 * daemon. A contenção é por **forma**, e não por presença no catálogo, porque
 * desfazer um `forget` é justamente pedir um caminho que o catálogo já não tem.
 *
 * O charset fechado é o que faz a forma valer contra o git também: com `[^/]+`
 * no lugar do id, um asterisco no slot do workspace passava — e pathspec com glob
 * casa memória de **outro** workspace. Nenhum ponto em segmento de id, então `..`
 * não tem por onde entrar; não há guarda separada para ele porque guarda
 * inalcançável se lê como cobertura que não existe.
 */
const ENTRY_PATH = new RegExp(
  `^(?:memory|workspaces/${ID_SEGMENT}/memory|workspaces/${ID_SEGMENT}/projects/${ID_SEGMENT}/memory)` +
    `/(?:${MEMORY_TYPES.join("|")})_[a-z0-9-]{1,80}\\.md$`,
);

/** Devolve o caminho quando ele é o de uma memória; estoura quando não é. */
export function assertEntryPath(path: string): string {
  const normalized = path.split(sep).join("/");
  if (!ENTRY_PATH.test(normalized)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${path} não é caminho de memória — só arquivos sob um diretório memory/ podem ser desfeitos`,
    );
  }
  return normalized;
}
