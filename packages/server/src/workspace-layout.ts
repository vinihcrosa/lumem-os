import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import { DomainError } from "./errors.js";

/**
 * Where everything the daemon owns lives on disk, Q20.
 *
 * ```
 * <workspacesDir>/<workspace>/<projeto>/
 *                              ├── repo/                ← o clone, só em projeto gerenciado
 *                              └── worktrees/<nome>/     ← toda worktree, gerenciada ou não
 * ```
 *
 * Two rules hold this together, and both are load-bearing:
 *
 * - **`projectHome` is a function of `(workspace, projeto)`, never of
 *   `managed`.** A project registered by path gets a home too: no `repo/`,
 *   because its repository lives wherever the user left it, but a `worktrees/`
 *   all the same. If the path depended on having been cloned there would be two
 *   path calculations, and the guard below would cover one of them.
 * - **Nobody else joins these segments by hand.** The three functions here are
 *   the only place a name becomes a directory, which is what makes the
 *   slugification in `slugSegment` impossible to skip.
 */

/** `<workspacesDir>/<workspace>/<projeto>`. */
export function projectHome(
  workspacesDir: string,
  workspaceName: string,
  projectName: string,
): string {
  return join(
    workspacesDir,
    slugSegment(workspaceName, "workspace"),
    slugSegment(projectName, "projeto"),
  );
}

/** Where a cloned repository lands. Absent for a project registered by path. */
export function repoDir(home: string): string {
  return join(home, "repo");
}

/** The parent of every worktree of a project. */
export function worktreesDir(home: string): string {
  return join(home, "worktrees");
}

/**
 * `<home>/worktrees/<nome>`, F6.12.
 *
 * The name is **not** slugified, and that is deliberate: it has already been
 * through `nameSchema` in the worktree router (F4.5), which refuses `..`, a
 * leading dash, whitespace and everything git rejects in a ref. What it does
 * allow is a slash — `feat/login` is a branch name people write on purpose, and
 * it nests one directory deeper. Folding it to `feat-login` here would rename
 * checkouts that already exist for no gain.
 *
 * What is checked instead is the result: a name that somehow escaped its parent
 * is refused rather than joined.
 */
export function worktreeDir(home: string, worktreeName: string): string {
  const parent = worktreesDir(home);
  const path = join(parent, worktreeName);
  if (!isInside(path, parent) || path === parent) {
    throw new DomainError("INVALID_ARGUMENT", `o nome "${worktreeName}" sai do diretório do projeto`);
  }
  return path;
}

/**
 * A name a person typed, turned into one directory segment.
 *
 * Workspace names and project names are free text. A slash in one of them would
 * otherwise become a directory boundary, and `..` would become an escape — from
 * a tree the daemon later deletes from. So the alphabet is closed rather than
 * filtered: anything outside `[A-Za-z0-9._-]` becomes a dash.
 *
 * Accents are folded rather than replaced, because `café` reading as `caf-` is
 * a worse name than `cafe` and neither is what was typed.
 *
 * A leading dot is dropped, and that one is not cosmetic: a project named
 * `.git` would produce `<workspacesDir>/<workspace>/.git`, which makes the
 * workspace's own directory answer as a repository — and D4 would then refuse
 * every project in it. An empty result is not a name at all, and falls back.
 */
export function slugSegment(raw: string, fallback: string): string {
  const folded = raw
    .normalize("NFD")
    // Combining marks: `é` decomposes into `e` plus one of these.
    .replace(/[\u0300-\u036f]/g, "");

  const slug = folded
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+$/, "");

  if (slug === "") return fallback;
  return slug;
}

/*
 * D4 — "o destino não está dentro de um repositório que já existe" — foi
 * implementada, medida e **retirada**.
 *
 * A regra parecia certa no papel: repositório aninhado em outro é armadilha,
 * porque o `git status` do de fora passa a mentir. O que a suíte e2e mostrou é
 * que ela recusava **todo** clone sempre que `LUMEM_STATE_DIR` cai dentro de um
 * checkout — que é exatamente o que o próprio harness faz, e o que qualquer dev
 * faz ao apontar o estado para dentro do repositório em que trabalha.
 *
 * O argumento que decidiu não é esse, e sim a incoerência: `git worktree add`
 * já cria checkouts nessa mesma árvore, há três features, sem objeção nenhuma.
 * Uma regra que recusa ao clone o que a worktree faz em silêncio não protege
 * ninguém — só torna o clone o único gesto que quebra numa configuração que o
 * resto do produto aceita.
 *
 * Desde a Q14 o destino não vem mais do cliente: ele é derivado de `stateDir`.
 * Onde o `stateDir` fica é decisão do operador, tomada uma vez, e não entrada
 * hostil a conter a cada clone.
 */

export interface CloneTargetOptions {
  /** The root everything has to stay inside of. */
  workspacesDir: string;
}

/**
 * Makes a destination usable, or refuses it — the six rules of §4.4 of the PRD.
 *
 * Since Q14 the destination is **computed**, not received, so this stopped being
 * validation of a hostile string and became an invariant of the daemon itself.
 * It is still checked, because the bug class it now defends against is the one
 * that deletes the wrong directory later.
 *
 * Returns the real path of the destination: everything downstream — the clone,
 * the `rename`, the eventual deletion — works from what `realpath` proved, and
 * never from what was asked for.
 */
export async function prepareCloneTarget(
  target: string,
  { workspacesDir }: CloneTargetOptions,
): Promise<string> {
  // D1. The caller computed this from `stateDir`, so a relative path here means
  // a defect upstream rather than bad input — which is exactly why it is worth
  // catching before a directory gets created from it.
  if (!target.startsWith(sep)) {
    throw new DomainError("INVALID_ARGUMENT", `o destino ${target} não é absoluto`);
  }

  const parent = dirname(target);
  // D3. Created rather than required: `<workspace>/<projeto>` is the daemon's
  // own tree, and the first project of a workspace always finds it missing.
  await mkdir(parent, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOTDIR" || error.code === "EEXIST") {
      throw new DomainError("INVALID_ARGUMENT", `${parent} existe e não é um diretório`);
    }
    throw error;
  });

  // D6, before anything else reads the path: a symlink in the middle of the
  // tree is the same escape `path-guard.ts` closes for reads and writes.
  const realParent = await realpath(parent);
  const realRoot = await realpath(workspacesDir).catch(() => workspacesDir);
  if (!isInside(realParent, realRoot)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${parent} aponta para fora de ${workspacesDir}`,
    );
  }

  const resolved = join(realParent, basenameOf(target));
  await refuseIfOccupied(resolved);
  return resolved;
}

/** D2: the destination does not exist, or exists and is empty. */
async function refuseIfOccupied(target: string): Promise<void> {
  let info;
  try {
    // `lstat`, not `stat`: a symlink pointing at an empty directory would pass
    // a `stat` check and then be followed by everything after it.
    info = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (info.isSymbolicLink()) {
    throw new DomainError("INVALID_ARGUMENT", `${target} é um link simbólico`);
  }
  if (!info.isDirectory()) {
    throw new DomainError("INVALID_ARGUMENT", `${target} já existe e não é um diretório`);
  }

  const entries = await readdir(target);
  if (entries.length > 0) {
    throw new DomainError(
      "BLOCKED",
      `${target} já existe e tem ${entries.length} item(ns) dentro`,
    );
  }
}

/** True when `child` is `root` itself or below it, compared by segment. */
export function isInside(child: string, root: string): boolean {
  if (child === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return child.startsWith(prefix);
}

function basenameOf(path: string): string {
  const segments = path.split(sep);
  return segments.at(-1) ?? "";
}
