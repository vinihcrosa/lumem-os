import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A throwaway git repository for the e2e suite.
 *
 * Deliberately *not* the Lumem repository itself: the suite creates worktrees
 * and branches, and doing that in the developer's own checkout would leave
 * their `git branch` output full of test debris.
 */
export const E2E_FIXTURE_DIR = fileURLToPath(new URL("../../.lumem-e2e-fixtures/", import.meta.url));
export const E2E_FIXTURE_REPO = join(E2E_FIXTURE_DIR, "repo");

/** An "agent CLI" that echoes what it is given. Never the real `claude`. */
export const E2E_FIXTURE_AGENT = join(E2E_FIXTURE_DIR, "bin", "fake-agent");

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Lumem E2E",
      GIT_AUTHOR_EMAIL: "e2e@lumem.local",
      GIT_COMMITTER_NAME: "Lumem E2E",
      GIT_COMMITTER_EMAIL: "e2e@lumem.local",
    },
  });
}

/** Idempotent, so a rerun after a crash does not have to start from nothing. */
export function createFixtures(): void {
  if (!existsSync(E2E_FIXTURE_REPO)) {
    mkdirSync(E2E_FIXTURE_REPO, { recursive: true });
    git(E2E_FIXTURE_REPO, "init", "--initial-branch", "main", ".");
    writeFileSync(join(E2E_FIXTURE_REPO, "README.md"), "# fixture\n");
    git(E2E_FIXTURE_REPO, "add", "README.md");
    git(E2E_FIXTURE_REPO, "commit", "-m", "initial");
  }

  const binDir = join(E2E_FIXTURE_DIR, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    E2E_FIXTURE_AGENT,
    ['#!/bin/sh', 'echo "fake-agent pronto em $(pwd)"', "cat", ""].join("\n"),
    { mode: 0o755 },
  );
}
