import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  changedFiles,
  decide,
  describeDecision,
  GLOBAL_GLOBS,
  GRAPH_GLOBS,
  vitestArgs,
} from "./gate-quick.js";

/**
 * Real git repositories, not mocks. The whole point of these globs is how git
 * pathspecs actually match, and a mock would assert my belief about that rather
 * than the behaviour.
 */
const repos: string[] = [];

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-gate-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("commit", "-q", "--allow-empty", "-m", "base");
  return dir;
}

function addFile(repo: string, relative: string): void {
  const target = join(repo, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "x");
  // -N stages the path without content, which is enough for `git diff` to see it.
  execFileSync("git", ["add", "-N", relative], { cwd: repo, stdio: "ignore" });
}

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

describe("decide", () => {
  it("runs nothing when neither category changed", () => {
    expect(decide([], [])).toEqual({ run: "none", reason: "no-change" });
  });

  it("runs the affected tests when only graph files changed", () => {
    expect(decide(["packages/server/src/config.ts"], [])).toEqual({
      run: "changed",
      reason: "graph-change",
    });
  });

  it("runs everything when a dependency or config changed", () => {
    // --changed cannot reason about the lockfile: it is in no module graph, so
    // routing it through --changed selects zero tests and fails the run.
    expect(decide([], ["pnpm-lock.yaml"])).toEqual({ run: "all", reason: "global-change" });
  });

  it("runs everything when a global change accompanies a graph change", () => {
    expect(decide(["packages/server/src/config.ts"], ["package.json"]).run).toBe("all");
  });

  it("runs everything when git could not resolve the base", () => {
    expect(decide(null, []).run).toBe("all");
    expect(decide([], null).run).toBe("all");
    expect(decide(null, null).reason).toBe("unresolved-base");
  });
});

describe("GRAPH_GLOBS", () => {
  it("is exactly the paths vitest can trace", () => {
    // Pinned: a silent edit here is how the gate goes blind.
    expect(GRAPH_GLOBS).toEqual(["packages/**", "e2e/**", "scripts/**", "*.ts"]);
  });

  it.each([
    "packages/server/src/config.ts",
    "packages/web/src/App.tsx",
    "e2e/smoke.spec.ts",
    "scripts/gate-quick.ts",
    "ports.ts",
  ])("matches %s in a real repo", (relative) => {
    const repo = makeRepo();
    addFile(repo, relative);

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toContain(relative);
  });

  it("does not match documentation", () => {
    const repo = makeRepo();
    addFile(repo, "docs/README.md");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual([]);
  });
});

describe("GLOBAL_GLOBS", () => {
  it("is exactly the dependency and config paths", () => {
    expect(GLOBAL_GLOBS).toEqual(["*.json", "*.yaml", "*.yml"]);
  });

  it.each([
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
    "ports.json",
    "tsconfig.base.json",
    "packages/server/package.json",
    "packages/server/tsconfig.json",
  ])("matches %s in a real repo", (relative) => {
    // Adding node-pty in phase 1 touches packages/server/package.json. That has
    // to run the full suite, not select zero tests and fail.
    const repo = makeRepo();
    addFile(repo, relative);

    expect(changedFiles(GLOBAL_GLOBS, "HEAD", repo)).toContain(relative);
  });

  it("does not match source files", () => {
    const repo = makeRepo();
    addFile(repo, "packages/server/src/config.ts");

    expect(changedFiles(GLOBAL_GLOBS, "HEAD", repo)).toEqual([]);
  });
});

describe("changedFiles", () => {
  it("reports a file the base commit does not have", () => {
    // Guards against the function degenerating to a constant: returning []
    // unconditionally would make the gate pass without running anything.
    const repo = makeRepo();
    addFile(repo, "packages/server/src/new-thing.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual(["packages/server/src/new-thing.ts"]);
  });

  it("reports every changed file, not just the first", () => {
    const repo = makeRepo();
    addFile(repo, "packages/server/src/a.ts");
    addFile(repo, "packages/web/src/b.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toHaveLength(2);
  });

  it("returns an empty list when nothing matched", () => {
    const repo = makeRepo();

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual([]);
  });

  it("returns null for an unresolvable ref instead of throwing", () => {
    const repo = makeRepo();

    expect(changedFiles(GRAPH_GLOBS, "deadbeefdeadbeefdeadbeef", repo)).toBeNull();
  });
});

describe("vitestArgs", () => {
  it("runs the whole suite when the decision is all", () => {
    const args = vitestArgs({ run: "all", reason: "global-change" }, "HEAD^");

    expect(args).toEqual(["exec", "vitest", "run"]);
    expect(args).not.toContain("--changed");
  });

  it("forbids an empty selection when only graph files changed", () => {
    // Without this flag the gate goes green having executed nothing.
    expect(vitestArgs({ run: "changed", reason: "graph-change" }, "HEAD^")).toEqual([
      "exec",
      "vitest",
      "run",
      "--changed",
      "HEAD^",
      "--passWithNoTests=false",
    ]);
  });
});

describe("describeDecision", () => {
  it.each([
    ["no-change", "nothing to run"],
    ["unresolved-base", "cannot resolve"],
    ["global-change", "dependency or config changed"],
    ["graph-change", "3 code file(s)"],
  ] as const)("explains %s", (reason, expected) => {
    const run = reason === "no-change" ? "none" : reason === "graph-change" ? "changed" : "all";
    expect(describeDecision({ run, reason }, "HEAD^", 3)).toContain(expected);
  });

  it("never claims there is nothing to do when the base is broken", () => {
    // The exact confusion this rewrite exists to remove.
    expect(describeDecision({ run: "all", reason: "unresolved-base" }, "bad", 0)).not.toContain(
      "nothing to run",
    );
  });
});
