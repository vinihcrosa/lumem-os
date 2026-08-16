import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  changedFiles,
  decide,
  describeDecision,
  FULL_SUITE_GLOBS,
  GRAPH_GLOBS,
  resolveBase,
  vitestArgs,
} from "./gate-quick.js";

/**
 * Real git repositories, not mocks. The whole point of these globs is how git
 * pathspecs actually match, and a mock would assert my belief about that rather
 * than the behaviour. The project rule is in docs/project/testing.md.
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

function writeUntracked(repo: string, relative: string): void {
  const target = join(repo, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "x");
}

function addFile(repo: string, relative: string): void {
  writeUntracked(repo, relative);
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

  it("runs the affected tests when only traceable sources changed", () => {
    expect(decide(["packages/server/src/config.ts"], [])).toEqual({
      run: "changed",
      reason: "graph-change",
    });
  });

  it("runs everything when something untraceable changed", () => {
    // --changed cannot reason about the lockfile: it is in no module graph, so
    // routing it through --changed selects zero tests and fails the run.
    expect(decide([], ["pnpm-lock.yaml"])).toEqual({ run: "all", reason: "untraceable-change" });
  });

  it("prefers the full suite when both categories changed", () => {
    expect(decide(["packages/server/src/config.ts"], ["package.json"]).run).toBe("all");
  });

  it("runs everything when git could not resolve the base", () => {
    expect(decide(null, []).run).toBe("all");
    expect(decide([], null).run).toBe("all");
    expect(decide(null, null).reason).toBe("unresolved-base");
  });
});

describe("GRAPH_GLOBS", () => {
  it("is exactly the traceable extensions", () => {
    // Pinned: a silent edit here is how the gate goes blind.
    expect(GRAPH_GLOBS).toEqual(["*.ts", "*.tsx"]);
  });

  it.each([
    "packages/server/src/config.ts",
    "packages/web/src/App.tsx",
    "e2e/smoke.spec.ts",
    "scripts/gate-quick.ts",
    "ports.ts",
    "packages/server/src/pty/PtyManager.ts",
  ])("matches %s in a real repo", (relative) => {
    const repo = makeRepo();
    addFile(repo, relative);

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toContain(relative);
  });

  it.each(["docs/README.md", "packages/web/index.html", "drizzle/0001_init.sql"])(
    "does not match %s",
    (relative) => {
      const repo = makeRepo();
      addFile(repo, relative);

      expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual([]);
    },
  );
});

describe("FULL_SUITE_GLOBS", () => {
  it.each([
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
    "ports.json",
    "tsconfig.base.json",
    "packages/server/package.json",
    // Untraceable but under packages/: classifying by prefix sent these to
    // --changed, which selected zero tests and failed the run.
    "packages/web/index.html",
    "packages/web/src/terminal.css",
    // Outside every source prefix: classifying by prefix made these invisible.
    "drizzle/0001_init.sql",
    ".gitignore",
  ])("matches %s in a real repo", (relative) => {
    const repo = makeRepo();
    addFile(repo, relative);

    expect(changedFiles(FULL_SUITE_GLOBS, "HEAD", repo)).toContain(relative);
  });

  it.each(["packages/server/src/config.ts", "packages/web/src/App.tsx", "ports.ts"])(
    "does not match the traceable source %s",
    (relative) => {
      const repo = makeRepo();
      addFile(repo, relative);

      expect(changedFiles(FULL_SUITE_GLOBS, "HEAD", repo)).toEqual([]);
    },
  );

  it.each([
    "docs/README.md",
    "docs/project/testing.md",
    "CLAUDE.md",
    // Not .md: these are what prove `:(exclude)docs/**` earns its place rather
    // than being shadowed by `:(exclude)*.md`.
    "docs/diagrams/architecture.svg",
    "docs/prd/walking-skeleton/schema.sql",
  ])("does not match the documentation %s", (relative) => {
    // Documentation-only commits must not drag the whole suite in.
    const repo = makeRepo();
    addFile(repo, relative);

    expect(changedFiles(FULL_SUITE_GLOBS, "HEAD", repo)).toEqual([]);
  });
});

describe("changedFiles", () => {
  it("sees a brand new file that git does not track yet", () => {
    // Writing a feature produces new files, and `git diff` alone ignores them:
    // the gate would report "nothing to run" while a whole module sat unstaged.
    const repo = makeRepo();
    writeUntracked(repo, "packages/server/src/pty/PtyManager.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual([
      "packages/server/src/pty/PtyManager.ts",
    ]);
  });

  it("sees an untracked untraceable file too", () => {
    const repo = makeRepo();
    writeUntracked(repo, "drizzle/0001_init.sql");

    expect(changedFiles(FULL_SUITE_GLOBS, "HEAD", repo)).toContain("drizzle/0001_init.sql");
  });

  it("reports a staged file exactly once", () => {
    const repo = makeRepo();
    addFile(repo, "packages/server/src/a.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual(["packages/server/src/a.ts"]);
  });

  it("returns a path with an accent unescaped", () => {
    // git's default core.quotePath turns this into "caf\303\251.ts". Nothing
    // consumes these as paths today, but a quoted name is the kind of bug
    // nobody thinks to look for once something does.
    const repo = makeRepo();
    writeUntracked(repo, "packages/web/src/café.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual(["packages/web/src/café.ts"]);
  });

  it("returns a path with a space intact", () => {
    const repo = makeRepo();
    writeUntracked(repo, "packages/web/src/my file.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual(["packages/web/src/my file.ts"]);
  });

  it("reports every changed file, not just the first", () => {
    const repo = makeRepo();
    addFile(repo, "packages/server/src/a.ts");
    writeUntracked(repo, "packages/web/src/b.tsx");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toHaveLength(2);
  });

  it("ignores files git is told to ignore", () => {
    const repo = makeRepo();
    writeUntracked(repo, ".gitignore");
    writeFileSync(join(repo, ".gitignore"), "generated.ts\n");
    writeUntracked(repo, "generated.ts");

    expect(changedFiles(GRAPH_GLOBS, "HEAD", repo)).toEqual([]);
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

describe("resolveBase", () => {
  const FULL_SHA = /^[0-9a-f]{40}$/;

  function headSha(repo: string): string {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  }

  it("turns a short SHA into the full one", () => {
    // The whole point: vitest never receives the abbreviated spelling.
    const repo = makeRepo();
    const full = headSha(repo);

    expect(resolveBase(full.slice(0, 7), repo)).toBe(full);
    expect(resolveBase(full.slice(0, 7), repo)).toMatch(FULL_SHA);
  });

  it("turns a base made only of digits into the full SHA", () => {
    // A digits-only ref reaches vitest's CLI as a number and `--changed` falls
    // back to "uncommitted", which right after a commit is nothing at all. A tag
    // is the deterministic way to spell such a base here — a short SHA that
    // happens to have no letter is what produced it in the wild, and there is no
    // way to ask git for one.
    const repo = makeRepo();
    execFileSync("git", ["tag", "8519566"], { cwd: repo, stdio: "ignore" });

    expect(resolveBase("8519566", repo)).toMatch(FULL_SHA);
  });

  it("selects the same files through the digits-only base as through the long one", () => {
    const repo = makeRepo();
    execFileSync("git", ["tag", "8519566"], { cwd: repo, stdio: "ignore" });
    const full = headSha(repo);
    addFile(repo, "packages/server/src/config.ts");

    const throughDigits = changedFiles(GRAPH_GLOBS, resolveBase("8519566", repo), repo);

    // Non-empty first: two empty lists would compare equal and prove nothing.
    expect(throughDigits).toEqual(["packages/server/src/config.ts"]);
    expect(throughDigits).toEqual(changedFiles(GRAPH_GLOBS, full, repo));
  });

  it("resolves HEAD^ too, so the default base goes through the same door", () => {
    const repo = makeRepo();
    addFile(repo, "packages/server/src/config.ts");
    execFileSync("git", ["add", "-A"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-q", "-m", "second"], { cwd: repo, stdio: "ignore" });

    expect(resolveBase("HEAD^", repo)).toMatch(FULL_SHA);
  });

  it("hands back a base git cannot resolve, instead of inventing a commit", () => {
    // `changedFiles` is what turns an unresolvable base into "run everything".
    // Substituting anything here would hide that decision.
    const repo = makeRepo();

    expect(resolveBase("deadbeefdeadbeefdeadbeef", repo)).toBe("deadbeefdeadbeefdeadbeef");
    expect(changedFiles(GRAPH_GLOBS, resolveBase("deadbeefdeadbeefdeadbeef", repo), repo)).toBeNull();
    // A single-commit repository has no HEAD^, and the gate has to survive it.
    expect(resolveBase("HEAD^", repo)).toBe("HEAD^");
  });
});

describe("vitestArgs", () => {
  it("runs the whole suite when the decision is all", () => {
    const args = vitestArgs({ run: "all", reason: "untraceable-change" }, "HEAD^");

    expect(args).toEqual(["exec", "vitest", "run"]);
    expect(args).not.toContain("--changed");
  });

  it("forbids an empty selection when only sources changed", () => {
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
    ["no-change", "none", "nothing to run"],
    ["unresolved-base", "all", "cannot resolve"],
    ["untraceable-change", "all", "dependency, config or asset changed"],
    ["graph-change", "changed", "3 source file(s)"],
  ] as const)("explains %s", (reason, run, expected) => {
    expect(describeDecision({ run, reason }, "HEAD^", 3)).toContain(expected);
  });

  it("never claims there is nothing to do when the base is broken", () => {
    // The exact confusion this rewrite exists to remove.
    expect(describeDecision({ run: "all", reason: "unresolved-base" }, "bad", 0)).not.toContain(
      "nothing to run",
    );
  });
});
