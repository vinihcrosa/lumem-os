import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

/** A second repository, so specs sharing a daemon cannot collide on branches. */
export const E2E_FIXTURE_REPO_ALT = join(E2E_FIXTURE_DIR, "repo-alt");

/** A third, for the right panel: it needs a tree to walk and a file to read. */
export const E2E_FIXTURE_REPO_FILES = join(E2E_FIXTURE_DIR, "repo-files");

/**
 * A fourth, for the editor, and it is not sharing the third.
 *
 * This is the first spec whose gestures *change* the checkout: it corrects a
 * line, renames a file and deletes one, and it does so in a repository the
 * right panel is asserting the contents of. Sharing one would make the order
 * the specs happen to run in part of what each of them proves.
 */
export const E2E_FIXTURE_REPO_EDITOR = join(E2E_FIXTURE_DIR, "repo-editor");

/** Where the ACP conversation spec makes its worktree. */
export const E2E_FIXTURE_REPO_ACP = join(E2E_FIXTURE_DIR, "repo-acp");

/** An "agent CLI" that echoes what it is given. Never the real `claude`. */
export const E2E_FIXTURE_AGENT = join(E2E_FIXTURE_DIR, "bin", "fake-agent");

/**
 * An ACP agent that speaks the protocol over stdio and never calls a model.
 *
 * Lives beside the specs rather than in the generated fixture directory: it is
 * source, not a fixture, and it is the only thing here that has to be readable
 * when a test about it fails.
 */
export const E2E_FAKE_ACP_AGENT = fileURLToPath(new URL("./fake-acp-agent.mjs", import.meta.url));

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

/**
 * Rebuilt from nothing on every run, not reused.
 *
 * The state directory is wiped each run but a git repository is not: branches
 * created by the last run survive, and the second run then fails on "a branch
 * already exists" for a worktree the daemon has no record of. That failure
 * looks like a product bug and is not one.
 */
export function createFixtures(): void {
  rmSync(E2E_FIXTURE_DIR, { recursive: true, force: true });

  for (const repo of [
    E2E_FIXTURE_REPO,
    E2E_FIXTURE_REPO_ALT,
    E2E_FIXTURE_REPO_FILES,
    E2E_FIXTURE_REPO_EDITOR,
    E2E_FIXTURE_REPO_ACP,
  ]) {
    mkdirSync(repo, { recursive: true });
    git(repo, "init", "--initial-branch", "main", ".");
    writeFileSync(join(repo, "README.md"), "# fixture\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-m", "initial");
  }

  // Somewhere for the files column to walk into, with a line worth reading at
  // the end of it. Committed, so the checkout starts clean.
  mkdirSync(join(E2E_FIXTURE_REPO_FILES, "src", "lore"), { recursive: true });
  writeFileSync(
    join(E2E_FIXTURE_REPO_FILES, "src", "lore", "loader.ts"),
    'export const CARIMBO = "lido pela coluna";\n',
  );
  git(E2E_FIXTURE_REPO_FILES, "add", "-A");
  git(E2E_FIXTURE_REPO_FILES, "commit", "-m", "arquivos para a coluna");

  // A line that is wrong, one directory down, and committed — so correcting it
  // is a one-line diff the `Mudanças` tab can be asked about, and so the file
  // has to be walked into rather than sitting at the root. The wrong and the
  // right spelling differ by a whole word, which is what lets an assertion say
  // which of the two the disk is holding.
  mkdirSync(join(E2E_FIXTURE_REPO_EDITOR, "src"), { recursive: true });
  writeFileSync(
    join(E2E_FIXTURE_REPO_EDITOR, "src", "notes.ts"),
    ['export const RESPOSTA = "quarenta e um";', 'export const AUTOR = "o agente";', ""].join("\n"),
  );
  git(E2E_FIXTURE_REPO_EDITOR, "add", "-A");
  git(E2E_FIXTURE_REPO_EDITOR, "commit", "-m", "arquivo para o editor");

  const binDir = join(E2E_FIXTURE_DIR, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    E2E_FIXTURE_AGENT,
    ['#!/bin/sh', 'echo "fake-agent pronto em $(pwd)"', "cat", ""].join("\n"),
    { mode: 0o755 },
  );
}
