import { realpathSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

/** What the branch tab reads, F7.3. Never the network. */
describe("listBranches", () => {
  it("lists the local branches", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "corrige-sidebar");

    const branches = await git.listBranches(repo);

    expect(branches.map((branch) => branch.name).sort()).toEqual(["corrige-sidebar", "main"]);
    expect(branches.every((branch) => branch.remote === null)).toBe(true);
  });

  it("lists a remote branch that has no local counterpart", async () => {
    const { repo } = await createRepoWithOrigin({ branches: ["feat/login"] });

    const branches = await git.listBranches(repo);

    expect(branches).toContainEqual(
      expect.objectContaining({ name: "feat/login", remote: "origin" }),
    );
  });

  it("shows a branch that exists on both sides once, as local", async () => {
    // Otherwise the list would offer the same work twice, and the two entries
    // would do different things when picked.
    const { repo } = await createRepoWithOrigin();

    const main = (await git.listBranches(repo)).filter((branch) => branch.name === "main");

    expect(main).toHaveLength(1);
    expect(main[0]?.remote).toBeNull();
  });

  it("leaves origin/HEAD out", async () => {
    // It is a pointer at another branch, not a branch. Offering it would cut a
    // worktree from a name that moves.
    const { repo } = await createRepoWithOrigin();

    expect((await git.listBranches(repo)).map((branch) => branch.name)).not.toContain("HEAD");
  });

  it("orders by the most recent commit first", async () => {
    // Dates set by hand: git records committer dates with second granularity,
    // and every commit a test makes otherwise lands in the same second — the
    // assertion would be over a tie, not over an order.
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "checkout", "-q", "-b", "antiga");
    await commitOn(repo, "velho.txt", "antiga", "2024-01-01T10:00:00");
    await runGit(repo, "checkout", "-q", "-b", "recente", "main");
    await commitOn(repo, "novo.txt", "recente", "2024-06-01T10:00:00");

    const branches = await git.listBranches(repo);

    // `main` is the fixture's own commit, made now — so it leads, and the two
    // dated branches keep the order their dates give them.
    expect(branches.map((branch) => branch.name)).toEqual(["main", "recente", "antiga"]);
  });

  it("breaks a tie by name, so the order does not flap between calls", async () => {
    // Two branches committed in the same second is the common case in a repo
    // that gets a rebase: without a second key the list would reorder itself
    // under the user for no reason.
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "zebra", "main");
    await runGit(repo, "branch", "alfa", "main");

    const names = (await git.listBranches(repo)).map((branch) => branch.name);

    expect(names).toEqual(["alfa", "main", "zebra"]);
  });

  it("says which worktree already holds a branch", async () => {
    // F7.4: the refusal has to name where the branch went, and git only knows
    // the path — the name lives in the database, so the router puts it there.
    const repo = await createRepo({ branch: "main" });
    const target = join(tempDir("lumem-worktrees-"), "huygens");
    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "feat/editor",
      targetPath: target,
      baseBranch: "main",
    });

    const held = (await git.listBranches(repo)).find((branch) => branch.name === "feat/editor");

    // git answers with the resolved path — /private/var, not the /var symlink
    // the fixture handed it. Whoever compares this against a row in the
    // database has to resolve both sides, which is what the router does.
    expect(held?.usedByPath).toBe(realpathSync(target));
  });

  it("leaves usedByPath null for a branch nobody has open", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "livre");

    const free = (await git.listBranches(repo)).find((branch) => branch.name === "livre");

    expect(free?.usedByPath).toBeNull();
  });

  it("survives a branch with a slash and an accent in the name", async () => {
    // The whole service reads refs with a NUL separator for this reason: git
    // C-quotes anything else, and every consumer would have to unquote it.
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "branch", "feat/açúcar");

    expect((await git.listBranches(repo)).map((branch) => branch.name)).toContain("feat/açúcar");
  });

  it("answers with an empty list for a repository with no commits", async () => {
    // A cloned-empty repository is legitimate (Q19 of project-from-url) and has
    // no branch yet — the dialog has to open on it, not fail.
    expect(await git.listBranches(await createRepo({ empty: true }))).toEqual([]);
  });

  it("reports the commit date in milliseconds", async () => {
    const repo = await createRepo({ branch: "main" });

    const [main] = await git.listBranches(repo);

    expect(main?.lastCommitAt).toBeGreaterThan(1_600_000_000_000);
  });
});
