import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import {
  cleanupGitFixtures,
  commitOn,
  createRepo,
  createRepoWithOrigin,
  runGit,
  tempDir,
} from "../testing/git-fixtures.js";
import { createGitService } from "./GitService.js";

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

function worktreeRoot(): string {
  const root = join(tempDir("lumem-worktrees-"), "lorebase");
  mkdirSync(root, { recursive: true });
  return root;
}

/** The origin already fetched, with `feat/login` only on the remote. */
async function cloned(): Promise<{ repo: string; upstream: string; root: string }> {
  const { repo, upstream } = await createRepoWithOrigin({ branches: ["feat/login"] });
  return { repo, upstream, root: worktreeRoot() };
}

describe("addWorktree, mode existing", () => {
  it("checks out a branch that is already there, without creating one", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "corrige-sidebar");
    const target = join(worktreeRoot(), "corrige-sidebar");

    await git.addWorktree({
      mode: "existing",
      repoPath: repo,
      branch: "corrige-sidebar",
      targetPath: target,
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("corrige-sidebar");
  });

  it("refuses a branch another worktree already holds, naming the checkout", async () => {
    // F7.4. git's own message for this buries an absolute path in stderr; the
    // path is the one thing the user needs, so it is the message.
    const repo = await createRepo({ branch: "main" });
    const first = join(worktreeRoot(), "huygens");
    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "feat/editor",
      targetPath: first,
      baseBranch: "main",
    });

    const failure = git.addWorktree({
      mode: "existing",
      repoPath: repo,
      branch: "feat/editor",
      targetPath: join(worktreeRoot(), "outra"),
    });

    await expect(failure).rejects.toBeInstanceOf(DomainError);
    await expect(failure).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(failure).rejects.toThrow(/já está aberta/);
  });

  it("refuses a branch that does not exist", async () => {
    const repo = await createRepo({ branch: "main" });

    const failure = git.addWorktree({
      mode: "existing",
      repoPath: repo,
      branch: "fantasma",
      targetPath: join(worktreeRoot(), "fantasma"),
    });

    await expect(failure).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("takes a branch whose name has a slash", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "feat/login");
    const target = join(worktreeRoot(), "feat/login");

    await git.addWorktree({
      mode: "existing",
      repoPath: repo,
      branch: "feat/login",
      targetPath: target,
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feat/login");
  });
});

describe("addWorktree, mode track", () => {
  it("creates a local branch that tracks the remote one", async () => {
    const { repo, root } = await cloned();
    const target = join(root, "feat-login");

    await git.addWorktree({
      mode: "track",
      repoPath: repo,
      branch: "feat/login",
      remote: "origin",
      targetPath: target,
    });

    // The upstream, not the checkout: F7.5 exists because the wrong version of
    // this leaves a detached HEAD that only shows up at the first push.
    expect((await runGit(target, "rev-parse", "--abbrev-ref", "@{upstream}")).trim()).toBe(
      "origin/feat/login",
    );
  });

  it("tracks even with checkout.guess turned off", async () => {
    // The DWIM that would do this on its own is configuration-dependent. With
    // it off, an implicit version of this produces a detached HEAD.
    const { repo, root } = await cloned();
    await runGit(repo, "config", "checkout.guess", "false");
    const target = join(root, "feat-login");

    await git.addWorktree({
      mode: "track",
      repoPath: repo,
      branch: "feat/login",
      remote: "origin",
      targetPath: target,
    });

    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feat/login");
  });

  it("uses the local branch when it is already up to date", async () => {
    const { repo, root } = await cloned();
    await runGit(repo, "branch", "feat/login", "origin/feat/login");

    await git.addWorktree({
      mode: "track",
      repoPath: repo,
      branch: "feat/login",
      remote: "origin",
      targetPath: join(root, "feat-login"),
    });

    expect(
      (await runGit(repo, "for-each-ref", "--format=%(refname)", "refs/heads/feat/login")).trim(),
    ).toBe("refs/heads/feat/login");
  });

  it("refuses when the local branch is behind, saying by how much", async () => {
    // Q22. Using the local one would open the worktree on old code without the
    // user noticing; resetting it would write over work.
    const { repo, upstream, root } = await cloned();
    await runGit(repo, "branch", "feat/login", "origin/feat/login");
    await runGit(upstream, "checkout", "-q", "feat/login");
    await commitOn(upstream, "novo.txt", "mais um");
    await commitOn(upstream, "outro.txt", "e outro");
    await runGit(repo, "fetch", "-q", "origin");

    const failure = git.addWorktree({
      mode: "track",
      repoPath: repo,
      branch: "feat/login",
      remote: "origin",
      targetPath: join(root, "feat-login"),
    });

    await expect(failure).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(failure).rejects.toThrow(/2 commits atrás/);
  });

  it("says both numbers when the local branch has diverged", async () => {
    const { repo, upstream, root } = await cloned();
    await runGit(repo, "checkout", "-q", "-b", "feat/login", "origin/feat/login");
    await commitOn(repo, "meu.txt", "local");
    await runGit(repo, "checkout", "-q", "main");
    await runGit(upstream, "checkout", "-q", "feat/login");
    await commitOn(upstream, "deles.txt", "remoto");
    await runGit(repo, "fetch", "-q", "origin");

    const failure = git.addWorktree({
      mode: "track",
      repoPath: repo,
      branch: "feat/login",
      remote: "origin",
      targetPath: join(root, "feat-login"),
    });

    await expect(failure).rejects.toThrow(/1 commit atrás.*1 à frente/s);
  });

  it("deletes the branch it created when the checkout fails", async () => {
    // Measured on `mode: create` and true here too: `worktree add` makes the
    // branch before it finds out the target is unusable, and a stray branch
    // makes the next attempt fail on a name the user never chose.
    const { repo, root } = await cloned();
    const occupied = join(root, "ocupado");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "arquivo.txt"), "nao esta vazio");

    await expect(
      git.addWorktree({
        mode: "track",
        repoPath: repo,
        branch: "feat/login",
        remote: "origin",
        targetPath: occupied,
      }),
    ).rejects.toBeInstanceOf(DomainError);

    expect(await git.branchExists(repo, "feat/login")).toBe(false);
  });
});

describe("addWorktree, mode detach", () => {
  it("creates a checkout with no branch at all", async () => {
    // What the pull request path needs: the worktree exists, and `gh` is what
    // puts a branch on it.
    const repo = await createRepo({ branch: "main" });
    const target = join(worktreeRoot(), "planck");

    await git.addWorktree({ mode: "detach", repoPath: repo, targetPath: target, commitish: "main" });

    expect(existsSync(join(target, "README.md"))).toBe(true);
    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("");
  });

  it("creates no branch anywhere", async () => {
    const repo = await createRepo({ branch: "main" });

    await git.addWorktree({
      mode: "detach",
      repoPath: repo,
      targetPath: join(worktreeRoot(), "planck"),
      commitish: "main",
    });

    expect((await runGit(repo, "branch", "--list")).trim()).toBe("* main");
  });
});
