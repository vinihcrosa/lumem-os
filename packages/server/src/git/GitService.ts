import { realpath, stat } from "node:fs/promises";

import { DomainError } from "../errors.js";
import { execGit, type GitExec } from "./exec.js";

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

export interface AddWorktreeInput {
  repoPath: string;
  /** Branch to create. Same as the worktree's name, F4.2. */
  branch: string;
  targetPath: string;
  /** Where the new branch starts, F4.3. */
  baseBranch: string;
}

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
  /** `git worktree add -b`, F4.1–F4.5. */
  addWorktree(input: AddWorktreeInput): Promise<void>;
  listWorktrees(repoPath: string): Promise<WorktreeEntry[]>;
  /** `git worktree remove`. Never deletes the branch, F4.7. */
  removeWorktree(input: RemoveWorktreeInput): Promise<void>;
  getStatus(path: string): Promise<WorktreeStatus>;
  getAheadBehind(path: string, baseBranch: string): Promise<AheadBehind>;
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

  return {
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

    async addWorktree({ repoPath, branch, targetPath, baseBranch }) {
      // Checked here, not left to git, because F4.2 wants the user told to pick
      // another name — and git's own message for this talks about refs.
      if (await branchExists(repoPath, branch)) {
        throw new DomainError("BLOCKED", `a branch "${branch}" já existe; escolha outro nome`);
      }

      try {
        await exec(["worktree", "add", "-b", branch, targetPath, baseBranch], { cwd: repoPath });
      } catch (error) {
        // Measured, not assumed: `worktree add` creates the branch *before* it
        // discovers the target directory is unusable, and leaves it behind. The
        // PRD says a failed creation registers nothing, and a stray branch is
        // worse than nothing — it makes the next attempt with the same name
        // fail on "branch already exists".
        await exec(["branch", "-D", branch], { cwd: repoPath }).catch(() => {});
        throw error;
      }
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
  };
}

/**
 * Parses `git worktree list --porcelain -z`.
 *
 * Records are separated by an empty NUL-terminated line, so the stream is
 * `key value\0key value\0\0key value\0…`.
 */
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
