import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("reads inside .git and says so, by the same rule that refuses writing there", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "[core]\n");
    writeFileSync(join(root, ".gitignore"), "node_modules\n");
    symlinkSync(join(root, ".git"), join(root, "atalho-git"));

    // Reading is allowed — the verdict travels with the path instead of the
    // client re-deriving a rule that has to know about links and about `.GIT`.
    expect(await resolveInsideRoot(root, ".git/config")).toMatchObject({ insideGit: true });
    expect(await resolveInsideRoot(root, "atalho-git/config")).toMatchObject({ insideGit: true });
    expect(await resolveInsideRoot(root, ".gitignore")).toMatchObject({ insideGit: false });
    expect(await resolveInsideRoot(root, "src/lore/loader.ts")).toMatchObject({
      insideGit: false,
    });
  });
});

describe("resolveForWrite", () => {
  it("accepts a target that does not exist yet, as long as the parent does", async () => {
    const root = checkout();

    const resolved = await resolveForWrite(root, "src/lore/frontmatter.ts");

    expect(resolved.relative).toBe("src/lore/frontmatter.ts");
    expect(resolved.exists).toBe(false);
    expect(resolved.entry.endsWith("src/lore/frontmatter.ts")).toBe(true);
    // Nothing is there to be a link, so the entry is also where a write lands.
    expect(resolved.target).toBe(resolved.entry);
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
    expect(resolved.target?.endsWith("src/lore/loader.ts")).toBe(true);
    expect(resolved.relative).toBe("atalho.ts");
  });

  it("keeps the link itself apart from its destination, because deleting is not writing", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "lore", "loader.ts"), join(root, "atalho.ts"));

    const resolved = await resolveForWrite(root, "atalho.ts");

    // E5 removes and renames the *entry*: `unlink` on the destination would
    // delete the real file and leave the link dangling — the exact opposite of
    // "apagar symlink apaga o link". Both are strings, so only this separates
    // them.
    expect(resolved.entry.endsWith("atalho.ts")).toBe(true);
    expect(resolved.entry).not.toBe(resolved.target);
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

  it("refuses a link whose destination is inside .git, which the entry's name alone would miss", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    writeFileSync(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\n");
    symlinkSync(join(root, ".git", "hooks", "pre-commit"), join(root, "hook.sh"));

    // `hook.sh` is an ordinary name in an ordinary directory. Only the pass
    // over where a write would land sees `.git` here — and a write through it
    // rewrites a hook that runs on every commit.
    await expect(resolveForWrite(root, "hook.sh")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("refuses a .git that is itself a link somewhere harmless, which the resolved path alone would miss", async () => {
    const root = checkout();
    mkdirSync(join(root, "inocente"), { recursive: true });
    symlinkSync(join(root, "inocente"), join(root, ".git"));

    // Nothing resolves to a `.git` here — `inocente/config` is where a write
    // would land. What the user reads in the tree is still the repository, and
    // the pass over the requested path is the only thing left refusing it.
    await expect(resolveForWrite(root, ".git/config")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(resolveForWrite(root, ".git")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("lets the .git-ish files everybody edits through", async () => {
    const root = checkout();
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "node_modules\n");
    writeFileSync(join(root, ".gitmodules"), "[submodule]\n");
    writeFileSync(join(root, ".github", "workflows", "ci.yml"), "on: push\n");

    // `.git` is a whole path component, never a substring. A guard that reads
    // it as one refuses all three of these, passes every security test, and
    // makes the editor useless for the files people touch the most.
    for (const path of [".gitignore", ".gitmodules", ".github/workflows/ci.yml"]) {
      const resolved = await resolveForWrite(root, path);
      expect(resolved.target).not.toBeNull();
      expect(resolved.exists).toBe(true);
    }
  });

  it("refuses .GIT where the filesystem hands back .git", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git", "refs"), { recursive: true });

    // APFS and NTFS are case-insensitive, ext4 is not: on Linux — which is what
    // CI runs — `.GIT` is a different directory that simply does not exist, and
    // there is nothing to test. Do not delete this condition: the case it
    // guards is the one that opened `.git` for writing on every Mac.
    if (!existsSync(join(root, ".GIT"))) return;

    await expect(resolveForWrite(root, ".GIT")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(resolveForWrite(root, ".Git")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(resolveForWrite(root, ".GIT/refs")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("refuses a .GIT link the same way, name included", async () => {
    const root = checkout();
    mkdirSync(join(root, "inocente"), { recursive: true });
    symlinkSync(join(root, "inocente"), join(root, ".git"));
    if (!existsSync(join(root, ".GIT"))) return;

    // The one entry realpath cannot answer for: it would follow the link and
    // report `inocente`, losing the fact that the name on disk is `.git`.
    await expect(resolveForWrite(root, ".GIT")).rejects.toMatchObject({ code: "BLOCKED" });
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

  it("gives a dangling symlink no write target, and still hands over the link", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "sumiu.ts"), join(root, "quebrado.ts"));

    const resolved = await resolveForWrite(root, "quebrado.ts");

    // Nothing proves where a write would land, so there is no target and the
    // type says so. Removing it is another matter: that takes the link, and
    // there is no destination for it to take along.
    expect(resolved.target).toBeNull();
    expect(resolved.entry.endsWith("quebrado.ts")).toBe(true);
    expect(resolved.exists).toBe(true);
  });

  it("reports a checkout that is not on disk as blocked, not as a missing file", async () => {
    await expect(resolveForWrite("/definitely-not-here-xyz", "a.txt")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });
});
