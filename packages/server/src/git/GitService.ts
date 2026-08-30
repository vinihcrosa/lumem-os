import { realpath, stat } from "node:fs/promises";

import { DomainError } from "../errors.js";
import { cloneEnv } from "./clone.js";
import { execGit, type GitExec } from "./exec.js";

/**
 * How long a fetch gets, F7.15.
 *
 * **Chosen, not measured**, like the clone's silence timeout: long enough for
 * a branch on a slow remote, short enough that a daemon holding a request open
 * is not doing it for two minutes. A fetch here is one ref, not a clone.
 */
export const FETCH_TIMEOUT_MS = 90_000;

/**
 * Everything the daemon does to git, PRD §7 ("git via CLI, não biblioteca").
 *
 * Five commands in this version. A library would buy abstraction over an API
 * that is already stable and already installed.
 */

export type RepoProblem = "missing" | "not-a-directory" | "not-a-repo" | "not-root";

export type RepoCheck =
  | { ok: true; root: string }
  | { ok: false; problem: RepoProblem; message: string };

export interface WorktreeEntry {
  path: string;
  /** Absent on a detached HEAD; `git worktree list` prints no branch line then. */
  branch: string | null;
  head: string | null;
  detached: boolean;
  /** git itself already knows the directory is gone. */
  prunable: boolean;
}

/** One line of the branch tab, F7.3. */
export interface BranchItem {
  /** Short name — `feat/login`, with no `refs/heads/` and no remote prefix. */
  name: string;
  /** The remote it lives on, or null for a local branch. */
  remote: string | null;
  /** Milliseconds since the epoch, from the commit the ref points at. */
  lastCommitAt: number;
  /**
   * The checkout that already holds this branch, or null.
   *
   * A **path**, because that is all git knows: the worktree's name lives in
   * the database, and the router is what turns one into the other for the
   * sentence F7.4 requires.
   */
  usedByPath: string | null;
}

/**
 * The four ways a worktree can come into being, §4 of the worktree-from-source
 * PRD.
 *
 * A discriminated union rather than optional fields: `create` and `existing`
 * differ by whether the branch is supposed to exist, and a shape that allows
 * both to be passed at once would let a caller ask for something that has no
 * meaning.
 */
export type AddWorktreeInput =
  | {
      /** A branch that does not exist yet, cut from `baseBranch`. F4.1–F4.5. */
      mode: "create";
      repoPath: string;
      branch: string;
      targetPath: string;
      /** Where the new branch starts, F4.3. */
      baseBranch: string;
    }
  | {
      /** A local branch that is already there. F7.4. */
      mode: "existing";
      repoPath: string;
      branch: string;
      targetPath: string;
    }
  | {
      /** A branch that only exists on a remote, tracked from it. F7.5. */
      mode: "track";
      repoPath: string;
      /** Short name, with no remote prefix — `feat/login`. */
      branch: string;
      remote: string;
      targetPath: string;
    }
  | {
      /**
       * No branch at all, F7.6.
       *
       * What the pull request path cuts before handing the checkout to `gh`,
       * which is what puts a branch on it.
       */
      mode: "detach";
      repoPath: string;
      targetPath: string;
      commitish: string;
    };

export interface RemoveWorktreeInput {
  /**
   * Run from the main repository, not from the worktree: a directory deleted
   * by hand is exactly the case that has to keep working, and `cwd` cannot
   * point at something that no longer exists.
   */
  repoPath: string;
  path: string;
  force?: boolean;
}

