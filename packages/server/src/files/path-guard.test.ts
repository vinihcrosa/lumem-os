import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { resolveInsideRoot } from "./path-guard.js";

/**
 * A real filesystem, with real symlinks.
 *
 * The policy `docs/project/testing.md` states for git holds here for the same
 * reason: a double for `realpath` would answer whatever this module assumes,
 * and the assumptions are the thing under test.
 */

afterEach(() => {
  cleanupGitFixtures();
});

function checkout(): string {
  const root = tempDir("lumem-checkout-");
  mkdirSync(join(root, "src", "lore"), { recursive: true });
  writeFileSync(join(root, "src", "lore", "loader.ts"), "export const a = 1;\n");
  return root;
}

describe("resolveInsideRoot", () => {
  it("resolves a path inside the checkout", async () => {
    const root = checkout();

    const resolved = await resolveInsideRoot(root, "src/lore/loader.ts");

    expect(resolved.relative).toBe("src/lore/loader.ts");
    expect(resolved.absolute.endsWith("src/lore/loader.ts")).toBe(true);
  });

  it("treats an empty path as the root itself", async () => {
    const root = checkout();

    expect(await resolveInsideRoot(root, "")).toMatchObject({ relative: "" });
    expect(await resolveInsideRoot(root, ".")).toMatchObject({ relative: "" });
  });

  it("refuses an absolute path", async () => {
    const root = checkout();

    await expect(resolveInsideRoot(root, "/etc/passwd")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("refuses `..` only after normalising", async () => {
    const root = checkout();

    // Each of these normalises to somewhere outside; none of them starts with
    // `..`, which is what a naive check would look for.
    await expect(resolveInsideRoot(root, "src/../../etc")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(resolveInsideRoot(root, "src/lore/../../..")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    // ...while a `..` that stays inside is legitimate.
    expect(await resolveInsideRoot(root, "src/lore/../lore")).toMatchObject({
      relative: "src/lore",
    });
  });

  it("does not accept a sibling directory that shares the root's prefix", async () => {
    // `/tmp/x-malicioso` has `/tmp/x` as a string prefix and is not inside it.
    // Reachable only through a symlink, which is exactly how it would happen.
    const root = tempDir("lumem-prefix-");
    const sibling = `${root}-malicioso`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, "secret.txt"), "x");
    symlinkSync(sibling, join(root, "vizinho"));

    await expect(resolveInsideRoot(root, "vizinho/secret.txt")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("names a symlink that leaves the checkout instead of pretending it is missing", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    writeFileSync(join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(outside, join(root, "chaves"));

    const failure = await resolveInsideRoot(root, "chaves/id_rsa").catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(failure.message).toMatch(/aponta para fora do checkout/);
  });

  it("follows a symlink that stays inside", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "lore"), join(root, "atalho"));

    const resolved = await resolveInsideRoot(root, "atalho/loader.ts");

    expect(resolved.absolute.endsWith("src/lore/loader.ts")).toBe(true);
  });

  it("reports a checkout that is not on disk as blocked, not as a missing file", async () => {
    await expect(resolveInsideRoot("/definitely-not-here-xyz", "src")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("reports a path that does not exist inside an existing checkout", async () => {
    const root = checkout();

    await expect(resolveInsideRoot(root, "src/nao-existe.ts")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
