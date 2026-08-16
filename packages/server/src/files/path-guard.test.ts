import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { resolveForWrite, resolveInsideRoot } from "./path-guard.js";

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

describe("resolveForWrite", () => {
  it("accepts a target that does not exist yet, as long as the parent does", async () => {
    const root = checkout();

    const resolved = await resolveForWrite(root, "src/lore/frontmatter.ts");

    expect(resolved.relative).toBe("src/lore/frontmatter.ts");
    expect(resolved.exists).toBe(false);
    expect(resolved.absolute.endsWith("src/lore/frontmatter.ts")).toBe(true);
  });

  it("says when the target is already there, and leaves the decision to the caller", async () => {
    const root = checkout();

    expect(await resolveForWrite(root, "src/lore/loader.ts")).toMatchObject({ exists: true });
  });

  it("names the directory that is missing instead of the file", async () => {
    const root = checkout();

    const failure = await resolveForWrite(root, "src/novo/sub/a.ts").catch((error) => error);

    expect(failure).toMatchObject({ code: "NOT_FOUND" });
    // Actionable: the user has to create `src/novo/sub`, and "a.ts não existe"
    // would be both true and useless — the file is not supposed to exist yet.
    expect(failure.message).toContain("src/novo/sub");
  });

  it("keeps rules 1 and 2 by reusing normalizeRelative", async () => {
    const root = checkout();

    await expect(resolveForWrite(root, "/etc/passwd")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(resolveForWrite(root, "src/../../etc/x")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(resolveForWrite(root, "src/lore/../lore/novo.ts")).resolves.toMatchObject({
      relative: "src/lore/novo.ts",
    });
  });

  it("refuses a parent symlink that leaves the checkout, even for a target that does not exist", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    symlinkSync(outside, join(root, "fora"));

    const failure = await resolveForWrite(root, "fora/novo.txt").catch((error) => error);

    // The target not existing cannot become a way around rule 4: without the
    // parent's realpath this would look like a plain new file.
    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(failure.message).toMatch(/fora do checkout/);
  });

  it("writes through a symlink that stays inside, to the destination it points at", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "lore", "loader.ts"), join(root, "atalho.ts"));

    const resolved = await resolveForWrite(root, "atalho.ts");

    // A guard that refuses everything passes every security test and breaks the
    // product: an internal link is a legitimate target, and the write lands on
    // the destination so the link stays a link.
    expect(resolved.exists).toBe(true);
    expect(resolved.absolute.endsWith("src/lore/loader.ts")).toBe(true);
    expect(resolved.relative).toBe("atalho.ts");
  });

  it("refuses a target symlink whose destination is outside the checkout", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    writeFileSync(join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(join(outside, "id_rsa"), join(root, "chave.txt"));

    const failure = await resolveForWrite(root, "chave.txt").catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(failure.message).toMatch(/aponta para fora do checkout/);
  });

  it("refuses .git itself, with a reason of its own", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"));

    const failure = await resolveForWrite(root, ".git").catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    // Not "fora do checkout": it is inside, and the refusal is about what it is.
    expect(failure.message).toMatch(/\.git/);
    expect(failure.message).not.toMatch(/fora do checkout/);
  });

  it("refuses anything inside .git", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });

    await expect(resolveForWrite(root, ".git/config")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(resolveForWrite(root, ".git/refs/heads/main")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("refuses .git reached through a symlink, which the relative path alone would miss", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });
    symlinkSync(join(root, ".git"), join(root, "atalho-git"));

    await expect(resolveForWrite(root, "atalho-git/config")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("refuses the checkout root for every write", async () => {
    const root = checkout();

    await expect(resolveForWrite(root, "")).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(resolveForWrite(root, ".")).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(resolveForWrite(root, "src/..")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("refuses the root reached through a symlink, which normalising alone would miss", async () => {
    const root = checkout();
    symlinkSync(root, join(root, "eu-mesmo"));

    // `eu-mesmo` is a path with no `..` in it that resolves to the checkout —
    // and `remove` on it would take the whole worktree.
    await expect(resolveForWrite(root, "eu-mesmo")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("refuses a parent that is a file, instead of failing later with ENOTDIR", async () => {
    const root = checkout();

    await expect(resolveForWrite(root, "src/lore/loader.ts/novo.txt")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("refuses a target that is a dangling symlink, because nothing proves where it lands", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "sumiu.ts"), join(root, "quebrado.ts"));

    const failure = await resolveForWrite(root, "quebrado.ts").catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(failure.message).toMatch(/destino/);
  });

  it("reports a checkout that is not on disk as blocked, not as a missing file", async () => {
    await expect(resolveForWrite("/definitely-not-here-xyz", "a.txt")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });
});