export interface WorktreeStatus {
  clean: boolean;
  /** Files with any change at all, untracked included, F4.8. */
  changedFiles: number;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

/** Which comparison the right panel is asking for, D1 of the right-panel. */
export type ChangeRef = "worktree" | "base";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface ChangedFile {
  path: string;
  /** Only for a rename; null otherwise. */
  oldPath: string | null;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  /** git counts nothing for these — it prints `-` in numstat. */
  binary: boolean;
}

export interface ChangeSet {
  ref: ChangeRef;
  /**
   * What the working tree was compared against: `HEAD`, or the merge-base with
   * the branch the worktree was cut from. Null when the repository has no
   * commit yet, in which case everything is new.
   */
  comparedTo: string | null;
  files: ChangedFile[];
}

export interface ChangesInput {
  ref: ChangeRef;
  /** Required for `ref: "base"`, ignored otherwise. */
  baseBranch?: string;
}

export interface FilePatch {
  path: string;
  binary: boolean;
  /** Unified diff of this file alone. Empty when there is nothing to show. */
  patch: string;
}

export interface ReadLogInput {
  /** A `git log --format` string. */
  format: string;
  /** How many commits back to read. */
  limit: number;
}

export interface GitService {
  /**
   * Whether a path is the root of a git repository — and if not, which of the
   * four ways it failed. F2.2 requires the user to be told *which*.
   */
  isGitRepo(path: string): Promise<RepoCheck>;
  /**
   * The branch a worktree should be cut from, F4.3.
   *
   * The remote's HEAD when there is one, the checked-out branch otherwise. No
   * fetch: the PRD says to use what is on disk.
   */
  resolveDefaultBranch(path: string): Promise<string>;
  /** Whether a local branch of that name already exists, F4.2. */
  branchExists(repoPath: string, branch: string): Promise<boolean>;
  /**
   * Every branch this repository knows about, F7.3.
   *
   * From the disk, never from the network: F4.3 settled that for the base
   * branch and a list is no reason to revisit it. A branch that exists locally
   * and on a remote appears **once**, as local — two entries would offer the
   * same work twice and do different things when picked.
   */
  listBranches(repoPath: string): Promise<BranchItem[]>;
  /**
   * Whether the repository has any commit at all, F6.13.
   *
   * A repository cloned empty is a legitimate project (Q19) and cannot have a
   * worktree cut from it: the branch exists as a name and not as a commit, and
   * `git worktree add` fails on an invalid reference. Asked out loud so the
   * screen can explain instead of letting git answer.
   */
  hasCommits(path: string): Promise<boolean>;
  /**
   * One ref from one remote, F7.3 and F7.5.
   *
   * Targeted rather than whole: this runs while the user waits for a worktree,
   * and a full fetch on a big repository is a different order of wait.
   */
  fetchRef(repoPath: string, input: { remote: string; ref: string }): Promise<void>;
  /** `git fetch --prune`, behind the `atualizar` button of F7.3. */
  fetchAll(repoPath: string, input?: { remote?: string }): Promise<void>;
  /**
   * `git worktree add`, in one of the four modes above.
   *
   * Every refusal this makes on its own is one git would also make, worded so
   * the user knows what to do: git's own message for a branch that is already
   * checked out talks about refs and buries the path that matters.
   */
  addWorktree(input: AddWorktreeInput): Promise<void>;
  listWorktrees(repoPath: string): Promise<WorktreeEntry[]>;
  /** `git worktree remove`. Never deletes the branch, F4.7. */
  removeWorktree(input: RemoveWorktreeInput): Promise<void>;
  /**
   * `git worktree repair`, after a checkout has been moved, F6.12.
   *
   * A worktree keeps **absolute** paths on both sides of its link: the `.git`
   * file inside it, and `gitdir` under `<repo>/.git/worktrees/<nome>/`. A plain
   * `mv` only invalidates the second one — measured, not assumed: the moved
   * checkout still answers `git status`, because its own `.git` points at a
   * repository that did not move.
   *
   * What breaks is the repository's side. It goes on listing the old path, and
   * a `git worktree prune` — which git runs on its own during several ordinary
   * operations — then deletes the administrative directory of a worktree it
   * believes is gone. The checkout breaks later, far from the move that did it.
   */
  repairWorktree(input: { repoPath: string; path: string }): Promise<void>;
  getStatus(path: string): Promise<WorktreeStatus>;
  getAheadBehind(path: string, baseBranch: string): Promise<AheadBehind>;
  /**
   * What changed in a checkout, in one of the two views of D1.
   *
   * `worktree` is the working tree against `HEAD`, plus what is not tracked
   * yet. `base` walks further back — to the merge-base with the branch this
   * worktree was cut from — so committed work shows up too.
   */
  listChanges(path: string, input: ChangesInput): Promise<ChangeSet>;
  /**
   * Raw `git log`, in the caller's own `--format`.
   *
   * The format is not this service's business: the one caller today is the
   * revert scan of the action signals (Q17), and what it needs out of a commit
   * is not what a history view would need. Bounded by `limit` because a scan
   * looks back, not all the way.
   */
  readLog(path: string, input: ReadLogInput): Promise<string>;
  /**
   * The unified diff of a single file, F4.4.
   *
   * One file at a time on purpose: a whole refactor's diff overruns the 16 MiB
   * `maxBuffer` of `execGit`, and one file would take the tab down with it.
   */
  filePatch(path: string, file: string, input: ChangesInput): Promise<FilePatch>;
  /**
   * Everything the onboarding shows about a repository before adding it.
   *
   * One method rather than five calls from the router, because the five reads
   * have to agree about *when* they happened: a repository that gets committed to
   * between the commit count and the status would be reported as clean with a
   * stale count.
   */
  describe(path: string): Promise<RepoDescription>;
}

/**
 * What a repository *is*, read before it is registered (onboarding F4.3).
 *
 * Every field is optional-shaped rather than throwing, because each of these is a
 * normal state for a real repository: no remote, no commit yet, a detached HEAD.
 * A screen that refused to describe a fresh `git init` would be refusing the case
 * it is most likely to meet on someone's first day.
 */
export interface RepoDescription {
  root: string;
  /** Null in a repository with no commit yet. */
  head: { branch: string | null; shortSha: string | null };
  /** Null when there is no `origin`. Other remotes are not asked about. */
  origin: string | null;
  /** Zero in a repository with no commit yet. */
  commits: number;
  status: WorktreeStatus;
  /**
   * Every checkout git knows about, the main one included.
   *
   * The main checkout is in this list — `git worktree list` always prints it —
   * and the caller is the one that knows which of the others it created.
   */
  worktrees: WorktreeEntry[];
}

export interface GitServiceOptions {
  exec?: GitExec;
}

export function createGitService({ exec = execGit }: GitServiceOptions = {}): GitService {
  async function branchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      await exec(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoPath });
      return true;
    } catch {
      // `--verify --quiet` exits non-zero and says nothing when the ref is
      // absent, which is the answer rather than a failure.
      return false;
    }
  }

  /**
   * Refuses a branch some other worktree already has checked out, F7.4.
   *
   * git refuses this too, with an absolute path buried in the middle of its
   * stderr. The path is the only part the user needs, so it is the message.
   */
  async function refuseIfHeld(repoPath: string, branch: string): Promise<void> {
    const { stdout } = await exec(["worktree", "list", "--porcelain", "-z"], { cwd: repoPath });
    const holder = parseWorktreeList(stdout).find((entry) => entry.branch === branch);
    if (holder === undefined) return;
    throw new DomainError(
      "BLOCKED",
      `a branch "${branch}" já está aberta na worktree em ${holder.path}`,
    );
  }

  /** How far apart two refs are, in commits, in both directions. */
  async function divergence(
    repoPath: string,
    local: string,
    remoteRef: string,
  ): Promise<AheadBehind> {
    const { stdout } = await exec(
      ["rev-list", "--left-right", "--count", `${local}...${remoteRef}`],
      { cwd: repoPath },
    );
    const [ahead, behind] = stdout.trim().split(/\s+/).map(Number);
    return { ahead: ahead ?? 0, behind: behind ?? 0 };
  }

  /**
   * Deletes the branch when the checkout fails.
   *
   * Measured, not assumed: `worktree add` creates the branch *before* it
   * discovers the target directory is unusable, and leaves it behind. The PRD
   * says a failed creation registers nothing, and a stray branch is worse than
   * nothing — it makes the next attempt with the same name fail on "branch
   * already exists".
   */
  async function withBranchCleanup(
    repoPath: string,
    branch: string,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      await exec(["branch", "-D", branch], { cwd: repoPath }).catch(() => {});
      throw error;
    }
  }

  const service: GitService = {
    hasCommits,

    async isGitRepo(path) {
      let info;
      try {
        info = await stat(path);
      } catch {
        return { ok: false, problem: "missing", message: `o caminho ${path} não existe` };
      }
      if (!info.isDirectory()) {
        return { ok: false, problem: "not-a-directory", message: `${path} não é um diretório` };
      }

      let root: string;
      try {
        const { stdout } = await exec(["rev-parse", "--show-toplevel"], { cwd: path });
        root = stdout.trim();
      } catch {
        // Any failure here means the same thing to the user, and git's wording
        // ("not a git repository (or any of the parent directories)") describes
        // a search they did not ask for.
        return {
          ok: false,
          problem: "not-a-repo",
          message: `${path} não é um repositório git`,
        };
      }

      // Compared through realpath because /tmp is a symlink to /private/tmp on
      // macOS: the same directory, spelled two ways, would look like a
      // subdirectory of itself.
      const [realRoot, realPath] = await Promise.all([realpath(root), realpath(path)]);
      if (realRoot !== realPath) {
        return {
          ok: false,
          problem: "not-root",
          message: `${path} está dentro do repositório ${root}, mas não é a raiz dele`,
        };
      }

      return { ok: true, root };
    },

    async readLog(path, { format, limit }) {
      const { stdout } = await exec(["log", `--max-count=${limit}`, `--format=${format}`], {
        cwd: path,
      });
      return stdout;
    },

    async resolveDefaultBranch(path) {
      // What `git remote set-head` records: the branch the remote itself calls
      // default. Present after a clone, absent in a repository born locally.
      try {
        const { stdout } = await exec(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], {
          cwd: path,
        });
        const ref = stdout.trim();
        if (ref.startsWith("refs/remotes/origin/")) {
          return ref.slice("refs/remotes/origin/".length);
        }
      } catch {
        /* no remote, or no recorded head — fall through */
      }

      // `branch --show-current`, not `rev-parse --abbrev-ref HEAD`: it answers
      // correctly in a repository whose first commit does not exist yet, where
      // rev-parse fails outright.
      const { stdout } = await exec(["branch", "--show-current"], { cwd: path });
      const current = stdout.trim();
      if (current === "") {
        throw new DomainError(
          "GIT_FAILED",
          `não dá para descobrir a branch default de ${path}: o HEAD está destacado`,
        );
      }
      return current;
    },

    branchExists,

    async listBranches(repoPath) {
      // `%00` between the fields, and a ref per line: a branch name may contain
      // anything but a NUL, so this is the only separator that cannot appear
      // inside the value it separates.
      const { stdout } = await exec(
        [
          "for-each-ref",
          "--format=%(refname)%00%(committerdate:unix)",
          "refs/heads",
          "refs/remotes",
        ],
        { cwd: repoPath },
      );

      const held = new Map<string, string>();
      for (const entry of await this.listWorktrees(repoPath)) {
        if (entry.branch !== null) held.set(entry.branch, entry.path);
      }

      const locals = new Set<string>();
      const remotes: BranchItem[] = [];
      const items: BranchItem[] = [];

      for (const line of stdout.split("\n")) {
        if (line === "") continue;
        const [refname = "", seconds = ""] = line.split("\0");
        const lastCommitAt = Number(seconds) * 1000;

        if (refname.startsWith("refs/heads/")) {
          const name = refname.slice("refs/heads/".length);
          locals.add(name);
          items.push({ name, remote: null, lastCommitAt, usedByPath: held.get(name) ?? null });
          continue;
        }

        const rest = refname.slice("refs/remotes/".length);
        const separator = rest.indexOf("/");
        if (separator === -1) continue;
        const name = rest.slice(separator + 1);
        // `origin/HEAD` is a pointer at another branch, not a branch. Cutting a
        // worktree from it would cut from a name that moves.
        if (name === "HEAD") continue;
        remotes.push({ name, remote: rest.slice(0, separator), lastCommitAt, usedByPath: null });
      }

      for (const branch of remotes) {
        if (!locals.has(branch.name)) items.push(branch);
      }

      // Name as the second key: git records dates by the second, and two
      // branches touched in the same second are ordinary. Without it the list
      // reorders itself between two identical calls.
      return items.sort((a, b) =>
        b.lastCommitAt === a.lastCommitAt
          ? a.name.localeCompare(b.name)
          : b.lastCommitAt - a.lastCommitAt,
      );
    },

    async fetchRef(repoPath, { remote, ref }) {
      refuseFlagLike(remote, ref);
      await exec(["fetch", "--", remote, ref], {
        cwd: repoPath,
        timeoutMs: FETCH_TIMEOUT_MS,
        env: cloneEnv(),
      });
    },

    async fetchAll(repoPath, input = {}) {
      const remote = input.remote ?? "origin";
      refuseFlagLike(remote);
      await exec(["fetch", "--prune", "--", remote], {
        cwd: repoPath,
        timeoutMs: FETCH_TIMEOUT_MS,
        env: cloneEnv(),
      });
    },

    async addWorktree(input) {
      const { repoPath, targetPath } = input;

      if (input.mode === "detach") {
        await exec(["worktree", "add", "--detach", targetPath, input.commitish], { cwd: repoPath });
        return;
      }

      if (input.mode === "existing") {
        if (!(await branchExists(repoPath, input.branch))) {
          throw new DomainError("NOT_FOUND", `a branch "${input.branch}" não existe`);
        }
        await refuseIfHeld(repoPath, input.branch);
        await exec(["worktree", "add", targetPath, input.branch], { cwd: repoPath });
        return;
      }

      if (input.mode === "track") {
        const remoteRef = `${input.remote}/${input.branch}`;

        if (await branchExists(repoPath, input.branch)) {
          await refuseIfHeld(repoPath, input.branch);
          // Q22: a local branch that is behind would open the worktree on old
          // code without anybody noticing, and resetting it would write over
          // work. Both are worse than one more click.
          const { ahead, behind } = await divergence(repoPath, input.branch, remoteRef);
          if (behind > 0) {
            const extra = ahead > 0 ? ` e ${plural(ahead, "à frente", "à frente")}` : "";
            throw new DomainError(
              "BLOCKED",
              `a branch local "${input.branch}" está ${plural(behind, "commit atrás", "commits atrás")} de "${remoteRef}"${extra} — atualize-a antes de cortar uma worktree dela`,
            );
          }
          await exec(["worktree", "add", targetPath, input.branch], { cwd: repoPath });
          return;
        }

        // `--track -b` explicitly, never the DWIM: guessing the remote depends
        // on `checkout.guess`, and with it off the implicit version produces a
        // detached HEAD that only surfaces at the first push.
        await withBranchCleanup(repoPath, input.branch, () =>
          exec(["worktree", "add", "--track", "-b", input.branch, targetPath, remoteRef], {
            cwd: repoPath,
          }),
        );
        return;
      }

      // Checked here, not left to git, because F4.2 wants the user told to pick
      // another name — and git's own message for this talks about refs.
      if (await branchExists(repoPath, input.branch)) {
        throw new DomainError("BLOCKED", `a branch "${input.branch}" já existe; escolha outro nome`);
      }

      await withBranchCleanup(repoPath, input.branch, () =>
        exec(["worktree", "add", "-b", input.branch, targetPath, input.baseBranch], {
          cwd: repoPath,
        }),
      );
    },

    async listWorktrees(repoPath) {
      // `-z` rather than plain porcelain: without it git C-quotes any path with
      // a space or an accent, and every consumer would have to unquote it.
      const { stdout } = await exec(["worktree", "list", "--porcelain", "-z"], { cwd: repoPath });
      return parseWorktreeList(stdout);
    },

    async removeWorktree({ repoPath, path, force = false }) {
      // No branch deletion anywhere in here: F4.7 keeps the work reachable
      // after the checkout is gone.
      await exec(["worktree", "remove", ...(force ? ["--force"] : []), path], { cwd: repoPath });
    },

    async repairWorktree({ repoPath, path }) {
      // From the main repository, and naming the new location: git rewrites
      // both sides of the link from here.
      await exec(["worktree", "repair", path], { cwd: repoPath });
    },

    async getStatus(path) {
      // `--porcelain -z` with untracked files included: F4.8 counts a new file
      // as dirty, and losing one to a forced removal is losing work.
      const { stdout } = await exec(["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
        cwd: path,
      });
      const changedFiles = countStatusEntries(stdout);
      return { clean: changedFiles === 0, changedFiles };
    },

    async getAheadBehind(path, baseBranch) {
      const { stdout } = await exec(
        ["rev-list", "--left-right", "--count", `${baseBranch}...HEAD`],
        { cwd: path },
      );
      const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
      // left...right counts the base side first: commits the worktree does not
      // have are what it is *behind* by.
      return { ahead: ahead ?? 0, behind: behind ?? 0 };
    },

    async listChanges(path, input) {
      const comparedTo = await resolveComparison(path, input);

      const tracked = comparedTo === null ? [] : await trackedChanges(path, comparedTo);
      const untracked = await untrackedChanges(path);

      // A rename shows up under its new path, and untracked files cannot
      // collide with tracked ones, so a plain concatenation is enough.
      const files = [...tracked, ...untracked].sort((a, b) => (a.path < b.path ? -1 : 1));
      return { ref: input.ref, comparedTo, files };
    },

    async filePatch(path, file, input) {
      const comparedTo = await resolveComparison(path, input);
      const untracked = comparedTo === null || (await isUntracked(path, file));

      const { stdout } = untracked
        ? // `--no-index` is how git diffs something it does not track. It
          // exits 1 whenever there *is* a difference, which is the normal case
          // here — so the diff arrives as a failure and is read off it.
          await exec(["diff", "--no-index", "--", "/dev/null", file], { cwd: path }).catch(
            (error) => ({ stdout: outputOf(error), stderr: "" }),
          )
        : await exec(["diff", comparedTo, "--", file], { cwd: path });

      const binary = /^Binary files .* differ$/m.test(stdout);
      return { path: file, binary, patch: binary ? "" : stdout };
    },

    async describe(path) {
      const check = await service.isGitRepo(path);
      if (!check.ok) throw new DomainError("INVALID_ARGUMENT", check.message);

      /*
       * Each read answers on its own.
       *
       * A repository with no commit fails `rev-parse HEAD` and counts no commits;
       * one with no remote has no `origin`. Both are ordinary, so neither may take
       * the description down — the caller is describing a repository precisely
       * because it does not know yet what shape it is in.
       */
      const [branch, shortSha, origin, commits, status, worktrees] = await Promise.all([
        exec(["branch", "--show-current"], { cwd: path })
          .then(({ stdout }) => (stdout.trim() === "" ? null : stdout.trim()))
          .catch(() => null),
        exec(["rev-parse", "--short", "HEAD"], { cwd: path })
          .then(({ stdout }) => stdout.trim())
          .catch(() => null),
        exec(["remote", "get-url", "origin"], { cwd: path })
          .then(({ stdout }) => stdout.trim())
          .catch(() => null),
        exec(["rev-list", "--count", "HEAD"], { cwd: path })
          .then(({ stdout }) => Number.parseInt(stdout.trim(), 10) || 0)
          .catch(() => 0),
        service.getStatus(path),
        service.listWorktrees(path),
      ]);

      return { root: check.root, head: { branch, shortSha }, origin, commits, status, worktrees };
    },
  };


  /**
   * What the working tree is compared against, for either view.
   *
   * Returns null for a repository with no commit yet: `git diff HEAD` fails
   * there with "unknown revision", and a brand-new worktree is the common case,
   * not an edge one. Everything is new when there is nothing to compare to.
   */
  async function resolveComparison(path: string, input: ChangesInput): Promise<string | null> {
    if (!(await hasCommits(path))) return null;
    if (input.ref === "worktree") return "HEAD";

    const base = input.baseBranch;
    if (base === undefined || base === "") {
      throw new DomainError("INVALID_ARGUMENT", "a vista contra a base precisa de uma branch");
    }
    try {
      const { stdout } = await exec(["merge-base", base, "HEAD"], { cwd: path });
      return stdout.trim();
    } catch {
      // Told apart from a generic git failure because the UI disables just this
      // view for it, and needs a sentence to explain why.
      throw new DomainError(
        "NOT_FOUND",
        `a branch "${base}" não existe mais neste repositório — sem base, não há o que comparar`,
      );
    }
  }

  async function hasCommits(path: string): Promise<boolean> {
    try {
      await exec(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: path });
      return true;
    } catch {
      // `--verify --quiet` says nothing and exits non-zero on an unborn HEAD,
      // which is the answer rather than a failure.
      return false;
    }
  }

  async function isUntracked(path: string, file: string): Promise<boolean> {
    const { stdout } = await exec(["ls-files", "--error-unmatch", "-z", "--", file], {
      cwd: path,
    }).catch(() => ({ stdout: "", stderr: "" }));
    return stdout.trim() === "";
  }

  /** Everything git already knows about: the two `diff` reads, joined by path. */
  async function trackedChanges(path: string, comparedTo: string): Promise<ChangedFile[]> {
    const [status, numbers] = await Promise.all([
      exec(["diff", "--name-status", "-z", comparedTo], { cwd: path }),
      exec(["diff", "--numstat", "-z", comparedTo], { cwd: path }),
    ]);

    const counts = parseNumstat(numbers.stdout);
    return parseNameStatus(status.stdout).map((entry) => ({
      ...entry,
      ...(counts.get(entry.path) ?? { additions: 0, deletions: 0, binary: false }),
    }));
  }

  /**
   * Files git is not tracking yet, F4.1.
   *
   * Counted one by one with `--no-index`, which is the only way to get real
   * numbers for a file that has no blob. The list is short by construction:
   * `status` already leaves out everything `.gitignore` covers.
   */
  async function untrackedChanges(path: string): Promise<ChangedFile[]> {
    const { stdout } = await exec(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: path },
    );

    const paths = parseUntracked(stdout);
    return Promise.all(
      paths.map(async (file) => {
        const { stdout: numstat } = await exec(
          ["diff", "--numstat", "-z", "--no-index", "--", "/dev/null", file],
          { cwd: path },
        ).catch((error) => ({ stdout: outputOf(error), stderr: "" }));

        const counted = parseNumstat(numstat).get(file);
        return {
          path: file,
          oldPath: null,
          status: "untracked" as const,
          additions: counted?.additions ?? 0,
          deletions: 0,
          binary: counted?.binary ?? false,
        };
      }),
    );
  }

  return service;
}

