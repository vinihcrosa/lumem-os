import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import {
  cleanupGitFixtures,
  createPlainDir,
  createRepo,
  createSubdir,
  runGit,
  tempDir,
} from "../testing/git-fixtures.js";
import { createGitService } from "./GitService.js";

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

describe("isGitRepo", () => {
  it("accepts the root of a repository", async () => {
    const repo = await createRepo();

    const result = await git.isGitRepo(repo);

    expect(result.ok).toBe(true);
  });

  it("reports a path that does not exist", async () => {
    const result = await git.isGitRepo("/definitely-not-here-xyz");

    expect(result).toMatchObject({ ok: false, problem: "missing" });
    expect(result.ok === false && result.message).toMatch(/não existe/);
  });

  it("reports a path that is a file", async () => {
    const dir = tempDir();
    const file = join(dir, "README.md");
    writeFileSync(file, "not a directory");

    expect(await git.isGitRepo(file)).toMatchObject({ ok: false, problem: "not-a-directory" });
  });

  it("reports a directory that is not a repository", async () => {
    expect(await git.isGitRepo(createPlainDir())).toMatchObject({
      ok: false,
      problem: "not-a-repo",
    });
  });

  it("reports a subdirectory of a repository as not the root", async () => {
    // F2.2, and the one people actually hit: adding packages/web instead of
    // the repo. git itself would happily accept it.
    const repo = await createRepo();
    const inner = createSubdir(repo);

    const result = await git.isGitRepo(inner);

    expect(result).toMatchObject({ ok: false, problem: "not-root" });
    expect(result.ok === false && result.message).toMatch(/não é a raiz/);
  });

  it("accepts a root reached through a symlinked path", async () => {
    // /tmp is a symlink to /private/tmp on macOS. Comparing the spellings
    // instead of the real paths made every fixture look like a subdirectory of
    // itself, and every single test here failed.
    const repo = await createRepo();

    expect(await git.isGitRepo(repo)).toMatchObject({ ok: true });
  });

  it("accepts a repository with no commits yet", async () => {
    expect(await git.isGitRepo(await createRepo({ empty: true }))).toMatchObject({ ok: true });
  });

  it("returns the resolved root when it accepts", async () => {
    const repo = await createRepo();

    const result = await git.isGitRepo(repo);

    expect(result.ok && result.root.length).toBeGreaterThan(0);
  });
});

describe("resolveDefaultBranch", () => {
  it("uses the branch the remote calls default", async () => {
    const repo = await createRepo({ branch: "develop", remoteHead: "release" });

    expect(await git.resolveDefaultBranch(repo)).toBe("release");
  });

  it("falls back to the checked-out branch when there is no remote", async () => {
    const repo = await createRepo({ branch: "trunk" });

    expect(await git.resolveDefaultBranch(repo)).toBe("trunk");
  });

  it("answers in a repository whose first commit does not exist yet", async () => {
    // `rev-parse --abbrev-ref HEAD` fails outright here, which is why this uses
    // `branch --show-current`. Adding a freshly `git init`ed project is a real
    // thing people do.
    const repo = await createRepo({ branch: "main", empty: true });

    expect(await git.resolveDefaultBranch(repo)).toBe("main");
  });

  it("refuses a detached HEAD instead of inventing a branch", async () => {
    const repo = await createRepo();
    const head = (await runGit(repo, "rev-parse", "HEAD")).trim();
    await runGit(repo, "checkout", "--detach", head);

    await expect(git.resolveDefaultBranch(repo)).rejects.toThrow(DomainError);
    await expect(git.resolveDefaultBranch(repo)).rejects.toThrow(/HEAD está destacado/);
  });

  it("ignores a remote that has no recorded head", async () => {
    const repo = await createRepo({ branch: "principal" });
    await runGit(repo, "remote", "add", "origin", "https://example.invalid/x.git");

    expect(await git.resolveDefaultBranch(repo)).toBe("principal");
  });

  it("fails on a directory that is not a repository", async () => {
    await expect(git.resolveDefaultBranch(createPlainDir())).rejects.toMatchObject({
      code: "GIT_FAILED",
    });
  });

  it("passes git's own words through, untranslated", async () => {
    // PRD §8: the error the user reads is git's, not a paraphrase.
    const failure = await git.resolveDefaultBranch(createPlainDir()).catch((error) => error);

    expect((failure as Error).message).toMatch(/not a git repository/i);
  });
});

describe("readLog", () => {
  it("devolve o histórico no formato que quem chamou pediu, do mais novo ao mais velho", async () => {
    const repo = await createRepo({ branch: "main" });
    writeFileSync(join(repo, "a.ts"), "const a = 1;\n");
    await runGit(repo, "add", "a.ts");
    await runGit(repo, "commit", "-m", "feat: a");

    const log = await git.readLog(repo, { format: "%s", limit: 10 });

    expect(log.trim().split("\n")).toEqual(["feat: a", "initial"]);
  });

  it("para no limite pedido — uma varredura olha para trás, não até o começo", async () => {
    const repo = await createRepo({ branch: "main" });
    for (const name of ["a", "b"]) {
      writeFileSync(join(repo, `${name}.ts`), "x\n");
      await runGit(repo, "add", `${name}.ts`);
      await runGit(repo, "commit", "-m", `feat: ${name}`);
    }

    const log = await git.readLog(repo, { format: "%s", limit: 1 });

    expect(log.trim().split("\n")).toEqual(["feat: b"]);
  });

  it("fala com a voz do git num diretório que não é repositório", async () => {
    await expect(git.readLog(createPlainDir(), { format: "%s", limit: 1 })).rejects.toMatchObject({
      code: "GIT_FAILED",
    });
  });
});
