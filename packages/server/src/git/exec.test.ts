import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { cleanupGitFixtures, createPlainDir, createRepo } from "../testing/git-fixtures.js";
import { execGit } from "./exec.js";

afterEach(() => {
  cleanupGitFixtures();
});

describe("execGit", () => {
  it("runs in the directory it is given", async () => {
    const repo = await createRepo({ branch: "main" });

    const { stdout } = await execGit(["branch", "--show-current"], { cwd: repo });

    expect(stdout.trim()).toBe("main");
  });

  it("keeps stdout and stderr apart", async () => {
    const repo = await createRepo();

    const result = await execGit(["status", "--porcelain"], { cwd: repo });

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("fails with git's own message", async () => {
    // PRD §8 wants the user to read what git said, not a paraphrase of it.
    const failure = execGit(["status"], { cwd: createPlainDir() });

    await expect(failure).rejects.toThrow(DomainError);
    await expect(failure).rejects.toMatchObject({ code: "GIT_FAILED" });
    await expect(failure).rejects.toThrow(/not a git repository/i);
  });

  it("reports a command that hung instead of waiting forever", async () => {
    // A repository needing credentials would otherwise block the daemon. Ten
    // milliseconds is not a realistic budget for any real command, which is the
    // point: it forces the timeout path.
    const repo = await createRepo();

    await expect(
      execGit(["log", "--all"], { cwd: repo, timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "GIT_FAILED" });
  });

  it("does not swallow a non-zero exit with empty stderr", async () => {
    const repo = await createRepo();

    // `--quiet` on a dirty check: exits 1, says nothing.
    await expect(
      execGit(["rev-parse", "--verify", "--quiet", "refs/heads/ghost"], { cwd: repo }),
    ).rejects.toThrow(DomainError);
  });
});