/**
 * The stdout of a git command that failed on purpose.
 *
 * `git diff --no-index` exits 1 when the two sides differ, so for an untracked
 * file the diff *is* the failure. `execGit` wraps the original error as the
 * cause of its DomainError, which is where the output survives.
 */
function outputOf(error: unknown): string {
  const cause = (error as { cause?: { stdout?: string } }).cause;
  return cause?.stdout ?? "";
}

interface Counts {
  additions: number;
  deletions: number;
  binary: boolean;
}

/**
 * Parses `git diff --numstat -z`.
 *
 * Ordinary entries are `adds\tdels\tpath\0`. A rename is
 * `adds\tdels\t\0old\0new\0`: the path field is empty and the two names follow
 * as their own records, which is why this cannot be a per-field loop.
 *
 * A binary file has `-` where the counts are; treating that as 0 would be a
 * lie, so it is carried as a flag instead.
 */
export function parseNumstat(stdout: string): Map<string, Counts> {
  const fields = stdout.split("\0");
  const counts = new Map<string, Counts>();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === undefined || field === "") continue;

    const [adds, dels, name] = field.split("\t");
    if (adds === undefined || dels === undefined) continue;

    const binary = adds === "-" || dels === "-";
    const entry: Counts = {
      additions: binary ? 0 : Number(adds),
      deletions: binary ? 0 : Number(dels),
      binary,
    };

    if (name === undefined || name === "") {
      // Rename: the old name is the next field, the new one the field after.
      const to = fields[index + 2];
      index += 2;
      if (to !== undefined && to !== "") counts.set(to, entry);
      continue;
    }
    counts.set(name, entry);
  }

  return counts;
}

