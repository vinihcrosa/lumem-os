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
}

export interface GitServiceOptions {
  exec?: GitExec;
}

export function createGitService({ exec = execGit }: GitServiceOptions = {}): GitService {
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
  };
}
