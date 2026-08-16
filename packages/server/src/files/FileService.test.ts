import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

describe("readFile revision", () => {
  it("says which revision the text is based on", async () => {
    const root = checkout();

    const content = await files.readFile(root, "README.md");

    expect(content.kind === "text" && content.revision).toEqual(expect.any(String));
  });

  it("gives the same revision to the same content, and a different one to one byte more", async () => {
    const root = checkout();
    writeFileSync(join(root, "copia.md"), "# fixture\n");
    writeFileSync(join(root, "quase.md"), "# fixture\n\n");

    const [original, copy, almost] = await Promise.all([
      files.readFile(root, "README.md"),
      files.readFile(root, "copia.md"),
      files.readFile(root, "quase.md"),
    ]);

    // Content, not path: the same bytes in two files are the same revision.
    expect(original.kind === "text" && original.revision).toBe(copy.kind === "text" && copy.revision);
    expect(original.kind === "text" && original.revision).not.toBe(
      almost.kind === "text" && almost.revision,
    );
  });

  it("gives back the previous revision when the content comes back", async () => {
    const root = checkout();
    const file = join(root, "vai-e-volta.txt");
    writeFileSync(file, "antes\n");
    const before = await files.readFile(root, "vai-e-volta.txt");

    writeFileSync(file, "depois\n");
    const between = await files.readFile(root, "vai-e-volta.txt");
    writeFileSync(file, "antes\n");
    const after = await files.readFile(root, "vai-e-volta.txt");

    // This is the whole of Q4: every write moved the mtime, and two of the
    // three states are the same file. A revision made of mtime would call the
    // third one new and refuse a write that has nothing to lose.
    expect(after.kind === "text" && after.revision).toBe(before.kind === "text" && before.revision);
    expect(between.kind === "text" && between.revision).not.toBe(
      before.kind === "text" && before.revision,
    );
  });

  it("hashes the bytes on disk, not the text they decoded into", async () => {
    const root = checkout();
    const path = join(root, "latin1.txt");
    writeFileSync(path, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));

    const content = await files.readFile(root, "latin1.txt");

    // The whole contract of the revision, and the one thing a second
    // implementation gets wrong: hashing `text` re-encoded as UTF-8 gives a
    // digest of bytes that are not on the disk. Both sides would then compute
    // different revisions for the same file and every write would be `stale`.
    const onDisk = createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(content.kind === "text" && content.revision).toBe(onDisk);
  });

  it("has no revision for what it did not read", async () => {
    const root = checkout();
    writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x1a, 0x0a]));
    writeFileSync(join(root, "grande.txt"), "x".repeat(2_048));
    const capped = createFileService({ maxBytes: 1_024 });

    // No buffer, nothing to hash — and a revision nobody can compare would be
    // an invitation to write over a file the daemon never looked at.
    expect(await files.readFile(root, "logo.png")).not.toHaveProperty("revision");
    expect(await capped.readFile(root, "grande.txt")).not.toHaveProperty("revision");
  });
});

describe("readFile writability", () => {
  it("marks text UTF-8 cannot round-trip as read-only, with the reason named", async () => {
    const root = checkout();
    // `café` in Latin-1: a lone 0xE9, no NUL byte in sight. It walks past the
    // binary sniff, decodes with a replacement character, and autosave — which
    // writes on its own, with nobody clicking — would put the replacement back
    // over the original.
    writeFileSync(join(root, "latin1.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));

    const content = await files.readFile(root, "latin1.txt");

    expect(content.kind).toBe("text");
    expect(content.kind === "text" && content.readOnly).toBe("not-utf8");
  });

  it("keeps real UTF-8 writable, accents and all", async () => {
    const root = checkout();
    writeFileSync(join(root, "acentos.md"), "café, ação, 日本語, 🌱\n", "utf8");

    const content = await files.readFile(root, "acentos.md");

    // A check that refuses every multibyte file would pass the test above and
    // make the editor useless in Portuguese.
    expect(content.kind === "text" && content.readOnly).toBeNull();
  });

  it("catches broken bytes that re-encode to the same length", async () => {
    const root = checkout();
    // `caf` plus a truncated emoji: no NUL, so it walks past the binary sniff,
    // and the replacement character it decodes to is three bytes — exactly the
    // three that were left. Comparing lengths would call this writable and let
    // autosave put `ef bf bd` over `f0 9f 98`.
    const truncated = Buffer.from([0x63, 0x61, 0x66, 0xf0, 0x9f, 0x98]);
    writeFileSync(join(root, "cortado.txt"), truncated);

    const content = await files.readFile(root, "cortado.txt");

    expect(content.kind === "text" && content.readOnly).toBe("not-utf8");
    // The fixture only proves anything while this holds.
    const roundTrip = Buffer.from(content.kind === "text" ? content.text : "", "utf8");
    expect(roundTrip).toHaveLength(truncated.length);
    expect(roundTrip.equals(truncated)).toBe(false);
  });

  it("opens a file inside .git read-only, with .git named as the reason", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");

    const content = await files.readFile(root, ".git/config");

    // F1.4: it reads — the tree shows `.git` and opening it is legitimate. The
    // verdict comes from the server, so the editor opens locked instead of
    // letting the user type and having autosave refuse afterwards.
    expect(content).toMatchObject({ kind: "text", readOnly: "inside-git" });
  });

  it("never calls a file inside .git editable just because its bytes are odd", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "COMMIT_EDITMSG"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));

    const content = await files.readFile(root, ".git/COMMIT_EDITMSG");

    // Two reasons at once, and the order is a product decision, not a detail:
    // `inside-git` is a fact about the *path*, true whatever the bytes say, and
    // it is the one the person can act on. "não é UTF-8 válido" here is true and
    // useless — fixing the encoding would unlock nothing. Asserting only "not
    // null" accepted both answers and let the priority be inverted silently.
    expect(content.kind === "text" && content.readOnly).toBe("inside-git");
  });
});