/** Parses `git diff --name-status -z` into everything but the counts. */
export function parseNameStatus(
  stdout: string,
): Array<{ path: string; oldPath: string | null; status: ChangeStatus }> {
  const fields = stdout.split("\0").filter((field) => field !== "");
  const entries: Array<{ path: string; oldPath: string | null; status: ChangeStatus }> = [];

  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index]!;
    // R and C carry a similarity score — R100 — and consume two names.
    if (code.startsWith("R") || code.startsWith("C")) {
      const from = fields[index + 1];
      const to = fields[index + 2];
      index += 2;
      if (to !== undefined) entries.push({ path: to, oldPath: from ?? null, status: "renamed" });
      continue;
    }

    const name = fields[index + 1];
    index += 1;
    if (name === undefined) continue;
    const status: ChangeStatus =
      code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    entries.push({ path: name, oldPath: null, status });
  }

  return entries;
}

/**
 * The `??` entries of `git status --porcelain=v1 -z`.
 *
 * Every record is `XY path`, and a rename adds a second path — skipped here
 * because a rename is never untracked.
 */
export function parseUntracked(stdout: string): string[] {
  const fields = stdout.split("\0").filter((field) => field !== "");
  const paths: string[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.startsWith("R") || field.startsWith("C")) index += 1;
    if (field.startsWith("?? ")) paths.push(field.slice(3));
  }

  return paths;
}

