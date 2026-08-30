import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";
import { countStatusEntries, createGitService, parseWorktreeList } from "./GitService.js";

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

/** A repository plus a directory to put worktrees in, as the daemon would. */
async function repoWithWorktreeRoot(): Promise<{ repo: string; root: string }> {
  const repo = await createRepo({ branch: "main" });
  const root = join(tempDir("lumem-worktrees-"), "lorebase");
  mkdirSync(root, { recursive: true });
  return { repo, root };
}

describe("branchExists", () => {
  it("finds a branch that is there", async () => {
    const repo = await createRepo({ branch: "main" });

    expect(await git.branchExists(repo, "main")).toBe(true);
  });

  it("answers false rather than failing for a branch that is not", async () => {
    const repo = await createRepo();

    expect(await git.branchExists(repo, "ghost")).toBe(false);
  });
});

describe("addWorktree", () => {
  it("creates the checkout and the branch from the base", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");

    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    expect(existsSync(join(target, "README.md"))).toBe(true);
    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("teste");
  });

  it("shows up in the original repository's worktree list", async () => {
    // PRD §9 checks this by hand; a real `git worktree add` is the only way it
    // can be true.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");

    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    expect(await runGit(repo, "worktree", "list")).toContain("teste");
  });

  it("refuses a branch that already exists, before touching anything", async () => {
    // F4.2: the user is told to pick another name. git's own message for this
    // talks about refs and leaves them guessing.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "main-again");

    const failure = git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "main",
      targetPath: target,
      baseBranch: "main",
    });

    await expect(failure).rejects.toThrow(DomainError);
    await expect(failure).rejects.toThrow(/já existe; escolha outro nome/);
    expect(existsSync(target)).toBe(false);
  });

  it("turns a name with a slash into a nested directory", async () => {
    // F4.5. This is the case that breaks naive path joining and naive branch
    // handling at the same time.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "feat/login");

    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "feat/login",
      targetPath: target,
      baseBranch: "main",
    });

    expect(existsSync(join(target, "README.md"))).toBe(true);
    expect((await runGit(target, "branch", "--show-current")).trim()).toBe("feat/login");
  });

  it("starts the branch at the base, not at whatever HEAD points to", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    await runGit(repo, "checkout", "-b", "outra");
    writeFileSync(join(repo, "only-here.txt"), "x");
    await runGit(repo, "add", "only-here.txt");
    await runGit(repo, "commit", "-m", "on outra");
    const target = join(root, "from-main");

    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "from-main",
      targetPath: target,
      baseBranch: "main",
    });

    expect(existsSync(join(target, "only-here.txt"))).toBe(false);
  });

  it("leaves no branch behind when git refuses", async () => {
    // PRD §8: a failed `worktree add` registers nothing — including in git.
    const { repo, root } = await repoWithWorktreeRoot();
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");

    await expect(
      git.addWorktree({
        mode: "create",
        repoPath: repo,
        branch: "teste",
        targetPath: occupied,
        baseBranch: "main",
      }),
    ).rejects.toThrow(DomainError);

    // git creates the branch before it discovers the directory is unusable, so
    // without the cleanup the next attempt fails on "branch already exists".
    expect(await git.branchExists(repo, "teste")).toBe(false);
  });

  it("lets the same name be retried after a failure", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const occupied = join(root, "occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "in-the-way.txt"), "x");
    await expect(
      git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: occupied, baseBranch: "main" }),
    ).rejects.toThrow();

    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "teste",
      targetPath: join(root, "teste"),
      baseBranch: "main",
    });

    expect(existsSync(join(root, "teste", "README.md"))).toBe(true);
  });

  it("fails with git's own words for a base branch that does not exist", async () => {
    const { repo, root } = await repoWithWorktreeRoot();

    await expect(
      git.addWorktree({
        mode: "create",
        repoPath: repo,
        branch: "teste",
        targetPath: join(root, "teste"),
        baseBranch: "no-such-base",
      }),
    ).rejects.toThrow(/no-such-base/);
  });
});

describe("listWorktrees", () => {
  it("lists the main repository and every worktree with its branch", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    await git.addWorktree({
      mode: "create",
      repoPath: repo,
      branch: "teste",
      targetPath: join(root, "teste"),
      baseBranch: "main",
    });

    const entries = await git.listWorktrees(repo);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.branch)).toEqual(
      expect.arrayContaining(["main", "teste"]),
    );
  });

  it("marks a worktree whose directory was deleted by hand as prunable", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    rmSync(target, { recursive: true, force: true });

    // Matched by suffix: git reports the real path, and /var is a symlink to
    // /private/var on macOS.
    const entry = (await git.listWorktrees(repo)).find((item) => item.path.endsWith("/teste"));
    expect(entry?.prunable).toBe(true);
  });
});

