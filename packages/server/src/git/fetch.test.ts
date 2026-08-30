import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import {
  cleanupGitFixtures,
  commitOn,
  createRepoWithOrigin,
  runGit,
} from "../testing/git-fixtures.js";
import type { GitExec } from "./exec.js";
import { createGitService } from "./GitService.js";

const git = createGitService();

afterEach(() => {
  cleanupGitFixtures();
});

async function headOf(repo: string, ref: string): Promise<string> {
  return (await runGit(repo, "rev-parse", ref)).trim();
}

describe("fetchRef", () => {
  it("brings the asked-for branch up to date", async () => {
    const { repo, upstream } = await createRepoWithOrigin({ branches: ["feat/login"] });
    const before = await headOf(repo, "origin/feat/login");
    await runGit(upstream, "checkout", "-q", "feat/login");
    await commitOn(upstream, "novo.txt", "mais um");

    await git.fetchRef(repo, { remote: "origin", ref: "feat/login" });

    expect(await headOf(repo, "origin/feat/login")).not.toBe(before);
  });

  it("leaves the other branches where they were", async () => {
    // Targeted on purpose: this runs while the user waits for a worktree, and
    // a whole fetch on a big repository is a different order of wait.
    const { repo, upstream } = await createRepoWithOrigin({ branches: ["feat/login"] });
    await commitOn(upstream, "na-main.txt", "main andou");
    const mainBefore = await headOf(repo, "origin/main");

    await git.fetchRef(repo, { remote: "origin", ref: "feat/login" });

    expect(await headOf(repo, "origin/main")).toBe(mainBefore);
  });

  it("refuses a remote or a ref that could be read as a flag", async () => {
    const { repo } = await createRepoWithOrigin();

    await expect(
      git.fetchRef(repo, { remote: "origin", ref: "--upload-pack=id" }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(git.fetchRef(repo, { remote: "-x", ref: "main" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("fails fast instead of hanging when the remote refuses the connection", async () => {
    // D9: no test here touches the network. Port 1 refuses immediately, which
    // is the only remote failure that is instant and deterministic.
    const { repo } = await createRepoWithOrigin();
    await runGit(repo, "remote", "add", "morto", "ssh://127.0.0.1:1/x");

    const failure = git.fetchRef(repo, { remote: "morto", ref: "main" });

    await expect(failure).rejects.toBeInstanceOf(DomainError);
    await expect(failure).rejects.toMatchObject({ code: "GIT_FAILED" });
  });
});

describe("fetchAll", () => {
  it("prunes a branch that is gone from the remote", async () => {
    // What the `atualizar` button is for: a list that still offers a branch
    // somebody deleted last week is a list that lies.
    const { repo, upstream } = await createRepoWithOrigin({ branches: ["feat/login"] });
    await runGit(upstream, "branch", "-D", "feat/login");

    await git.fetchAll(repo);

    expect((await runGit(repo, "branch", "-r")).trim()).not.toContain("origin/feat/login");
  });
});

describe("what the fetch runs with", () => {
  it("asks nobody for anything, over whatever ssh command was already set", async () => {
    // F7.15. A fetch that opens a password prompt hangs the daemon until the
    // timeout, and the user sees a screen doing nothing.
    let seen: NodeJS.ProcessEnv | undefined;
    const spy: GitExec = async (_args, options) => {
      seen = options.env;
      return { stdout: "", stderr: "" };
    };

    await createGitService({ exec: spy }).fetchRef("/qualquer", {
      remote: "origin",
      ref: "main",
    });

    expect(seen?.["GIT_ASKPASS"]).toBe("");
    expect(seen?.["SSH_ASKPASS"]).toBe("");
    expect(seen?.["GIT_SSH_COMMAND"]).toContain("BatchMode=yes");
  });

  it("gives a fetch longer than the default git timeout, and says the number was chosen", async () => {
    let seen: number | undefined;
    const spy: GitExec = async (_args, options) => {
      seen = options.timeoutMs;
      return { stdout: "", stderr: "" };
    };

    await createGitService({ exec: spy }).fetchAll("/qualquer");

    expect(seen).toBeGreaterThan(30_000);
  });

  it("puts the remote and the ref after a `--`", async () => {
    let seen: readonly string[] = [];
    const spy: GitExec = async (args) => {
      seen = args;
      return { stdout: "", stderr: "" };
    };

    await createGitService({ exec: spy }).fetchRef("/qualquer", {
      remote: "origin",
      ref: "feat/login",
    });

    expect(seen).toEqual(["fetch", "--", "origin", "feat/login"]);
  });
});
