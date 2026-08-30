import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { parseGitVersion, preflight } from "./preflight.js";
import type { CommandRunner } from "./run-command.js";

/**
 * The preflight, without touching this machine.
 *
 * Every dependency is a seam on purpose: a test that read the real `git` would
 * pass or fail depending on which laptop it ran on, and the *interesting* cases
 * — git 2.29, no git at all, `statfs` exploding — cannot be produced on a
 * machine that works.
 */

const dirs: string[] = [];

function tempStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-preflight-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runner(output: string, ok = true): CommandRunner {
  return () => Promise.resolve({ ok, output, failure: ok ? null : "exit 1" });
}

function config(stateDir: string) {
  return loadConfig({ LUMEM_STATE_DIR: stateDir });
}

async function checksFor(overrides: {
  stateDir?: string;
  run?: CommandRunner;
  freeBytes?: (path: string) => number;
}) {
  const stateDir = overrides.stateDir ?? tempStateDir();
  const { checks } = await preflight({
    config: config(stateDir),
    run: overrides.run ?? runner("git version 2.45.1"),
    freeBytes: overrides.freeBytes ?? (() => 184_000_000_000),
    nodeVersion: "v22.11.0",
    nodePath: "/opt/homebrew/bin/node",
  });
  return checks;
}

function byId(checks: readonly { id: string }[], id: string) {
  const check = checks.find((entry) => entry.id === id);
  if (check === undefined) throw new Error(`no check ${id}`);
  return check as { id: string; state: string; value: string; fix: string | null };
}

describe("parseGitVersion", () => {
  it("reads what git actually prints", () => {
    expect(parseGitVersion("git version 2.45.1")).toEqual({ major: 2, minor: 45 });
    // Apple ships this shape, and it is the machine most likely to run this.
    expect(parseGitVersion("git version 2.39.3 (Apple Git-146)")).toEqual({ major: 2, minor: 39 });
  });

  it("returns null for something that is not a version", () => {
    expect(parseGitVersion("command not found")).toBeNull();
  });
});

describe("preflight", () => {
  it("reports all five checks", async () => {
    const checks = await checksFor({});
    expect(checks.map((check) => check.id)).toEqual([
      "daemon",
      "git",
      "node",
      "stateDir",
      "disk",
    ]);
  });

  it("reports where the daemon keeps things", async () => {
    // The flow says what each step wrote to disk, and `LUMEM_STATE_DIR` moves all
    // of it — a client composing `~/.lumem` would be wrong on the one machine
    // where someone moved it.
    const stateDir = tempStateDir();
    const { paths } = await preflight({
      config: config(stateDir),
      run: runner("git version 2.45.1"),
      freeBytes: () => 1_000_000_000_000,
    });

    expect(paths.stateDir).toBe(stateDir);
    expect(paths.databasePath).toBe(join(stateDir, "lumem.db"));
    expect(paths.workspacesDir).toBe(join(stateDir, "workspaces"));
    expect(paths.transcriptsDir).toBe(join(stateDir, "transcripts"));
  });

  it("passes a modern git, and says worktree works", async () => {
    const git = byId(await checksFor({}), "git");
    expect(git.state).toBe("ok");
    expect(git.value).toContain("2.45");
    expect(git.value).toContain("worktree");
  });

  it("fails a git below 2.30, and says why rather than 'inválido'", async () => {
    // The reason is the whole value of this line: `--orphan` changed behaviour
    // there, and the product is worktrees.
    const git = byId(await checksFor({ run: runner("git version 2.29.2") }), "git");

    expect(git.state).toBe("fail");
    expect(git.value).toContain("2.30");
    expect(git.value).toContain("worktree");
    expect(git.value).not.toBe("inválido");
  });

  it("fails, rather than throwing, when git is not there at all", async () => {
    const checks = await checksFor({
      run: () => Promise.resolve({ ok: false, output: "", failure: "spawn git ENOENT" }),
    });

    const git = byId(checks, "git");
    expect(git.state).toBe("fail");
    expect(git.value).toContain("ENOENT");
    // And the machine is still described: four other answers survive.
    expect(checks).toHaveLength(5);
  });

  it("warns when git answers something that is not a version", async () => {
    const git = byId(await checksFor({ run: runner("nope") }), "git");
    expect(git.state).toBe("warn");
  });

  it("reports the node the daemon is running on, with its path", async () => {
    // Not "does node work" — the daemon is proof of that. This is for the
    // machine with three installs, where the adapter lands on another one.
    const node = byId(await checksFor({}), "node");
    expect(node.state).toBe("ok");
    expect(node.value).toBe("22.11.0 · /opt/homebrew/bin/node");
  });

  it("warns about a state directory that does not exist yet", async () => {
    const state = byId(await checksFor({ stateDir: join(tempStateDir(), "nope") }), "stateDir");

    expect(state.state).toBe("warn");
    expect(state.value).toContain("ainda não existe");
  });

  it("passes an existing state directory and names the registry inside it", async () => {
    const state = byId(await checksFor({}), "stateDir");
    expect(state.state).toBe("ok");
    expect(state.value).toContain("lumem.db");
  });

  it("warns on a nearly full disk", async () => {
    const disk = byId(await checksFor({ freeBytes: () => 200_000_000 }), "disk");
    expect(disk.state).toBe("warn");
    expect(disk.value).toContain("MB");
  });

  it("keeps the other four when one platform call explodes", async () => {
    // `statfs` does not exist everywhere, and the machine where it is missing is
    // exactly the one whose other answers someone needs to read (F2.5).
    const checks = await checksFor({
      freeBytes: () => {
        throw new Error("statfs não existe aqui");
      },
    });

    expect(byId(checks, "disk").state).toBe("fail");
    expect(byId(checks, "disk").value).toContain("statfs");
    expect(byId(checks, "git").state).toBe("ok");
    expect(byId(checks, "daemon").state).toBe("ok");
  });

  it("suggests no command it cannot promise", async () => {
    // `brew upgrade git` is wrong on some machine, and a fix that fails is worse
    // than none. The value says what is wrong instead.
    const checks = await checksFor({ run: runner("git version 2.29.2") });
    expect(checks.every((check) => check.fix === null)).toBe(true);
  });
});
