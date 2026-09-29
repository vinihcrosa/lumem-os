/**
 * The command line: exit codes, output shape, and the controls `selftest.py`
 * ran against its own entry points — an unresolvable feature is a usage error,
 * never a pass.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runFeatureFlow } from "./cli.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const ROOT = join(import.meta.dirname, "..", "..");

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the fixture feature, edited, in a directory of its own. */
function feature(edit?: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "feature-flow-"));
  dirs.push(dir);
  cpSync(FIXTURES, dir, { recursive: true });
  edit?.(dir);
  return dir;
}

function rewrite(dir: string, name: string, from: string, to: string): void {
  const path = join(dir, name);
  const text = readFileSync(path, "utf8");
  expect(text).toContain(from);
  writeFileSync(path, text.replaceAll(from, to));
}

describe("runFeatureFlow", () => {
  it.each(["plan", "checks", "verification"])("%s passes on the fixture feature, exit 0", (kind) => {
    const result = runFeatureFlow([kind, relative(ROOT, FIXTURES)], ROOT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0 erro(s), 0 aviso(s)");
  });

  it("an error exits 1 and prints `path:line  ERROR message`", () => {
    const dir = feature((d) => rewrite(d, "prd.md", "| error shape and codes | AC 6 |", "| error shape and codes |  |"));
    const result = runFeatureFlow(["plan", dir], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/^prd\.md:105 {2}ERROR Observable '.*error shape and codes': o landing está em branco/m);
  });

  it("a warning alone exits 0, and 1 under --strict", () => {
    const dir = feature((d) => rewrite(d, "checks.md", "denies access to paid access groups", "handles access gracefully"));
    expect(runFeatureFlow(["checks", dir], dir).exitCode).toBe(0);
    const strict = runFeatureFlow(["checks", dir, "--strict"], dir);
    expect(strict.exitCode).toBe(1);
    expect(strict.stdout).toMatch(/^checks\.md:23 {2}WARN C4: /m);
  });

  it("checks reads the sibling prd.md for the Surface derivation", () => {
    const dir = feature((d) => rewrite(d, "prd.md", "`POST /webhooks/provider`", "`POST /webhooks/provider/v2`"));
    expect(runFeatureFlow(["checks", dir], dir).stdout).toContain("/webhooks/provider/v2");
  });

  it("a feature with no verification.md is not done: exit 1, not a usage error", () => {
    const dir = feature((d) => rmSync(join(d, "verification.md")));
    const result = runFeatureFlow(["verification", dir], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("sem verification.md");
  });

  it.each([
    ["an unresolvable feature directory", ["verification", "docs/features/999-missing"]],
    ["an unknown kind", ["tasks", "."]],
    ["no feature directory", ["plan"]],
    ["an unknown flag", ["plan", ".", "--allow-empty"]],
  ])("%s is a usage error, exit 2", (_, argv) => {
    const result = runFeatureFlow(argv, ROOT);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("uso:");
  });

  it("the artifact a kind needs is a usage error when absent, exit 2", () => {
    const dir = feature((d) => rmSync(join(d, "prd.md")));
    expect(runFeatureFlow(["plan", dir], dir).exitCode).toBe(2);
    const noChecks = feature((d) => rmSync(join(d, "checks.md")));
    expect(runFeatureFlow(["checks", noChecks], noChecks).exitCode).toBe(2);
  });
});

describe("run.ts", () => {
  it("runs under tsx and exits with the validator's code", () => {
    const dir = feature((d) => rewrite(d, "verification.md", "**Verdict**: PASS", "**Verdict**: FAIL"));
    const tsx = join(ROOT, "node_modules", ".bin", "tsx");
    const run = spawnSync(tsx, [join(import.meta.dirname, "run.ts"), "verification", dir], { encoding: "utf8", cwd: dir });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("verification.md:3  ERROR o veredito é FAIL");
  });
});
