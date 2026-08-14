import { describe, expect, it } from "vitest";

import {
  changedCodeFiles,
  CODE_GLOBS,
  decide,
  describeDecision,
  vitestArgs,
} from "./gate-quick.js";

describe("decide", () => {
  it("runs nothing when no code changed", () => {
    expect(decide([])).toEqual({ run: "none" });
  });

  it("runs the affected tests when code changed", () => {
    expect(decide(["packages/server/src/config.ts"])).toEqual({ run: "changed" });
  });

  it("runs everything when git could not answer", () => {
    // "I don't know" must never be reported as "nothing to do".
    expect(decide(null)).toEqual({ run: "all" });
  });
});

describe("CODE_GLOBS", () => {
  it.each([
    ["pnpm-lock.yaml", "*.yaml"],
    ["pnpm-workspace.yaml", "*.yaml"],
    ["ports.json", "*.json"],
    ["packages/**", "packages"],
    ["scripts/**", "scripts"],
    ["e2e/**", "e2e"],
  ])("covers %s", (_file, glob) => {
    // A dependency bump touches only the lockfile, changes runtime behaviour,
    // and is the change most likely to break a test. It must select the suite.
    expect(CODE_GLOBS.some((g) => g.startsWith(glob))).toBe(true);
  });
});

describe("vitestArgs", () => {
  it("runs the whole suite when the base is unresolvable", () => {
    const args = vitestArgs({ run: "all" }, "deadbeef");

    expect(args).toEqual(["exec", "vitest", "run"]);
    expect(args).not.toContain("--changed");
  });

  it("forbids an empty selection when code changed", () => {
    // Without this flag the gate goes green having executed nothing.
    expect(vitestArgs({ run: "changed" }, "HEAD^")).toEqual([
      "exec",
      "vitest",
      "run",
      "--changed",
      "HEAD^",
      "--passWithNoTests=false",
    ]);
  });
});

describe("changedCodeFiles", () => {
  it("returns null for an unresolvable ref instead of throwing", () => {
    expect(changedCodeFiles("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).toBeNull();
  });

  it("returns a list for a resolvable ref", () => {
    expect(changedCodeFiles("HEAD")).toBeInstanceOf(Array);
  });
});

describe("describeDecision", () => {
  it("says why it is running everything", () => {
    expect(describeDecision({ run: "all" }, "bad-ref", 0)).toContain("cannot resolve");
  });

  it("does not claim there is nothing to do when the base is broken", () => {
    // The exact confusion this rewrite exists to remove.
    expect(describeDecision({ run: "all" }, "bad-ref", 0)).not.toContain("nothing to run");
  });
});
