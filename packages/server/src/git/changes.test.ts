import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, createRepo, runGit } from "../testing/git-fixtures.js";
import { createGitService } from "./GitService.js";

/**
 * Real repositories, per `docs/project/testing.md`.
 *
 * The cases here are exactly the ones a double would get wrong: a rename that
 * `--numstat -z` spells across three records, a binary file whose counts are
 * `-`, and a repository whose first commit does not exist yet.
 */

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

async function commit(repo: string, message: string): Promise<void> {
  await runGit(repo, "add", "-A");
  await runGit(repo, "commit", "-m", message);
}

function write(repo: string, file: string, content: string): void {
  const full = join(repo, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("listChanges — não commitado", () => {
  it("reports a modified file with its counts", async () => {
    const repo = await createRepo();
    write(repo, "src/loader.ts", "um\ndois\ntres\n");
    await commit(repo, "loader");
    write(repo, "src/loader.ts", "um\ndois alterado\ntres\nquatro\n");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.comparedTo).toBe("HEAD");
    expect(changes.files).toEqual([
      {
        path: "src/loader.ts",
        oldPath: null,
        status: "modified",
        additions: 2,
        deletions: 1,
        binary: false,
      },
    ]);
  });

  it("reports a file added to the index", async () => {
    const repo = await createRepo();
    write(repo, "novo.ts", "a\nb\n");
    await runGit(repo, "add", "novo.ts");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files).toMatchObject([{ path: "novo.ts", status: "added", additions: 2 }]);
  });

  it("reports a deleted file", async () => {
    const repo = await createRepo();
    write(repo, "some.ts", "a\nb\n");
    await commit(repo, "some");
    rmSync(join(repo, "some.ts"));

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files).toMatchObject([
      { path: "some.ts", status: "deleted", additions: 0, deletions: 2 },
    ]);
  });

  it("reports an untracked file, counting the lines it adds", async () => {
    const repo = await createRepo();
    write(repo, "notas.md", "uma\nduas\ntres\n");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files).toMatchObject([
      { path: "notas.md", status: "untracked", additions: 3, deletions: 0 },
    ]);
  });

  it("keeps the old path of a rename", async () => {
    const repo = await createRepo();
    write(repo, "docs/uso.md", "conteudo bastante longo para o git achar parecido\n".repeat(4));
    await commit(repo, "uso");
    await runGit(repo, "mv", "docs/uso.md", "docs/guia-de-uso.md");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files).toMatchObject([
      { path: "docs/guia-de-uso.md", oldPath: "docs/uso.md", status: "renamed" },
    ]);
  });

  it("marks a binary file instead of pretending it changed by zero lines", async () => {
    const repo = await createRepo();
    writeFileSync(join(repo, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    await commit(repo, "logo");
    writeFileSync(join(repo, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x02, 0x03]));

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files).toMatchObject([{ path: "logo.png", binary: true }]);
  });

  it("survives a path with a space and an accent", async () => {
    const repo = await createRepo();
    write(repo, "docs/notas de reunião.md", "a\n");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.files.map((file) => file.path)).toEqual(["docs/notas de reunião.md"]);
  });

  it("calls everything new when the repository has no commit yet", async () => {
    // A brand-new worktree is the common case, and `git diff HEAD` fails there.
    const repo = await createRepo({ empty: true });
    write(repo, "primeiro.ts", "a\n");

    const changes = await git.listChanges(repo, { ref: "worktree" });

    expect(changes.comparedTo).toBeNull();
    expect(changes.files).toMatchObject([{ path: "primeiro.ts", status: "untracked" }]);
  });

  it("reports nothing on a clean checkout", async () => {
    const repo = await createRepo();

    expect(await git.listChanges(repo, { ref: "worktree" })).toMatchObject({ files: [] });
  });
});

describe("listChanges — vs base", () => {
  it("includes what was committed on the branch, not only the working tree", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "checkout", "-b", "feature");
    write(repo, "commitado.ts", "a\nb\n");
    await commit(repo, "trabalho commitado");
    write(repo, "pendente.ts", "c\n");

    const worktree = await git.listChanges(repo, { ref: "worktree" });
    const base = await git.listChanges(repo, { ref: "base", baseBranch: "main" });

    expect(worktree.files.map((file) => file.path)).toEqual(["pendente.ts"]);
    expect(base.files.map((file) => file.path)).toEqual(["commitado.ts", "pendente.ts"]);
  });

  it("compares against the merge-base, so commits landed on the base do not show up", async () => {
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "checkout", "-b", "feature");
    write(repo, "meu.ts", "a\n");
    await commit(repo, "meu trabalho");
    await runGit(repo, "checkout", "main");
    write(repo, "de-outro.ts", "b\n");
    await commit(repo, "trabalho de outra pessoa");
    await runGit(repo, "checkout", "feature");

    const base = await git.listChanges(repo, { ref: "base", baseBranch: "main" });

    expect(base.files.map((file) => file.path)).toEqual(["meu.ts"]);
  });

  it("names a base branch that no longer exists instead of failing generically", async () => {
    const repo = await createRepo({ branch: "main" });

    const failure = await git
      .listChanges(repo, { ref: "base", baseBranch: "sumiu" })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "NOT_FOUND" });
    expect(failure.message).toMatch(/não existe mais neste repositório/);
  });
});

describe("filePatch", () => {
  it("returns the unified diff of one file", async () => {
    const repo = await createRepo();
    write(repo, "src/loader.ts", "um\ndois\n");
    await commit(repo, "loader");
    write(repo, "src/loader.ts", "um\ndois alterado\n");

    const patch = await git.filePatch(repo, "src/loader.ts", { ref: "worktree" });

    expect(patch.binary).toBe(false);
    expect(patch.patch).toContain("-dois");
    expect(patch.patch).toContain("+dois alterado");
  });

  it("diffs an untracked file, which has no blob to compare against", async () => {
    const repo = await createRepo();
    write(repo, "notas.md", "uma\nduas\n");

    const patch = await git.filePatch(repo, "notas.md", { ref: "worktree" });

    expect(patch.patch).toContain("+uma");
    expect(patch.patch).toContain("+duas");
  });

  it("says a file is binary rather than returning git's placeholder line", async () => {
    const repo = await createRepo();
    writeFileSync(join(repo, "logo.png"), Buffer.from([0x00, 0x01]));
    await commit(repo, "logo");
    writeFileSync(join(repo, "logo.png"), Buffer.from([0x00, 0x02, 0x03]));

    const patch = await git.filePatch(repo, "logo.png", { ref: "worktree" });

    expect(patch).toMatchObject({ binary: true, patch: "" });
  });

  it("shows the whole file as new when there is no commit to compare to", async () => {
    const repo = await createRepo({ empty: true });
    write(repo, "primeiro.ts", "a\n");

    const patch = await git.filePatch(repo, "primeiro.ts", { ref: "worktree" });

    expect(patch.patch).toContain("+a");
  });
});
