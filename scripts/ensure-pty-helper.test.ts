import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ensureExecutable, findNodePtyRoot, findSpawnHelpers, run } from "./ensure-pty-helper.js";

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-pty-helper-"));
  dirs.push(dir);
  return dir;
}

function writeFile(path: string, mode: number): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "binary");
  chmodSync(path, mode);
  return path;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("findNodePtyRoot", () => {
  it("finds the package in a pnpm virtual store", () => {
    const nodeModules = makeDir();
    const expected = join(nodeModules, ".pnpm", "node-pty@1.1.0", "node_modules", "node-pty");
    mkdirSync(expected, { recursive: true });

    expect(findNodePtyRoot(nodeModules)).toBe(expected);
  });

  it("finds the package in a flat layout", () => {
    const nodeModules = makeDir();
    const expected = join(nodeModules, "node-pty");
    mkdirSync(expected, { recursive: true });

    expect(findNodePtyRoot(nodeModules)).toBe(expected);
  });

  it("ignores unrelated packages in the store", () => {
    const nodeModules = makeDir();
    mkdirSync(join(nodeModules, ".pnpm", "node-fetch@3.0.0", "node_modules", "node-fetch"), {
      recursive: true,
    });

    expect(findNodePtyRoot(nodeModules)).toBeNull();
  });

  it("returns null when node-pty is not installed", () => {
    expect(findNodePtyRoot(makeDir())).toBeNull();
  });
});

describe("findSpawnHelpers", () => {
  it("finds one helper per prebuilt platform", () => {
    const root = makeDir();
    writeFile(join(root, "prebuilds", "darwin-arm64", "spawn-helper"), 0o644);
    writeFile(join(root, "prebuilds", "linux-x64", "spawn-helper"), 0o644);

    expect(findSpawnHelpers(root)).toHaveLength(2);
  });

  it("skips a platform that ships no helper", () => {
    // darwin-x64 in node-pty 1.1.0 really does ship pty.node without one.
    const root = makeDir();
    writeFile(join(root, "prebuilds", "darwin-arm64", "spawn-helper"), 0o644);
    writeFile(join(root, "prebuilds", "darwin-x64", "pty.node"), 0o644);

    expect(findSpawnHelpers(root)).toEqual([
      join(root, "prebuilds", "darwin-arm64", "spawn-helper"),
    ]);
  });

  it("returns nothing when there are no prebuilds", () => {
    expect(findSpawnHelpers(makeDir())).toEqual([]);
  });
});

describe("ensureExecutable", () => {
  it("adds the executable bit", () => {
    // This exact mode is what pnpm's extraction leaves behind, and it makes
    // every pty.spawn fail with a bare "posix_spawnp failed".
    const path = writeFile(join(makeDir(), "spawn-helper"), 0o644);

    expect(ensureExecutable([path])).toEqual([path]);
    expect(statSync(path).mode & 0o111).toBe(0o111);
  });

  it("preserves the read and write bits", () => {
    const path = writeFile(join(makeDir(), "spawn-helper"), 0o644);

    ensureExecutable([path]);

    expect(statSync(path).mode & 0o666).toBe(0o644);
  });

  it("reports nothing changed when the bit is already set", () => {
    const path = writeFile(join(makeDir(), "spawn-helper"), 0o755);

    expect(ensureExecutable([path])).toEqual([]);
  });

  it("is idempotent", () => {
    const path = writeFile(join(makeDir(), "spawn-helper"), 0o644);

    ensureExecutable([path]);

    expect(ensureExecutable([path])).toEqual([]);
  });
});

describe("run", () => {
  it("fixes the helpers of an installed node-pty", () => {
    const nodeModules = makeDir();
    const root = join(nodeModules, ".pnpm", "node-pty@1.1.0", "node_modules", "node-pty");
    const helper = writeFile(join(root, "prebuilds", "darwin-arm64", "spawn-helper"), 0o644);

    expect(run(nodeModules)).toEqual([helper]);
    expect(statSync(helper).mode & 0o111).toBe(0o111);
  });

  it("does nothing when node-pty is absent, instead of failing the install", () => {
    expect(run(makeDir())).toEqual([]);
  });
});