/**
 * Parses `git worktree list --porcelain -z`.
 *
 * Records are separated by an empty NUL-terminated line, so the stream is
 * `key value\0key value\0\0key value\0…`.
 */
/**
 * Refuses an argument git would read as an option.
 *
 * `--` covers the positional side, and this covers what `--` cannot: a value
 * that reaches a place where git still parses options. Both, because one of
 * them being enough is the kind of thing that stops being true.
 */
function refuseFlagLike(...values: readonly string[]): void {
  for (const value of values) {
    if (value.startsWith("-")) {
      throw new DomainError("INVALID_ARGUMENT", `"${value}" começa com "-" e seria lido como opção`);
    }
    if (value === "" || /[\s\0]/.test(value)) {
      throw new DomainError("INVALID_ARGUMENT", `"${value}" não é um nome de remoto ou ref válido`);
    }
  }
}

/** "1 commit atrás" and "2 commits atrás" — the number is the point of the sentence. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;

  for (const line of stdout.split("\0")) {
    if (line === "") {
      if (current) entries.push(current);
      current = null;
      continue;
    }

    const separator = line.indexOf(" ");
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);

    if (key === "worktree") {
      current = { path: value, branch: null, head: null, detached: false, prunable: false };
    } else if (current === null) {
      continue;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    } else if (key === "detached") {
      current.detached = true;
    } else if (key === "prunable") {
      current.prunable = true;
    }
  }

  if (current) entries.push(current);
  return entries;
}

/**
 * Counts entries in `git status --porcelain=v1 -z`.
 *
 * A rename is `R  new\0old\0`: two NUL-separated fields for one change. Counting
 * separators instead of entries would report every rename twice, and the count
 * is what the user reads before deciding to force a removal.
 */
export function countStatusEntries(stdout: string): number {
  const fields = stdout.split("\0").filter((field) => field !== "");
  let count = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    count += 1;
    // XY is the two-letter status; a rename or copy consumes the next field.
    if (field.startsWith("R") || field.startsWith("C")) index += 1;
  }
  return count;
}