describe("parseWorktreeList", () => {
  it("reads a NUL-separated porcelain listing", () => {
    const stdout = "worktree /a\0HEAD abc\0branch refs/heads/main\0\0worktree /b\0HEAD def\0detached\0\0";

    expect(parseWorktreeList(stdout)).toEqual([
      { path: "/a", head: "abc", branch: "main", detached: false, prunable: false },
      { path: "/b", head: "def", branch: null, detached: true, prunable: false },
    ]);
  });

  it("keeps a path containing a space intact", () => {
    // The reason for `-z`: plain porcelain C-quotes this one.
    const stdout = "worktree /Users/eu/Meus Projetos/x\0HEAD abc\0branch refs/heads/main\0\0";

    expect(parseWorktreeList(stdout)[0]?.path).toBe("/Users/eu/Meus Projetos/x");
  });

  it("keeps the last record when the stream does not end with a separator", () => {
    expect(parseWorktreeList("worktree /a\0HEAD abc\0")).toHaveLength(1);
  });

  it("is empty for empty output", () => {
    expect(parseWorktreeList("")).toEqual([]);
  });
});

describe("removeWorktree", () => {
  it("removes the checkout and keeps the branch", async () => {
    // F4.7. The branch is where the work is; deleting it with the directory
    // would throw away commits nobody asked to lose.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    await git.removeWorktree({ repoPath: repo, path: target });

    expect(existsSync(target)).toBe(false);
    expect(await git.branchExists(repo, "teste")).toBe(true);
  });

  it("refuses a dirty worktree unless forced", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "README.md"), "changed");

    await expect(git.removeWorktree({ repoPath: repo, path: target })).rejects.toThrow(DomainError);
    expect(existsSync(target)).toBe(true);
  });

  it("removes a dirty worktree when forced", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "README.md"), "changed");

    await git.removeWorktree({ repoPath: repo, path: target, force: true });

    expect(existsSync(target)).toBe(false);
  });

  it("runs from the repository, so a directory deleted by hand can still be dropped", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    rmSync(target, { recursive: true, force: true });

    await git.removeWorktree({ repoPath: repo, path: target, force: true });

    expect((await git.listWorktrees(repo)).map((entry) => entry.path)).not.toContain(target);
  });
});

describe("getStatus", () => {
  it("reports a fresh worktree as clean", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    expect(await git.getStatus(target)).toEqual({ clean: true, changedFiles: 0 });
  });

  it("counts a modified file", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "README.md"), "changed");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 1 });
  });

  it("counts an untracked file as dirty", async () => {
    // F4.8. A new file is unpushed, uncommitted work — losing it to a forced
    // removal is the worst outcome this whole check exists to prevent.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "novo.txt"), "x");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 1 });
  });

  it("counts an untracked file inside a new directory", async () => {
    // Without --untracked-files=all git reports the directory once, no matter
    // how many files are in it.
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    mkdirSync(join(target, "novo"));
    writeFileSync(join(target, "novo", "a.txt"), "x");
    writeFileSync(join(target, "novo", "b.txt"), "x");

    expect(await git.getStatus(target)).toEqual({ clean: false, changedFiles: 2 });
  });

  it("adds up several kinds of change", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "README.md"), "changed");
    writeFileSync(join(target, "novo.txt"), "x");

    expect(await git.getStatus(target)).toMatchObject({ clean: false, changedFiles: 2 });
  });
});

describe("countStatusEntries", () => {
  it("counts a rename once, not twice", () => {
    // `R  new\0old\0` is two NUL fields for one change, and the count is what
    // the user reads before deciding to force a removal.
    expect(countStatusEntries("R  novo.txt\0antigo.txt\0")).toBe(1);
  });

  it("counts ordinary entries", () => {
    expect(countStatusEntries(" M README.md\0?? novo.txt\0")).toBe(2);
  });

  it("is zero for a clean tree", () => {
    expect(countStatusEntries("")).toBe(0);
  });
});

describe("getAheadBehind", () => {
  it("is zero and zero right after creation", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 0, behind: 0 });
  });

  it("counts commits made in the worktree as ahead", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "a.txt"), "x");
    await runGit(target, "add", "a.txt");
    await runGit(target, "commit", "-m", "work");

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 1, behind: 0 });
  });

  it("counts commits made on the base as behind", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(repo, "b.txt"), "x");
    await runGit(repo, "add", "b.txt");
    await runGit(repo, "commit", "-m", "moved on");

    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 0, behind: 1 });
  });

  it("counts both sides when they diverged", async () => {
    const { repo, root } = await repoWithWorktreeRoot();
    const target = join(root, "teste");
    await git.addWorktree({ mode: "create", repoPath: repo, branch: "teste", targetPath: target, baseBranch: "main" });
    writeFileSync(join(target, "a.txt"), "x");
    await runGit(target, "add", "a.txt");
    await runGit(target, "commit", "-m", "work");
    writeFileSync(join(repo, "b.txt"), "x");
    await runGit(repo, "add", "b.txt");
    await runGit(repo, "commit", "-m", "moved on");

    // Getting these backwards is invisible until someone reads the panel and
    // rebases the wrong way.
    expect(await git.getAheadBehind(target, "main")).toEqual({ ahead: 1, behind: 1 });
  });
});
