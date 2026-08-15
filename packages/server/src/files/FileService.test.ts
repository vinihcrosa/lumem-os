import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { createFileService } from "./FileService.js";

const files = createFileService();

afterEach(() => {
  cleanupGitFixtures();
});

function checkout(): string {
  const root = tempDir("lumem-checkout-");
  mkdirSync(join(root, "src", "lore"), { recursive: true });
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "src", "lore", "loader.ts"), "const a = 1;\nconst b = 2;\n");
  writeFileSync(join(root, "README.md"), "# fixture\n");
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  return root;
}

describe("listDir", () => {
  it("puts directories before files and sorts each group", async () => {
    const root = checkout();

    const listing = await files.listDir(root, "");

    expect(listing.entries.map((entry) => entry.name)).toEqual([
      "docs",
      "src",
      ".gitignore",
      "README.md",
    ]);
    expect(listing.entries[0]).toMatchObject({ kind: "dir", size: null });
    expect(listing.entries[3]).toMatchObject({ kind: "file", symlink: false });
    expect(listing.entries[3]!.size).toBeGreaterThan(0);
  });

  it("lists one level only", async () => {
    const root = checkout();

    const listing = await files.listDir(root, "src");

    expect(listing.path).toBe("src");
    expect(listing.entries.map((entry) => entry.name)).toEqual(["lore"]);
  });

  it("truncates a big directory and says how many there really are", async () => {
    const root = tempDir("lumem-big-");
    for (let index = 0; index < 12; index += 1) {
      writeFileSync(join(root, `f${index}.txt`), "x");
    }
    const capped = createFileService({ maxEntries: 5 });

    const listing = await capped.listDir(root, "");

    expect(listing.entries).toHaveLength(5);
    expect(listing.total).toBe(12);
    expect(listing.truncated).toBe(true);
  });

  it("does not claim truncation when everything fit", async () => {
    const root = checkout();

    expect(await files.listDir(root, "docs")).toMatchObject({ truncated: false, total: 0 });
  });

  it("describes a symlink by what it points at, and says it is a link", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "lore"), join(root, "atalho"));

    const listing = await files.listDir(root, "");
    const link = listing.entries.find((entry) => entry.name === "atalho");

    expect(link).toMatchObject({ kind: "dir", symlink: true });
  });

  it("refuses a file where a directory was asked for", async () => {
    const root = checkout();

    await expect(files.listDir(root, "README.md")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });
});

describe("readFile", () => {
  it("returns text with its line count", async () => {
    const root = checkout();

    const content = await files.readFile(root, "src/lore/loader.ts");

    expect(content).toMatchObject({ kind: "text", lines: 2, path: "src/lore/loader.ts" });
    expect(content.kind === "text" && content.text).toContain("const a = 1;");
  });

  it("calls a file with a NUL byte binary instead of dumping it", async () => {
    const root = checkout();
    writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x1a, 0x0a]));

    expect(await files.readFile(root, "logo.png")).toMatchObject({ kind: "binary", bytes: 5 });
  });

  it("refuses to read past the ceiling, and reports both numbers", async () => {
    const root = checkout();
    writeFileSync(join(root, "pnpm-lock.yaml"), "x".repeat(2_048));
    const capped = createFileService({ maxBytes: 1_024 });

    expect(await capped.readFile(root, "pnpm-lock.yaml")).toEqual({
      kind: "too-large",
      path: "pnpm-lock.yaml",
      bytes: 2_048,
      limit: 1_024,
    });
  });

  it("counts an empty file as zero lines", async () => {
    const root = checkout();
    writeFileSync(join(root, "vazio.txt"), "");

    expect(await files.readFile(root, "vazio.txt")).toMatchObject({ kind: "text", lines: 0 });
  });

  it("counts a last line without a trailing newline", async () => {
    const root = checkout();
    writeFileSync(join(root, "sem-quebra.txt"), "um\ndois");

    expect(await files.readFile(root, "sem-quebra.txt")).toMatchObject({ lines: 2 });
  });

  it("refuses a directory where a file was asked for", async () => {
    const root = checkout();

    await expect(files.readFile(root, "docs")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });
});
