import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Real git repositories in temporary directories.
 *
 * `docs/project/testing.md`: git is never mocked. `git worktree` has edge
 * cases — a name with a slash, a branch that already exists, a repository with
 * no commits — that no double reproduces, and those are exactly the cases the
 * PRD calls out.
 */

const created: string[] = [];

/** Deletes every fixture made so far. Call from an afterEach. */
export function cleanupGitFixtures(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function tempDir(prefix = "lumem-git-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      // Deterministic authorship: a machine with no user.name configured would
      // otherwise fail at the first commit.
      GIT_AUTHOR_NAME: "Lumem Test",
      GIT_AUTHOR_EMAIL: "test@lumem.local",
      GIT_COMMITTER_NAME: "Lumem Test",
      GIT_COMMITTER_EMAIL: "test@lumem.local",
    },
  });
  return stdout;
}

export interface RepoOptions {
  /** Branch the first commit lands on. */
  branch?: string;
  /** Records `refs/remotes/origin/HEAD`, as a clone would. */
  remoteHead?: string;
  /** Skips the first commit, leaving an unborn branch. */
  empty?: boolean;
}

/** A repository with one commit, unless asked otherwise. */
export async function createRepo(options: RepoOptions = {}): Promise<string> {
  const { branch = "main", remoteHead, empty = false } = options;
  const dir = tempDir();

  await git(dir, "init", "--initial-branch", branch, ".");
  if (!empty) {
    writeFileSync(join(dir, "README.md"), "# fixture\n");
    await git(dir, "add", "README.md");
    await git(dir, "commit", "-m", "initial");
  }

  if (remoteHead !== undefined) {
    // A URL that is never contacted: nothing here fetches, and the PRD forbids
    // it anyway. What matters is that the ref exists locally.
    await git(dir, "remote", "add", "origin", "https://example.invalid/fixture.git");
    await git(
      dir,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      `refs/remotes/origin/${remoteHead}`,
    );
  }

  return dir;
}

/** A directory that is not a repository at all. */
export function createPlainDir(): string {
  return tempDir("lumem-plain-");
}

/** A subdirectory inside a repository — valid git, invalid project root. */
export function createSubdir(repoPath: string, name = "packages/inner"): string {
  const path = join(repoPath, name);
  mkdirSync(path, { recursive: true });
  return path;
}

export { git as runGit };

/**
 * A repository big enough that cloning it takes long enough to interrupt.
 *
 * Cancellation is only observable while the process is alive, and a two-file
 * repository clones faster than a test can react to it.
 */
export async function createHeavyRepo(megabytes = 24): Promise<string> {
  const dir = tempDir("lumem-heavy-");
  await git(dir, "init", "--initial-branch", "main", ".");
  // Random rather than zeroes: git compresses a predictable file into nothing,
  // and a packfile of nothing is exactly as fast as an empty repository.
  writeFileSync(join(dir, "big.bin"), randomBytes(megabytes * 1024 * 1024));
  await git(dir, "add", "big.bin");
  await git(dir, "commit", "-m", "big");
  return dir;
}
