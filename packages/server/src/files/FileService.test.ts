import { createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { createFileService, revisionOf, tempPathFor, writeAtomically } from "./FileService.js";

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

  it("reads a file of exactly the ceiling, and refuses the very next byte", async () => {
    const root = checkout();
    writeFileSync(join(root, "no-limite.txt"), "x".repeat(1_024));
    writeFileSync(join(root, "um-a-mais.txt"), "x".repeat(1_025));
    const capped = createFileService({ maxBytes: 1_024 });

    expect(await capped.readFile(root, "no-limite.txt")).toMatchObject({ kind: "text" });
    expect(await capped.readFile(root, "um-a-mais.txt")).toMatchObject({ kind: "too-large" });
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

  it("marks a file the daemon could not have written in place as read-only", async () => {
    const root = checkout();
    const file = join(root, "protegido.md");
    writeFileSync(file, "# não mexa\n");
    chmodSync(file, 0o444);

    const content = await files.readFile(root, "protegido.md");

    // The fifth refusal (F1.4). Reading is untouched — the file opens, the text
    // is there — and what the client is told is that saving it is not on offer.
    //
    // `access(W_OK)` is the verdict rather than `mode & 0o200` because the
    // question is "este processo consegue escrever neste arquivo?", which the
    // kernel answers for owner, group, others and ACL at once. It behaves the
    // same on the CI runner: `ubuntu-latest` runs the job as an ordinary user,
    // not in a root container. As root every W_OK is granted and this test
    // would be red — which is a true statement about a daemon running as root,
    // and not a configuration this suite has.
    expect(content).toMatchObject({ kind: "text", readOnly: "not-writable" });
    expect(content.kind === "text" && content.text).toBe("# não mexa\n");
  });

  it("puts the permission ahead of the bytes, and .git ahead of both", async () => {
    const root = checkout();
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "MERGE_MSG"), latin1);
    chmodSync(join(root, ".git", "MERGE_MSG"), 0o444);
    writeFileSync(join(root, "protegido-latin1.txt"), latin1);
    chmodSync(join(root, "protegido-latin1.txt"), 0o444);

    const inGit = await files.readFile(root, ".git/MERGE_MSG");
    const outside = await files.readFile(root, "protegido-latin1.txt");

    // Three reasons true at once, and the order is a decision: from the most
    // structural to the most dependent on content — the path outranks the
    // permission, which outranks the bytes. Only the first is something the
    // person can act on, and it is the one that stays true whatever the other
    // two say. Asserting "not null" would accept any of the three and let the
    // priority invert without a word.
    expect(inGit.kind === "text" && inGit.readOnly).toBe("inside-git");
    expect(outside.kind === "text" && outside.readOnly).toBe("not-writable");
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

/** The revision a client would be holding, obtained the way a client gets it. */
async function revisionFromRead(root: string, path: string): Promise<string> {
  const content = await files.readFile(root, path);
  if (content.kind !== "text") throw new Error(`a fixture ${path} não é texto`);
  return content.revision;
}

describe("writeFile", () => {
  it("writes the text and says which revision the file now is", async () => {
    const root = checkout();
    const base = await revisionFromRead(root, "src/lore/loader.ts");

    const result = await files.writeFile(root, "src/lore/loader.ts", {
      text: "const a = 9;\nconst b = 2;\n",
      baseRevision: base,
    });

    expect(result).toEqual({ ok: true, revision: revisionOf(Buffer.from("const a = 9;\nconst b = 2;\n")) });
    expect(readFileSync(join(root, "src", "lore", "loader.ts"), "utf8")).toBe(
      "const a = 9;\nconst b = 2;\n",
    );
    // The revision it hands back is the one a read would give next, or the
    // client's very next autosave is stale against a file only it has written.
    expect(result.ok && result.revision).toBe(await revisionFromRead(root, "src/lore/loader.ts"));
  });

  it("refuses a write based on a revision the disk no longer has", async () => {
    const root = checkout();
    const file = join(root, "src", "lore", "loader.ts");
    const stale = await revisionFromRead(root, "src/lore/loader.ts");
    writeFileSync(file, "// o agente escreveu isto\n");
    // A whole second in the past, so `changedAt` cannot be `Date.now()` in
    // disguise — and set with utimes rather than a sleep, which would make the
    // suite slower and the assertion looser.
    const changed = new Date(Math.floor((Date.now() - 60_000) / 1_000) * 1_000);
    utimesSync(file, changed, changed);

    const result = await files.writeFile(root, "src/lore/loader.ts", {
      text: "o que eu digitei\n",
      baseRevision: stale,
    });

    expect(result).toEqual({
      ok: false,
      reason: "stale",
      // The disk's revision, so the client can offer "sobrescrever" without a
      // second read — F3.4 and the whole point of E7.
      revision: await revisionFromRead(root, "src/lore/loader.ts"),
      changedAt: changed.getTime(),
    });
    expect(readFileSync(file, "utf8")).toBe("// o agente escreveu isto\n");
  });

  it("compares against the disk at the moment of writing, not against the last read", async () => {
    const root = checkout();
    const file = join(root, "README.md");
    const base = await revisionFromRead(root, "README.md");
    // Written back to exactly what it was: same content, later mtime, same
    // revision (Q4). A guard made of mtime would refuse this write.
    writeFileSync(file, "# fixture\n");

    const result = await files.writeFile(root, "README.md", { text: "# outro\n", baseRevision: base });

    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("# outro\n");
  });

  it("keeps the mode, so a script that was executable still is", async () => {
    const root = checkout();
    const file = join(root, "build.sh");
    writeFileSync(file, "#!/bin/sh\necho um\n");
    chmodSync(file, 0o755);
    const base = await revisionFromRead(root, "build.sh");

    await files.writeFile(root, "build.sh", { text: "#!/bin/sh\necho dois\n", baseRevision: base });

    // The bytes land on a brand new inode, so this mode is not the old file's
    // by inheritance — it was carried over on purpose or it is gone.
    expect(statSync(file).mode & 0o777).toBe(0o755);
  });

  it("keeps a bit the umask would have taken off, which is the half 0o755 cannot show", async () => {
    const root = checkout();
    const file = join(root, "compartilhado.ts");
    writeFileSync(file, "const a = 1;\n");
    chmodSync(file, 0o664);
    const base = await revisionFromRead(root, "compartilhado.ts");

    await files.writeFile(root, "compartilhado.ts", {
      text: "const a = 2;\n",
      baseRevision: base,
    });

    // 0o664 rather than the 0o755 above, and the difference is the whole test:
    // under the usual umask of 022, `open` already hands 0o755 back for 0o755,
    // so that fixture stays green with the chmod deleted — it exercises
    // neither half of the mechanism. Here `open` gives 0o644 and only the chmod
    // puts the group's write bit back.
    //
    // The case is a checkout made with `core.sharedRepository`, where every
    // file is 0o664: losing it on each autosave is invisible, because git
    // tracks the execute bit and nothing else, so the permissions drift while
    // `git status` stays empty.
    expect(statSync(file).mode & 0o777).toBe(0o664);
  });

  it("does not carry setuid onto the new inode", async () => {
    const root = checkout();
    const file = join(root, "suid.sh");
    writeFileSync(file, "#!/bin/sh\necho um\n");
    chmodSync(file, 0o4755);
    // Fixture first: a filesystem that refuses the bit would make the assertion
    // below pass for the wrong reason.
    expect(statSync(file).mode & 0o7777).toBe(0o4755);
    const base = await revisionFromRead(root, "suid.sh");

    await files.writeFile(root, "suid.sh", { text: "#!/bin/sh\necho dois\n", baseRevision: base });

    // Decided, not overlooked: the mask is 0o777 and setuid, setgid and sticky
    // are dropped. The bytes are a new inode created by the daemon's user, and
    // setuid on the old one meant "runs as whoever owned that file" — carrying
    // it over would mint a privilege the original only had by belonging to
    // someone else. Widening the mask back to 0o7777 turns this red.
    expect(statSync(file).mode & 0o7777).toBe(0o755);
  });

  it("replaces the file instead of writing into it", async () => {
    const root = checkout();
    const file = join(root, "README.md");
    const before = statSync(file).ino;
    const base = await revisionFromRead(root, "README.md");

    await files.writeFile(root, "README.md", { text: "# depois\n", baseRevision: base });

    // The one observable difference between temp + rename and an in-place
    // write, and §5 of the PRD turned it from an integrity requirement into a
    // security control: in place, a hard link or a last-component swap puts
    // these bytes into a file outside the checkout. Renamed, that file keeps
    // what it had. Same inode after a write means someone "optimised" this.
    expect(statSync(file).ino).not.toBe(before);
  });

  it("leaves no temporary behind when it works", async () => {
    const root = checkout();
    const base = await revisionFromRead(root, "src/lore/loader.ts");

    await files.writeFile(root, "src/lore/loader.ts", { text: "novo\n", baseRevision: base });

    expect(readdirSync(join(root, "src", "lore"))).toEqual(["loader.ts"]);
  });

  it("puts the temporary in the target's own directory", async () => {
    const target = "/repo/src/lore/loader.ts";

    const temp = tempPathFor(target);

    // `rename` is only atomic within a filesystem, so a temporary in the system
    // tmpdir is not a slower version of this — it is a different operation,
    // one that fails with EXDEV across devices and copies across the window
    // this exists to close. Two calls never collide, so two writers of the same
    // file do not destroy each other's temporary.
    expect(dirname(temp)).toBe(dirname(target));
    expect(temp).not.toBe(target);
    expect(tempPathFor(target)).not.toBe(temp);
  });

  it("removes the temporary when the write fails half way through", async () => {
    const root = checkout();

    // A directory as the target: the temporary is created, and then `rename`
    // refuses. Reaching this through `writeFile` is impossible by design — it
    // names the directory before touching anything — so the primitive is
    // exercised where the cleanup lives. Without the cleanup a `.tmp` stays in
    // the user's tree forever, and the tree shows it.
    await expect(writeAtomically(join(root, "docs"), Buffer.from("x"), 0o644)).rejects.toThrow();

    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(statSync(join(root, "docs")).isDirectory()).toBe(true);
  });

  it("writes through an internal symlink to the destination, and the link stays a link", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "lore", "loader.ts"), join(root, "atalho.ts"));
    const base = await revisionFromRead(root, "atalho.ts");

    const result = await files.writeFile(root, "atalho.ts", {
      text: "pelo atalho\n",
      baseRevision: base,
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "src", "lore", "loader.ts"), "utf8")).toBe("pelo atalho\n");
    // A rename over the entry would have turned the link into a plain file,
    // silently, and the destination would still hold the old text (D5).
    expect(lstatSync(join(root, "atalho.ts")).isSymbolicLink()).toBe(true);
  });

  it("refuses to write through a link that points outside the checkout, and names why", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    writeFileSync(join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(join(outside, "id_rsa"), join(root, "chave.txt"));

    const failure = await files
      .writeFile(root, "chave.txt", { text: "meu", baseRevision: "qualquer" })
      .catch((error) => error);

    // E3.1 made this path removable, which means the refusal is this method's
    // now. `target!` here would be the one edit that undoes it.
    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(failure.message).toMatch(/aponta para fora do checkout/);
    expect(readFileSync(join(outside, "id_rsa"), "utf8")).toBe("PRIVATE KEY");
  });

  it("refuses to write through a dangling link, and says that instead", async () => {
    const root = checkout();
    symlinkSync(join(root, "src", "sumiu.ts"), join(root, "quebrado.ts"));

    const failure = await files
      .writeFile(root, "quebrado.ts", { text: "meu", baseRevision: "qualquer" })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    // Not the same sentence as the one above: this link points at nothing, and
    // creating what it points at is not what "gravar este arquivo" asked for.
    expect(failure.message).not.toMatch(/fora do checkout/);
    expect(failure.message).toMatch(/pendurado/);
    expect(readdirSync(join(root, "src"))).toEqual(["lore"]);
  });

  it("refuses text over the ceiling, so writing is not a way around the read limit", async () => {
    const root = checkout();
    const capped = createFileService({ maxBytes: 64 });
    const base = await revisionFromRead(root, "README.md");

    const failure = await capped
      .writeFile(root, "README.md", { text: "x".repeat(65), baseRevision: base })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# fixture\n");
  });

  it("accepts a text of exactly the ceiling, which is where read and write have to agree", async () => {
    const root = checkout();
    const capped = createFileService({ maxBytes: 64 });
    const base = await revisionFromRead(root, "README.md");

    const result = await capped.writeFile(root, "README.md", {
      text: "x".repeat(64),
      baseRevision: base,
    });

    // The border, pinned on the side that passes: `>` turned into `>=` keeps
    // every other test green — 65 against 64 and 2048 against 1024 are both
    // still refused — and makes a file of exactly MAX_FILE_BYTES readable and
    // impossible to save. Read and write disagreeing on one byte is a file the
    // editor opens and can never write back.
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("x".repeat(64));
  });

  it("counts the ceiling in bytes, not in characters", async () => {
    const root = checkout();
    const capped = createFileService({ maxBytes: 64 });
    const base = await revisionFromRead(root, "README.md");

    // 32 emoji, 4 bytes each: half the ceiling by length, twice it by bytes.
    const failure = await capped
      .writeFile(root, "README.md", { text: "🌱".repeat(32), baseRevision: base })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("refuses a file the read side never handed out a revision for", async () => {
    const root = checkout();
    writeFileSync(join(root, "grande.txt"), "x".repeat(2_048));
    const capped = createFileService({ maxBytes: 1_024 });

    // `readFile` answers `too-large` with no revision, so any baseRevision for
    // this file is invented. Hashing it to say so would mean reading past the
    // ceiling, which is the one thing the ceiling exists to prevent.
    await expect(
      capped.writeFile(root, "grande.txt", { text: "curto\n", baseRevision: "inventada" }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    expect(readFileSync(join(root, "grande.txt"), "utf8")).toHaveLength(2_048);
  });

  it("refuses to write over bytes UTF-8 cannot round-trip, revision or no revision", async () => {
    const root = checkout();
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    writeFileSync(join(root, "latin1.txt"), latin1);
    // The correct revision, obtained the way the client obtains it: the read
    // side hands one out for this file, it just also says it is read-only.
    const base = await revisionFromRead(root, "latin1.txt");

    const failure = await files
      .writeFile(root, "latin1.txt", { text: "café\n", baseRevision: base })
      .catch((error) => error);

    // The second lock, on the side that has the bytes (Q9). The client already
    // refuses to edit; this is what stops a client that asks anyway from
    // turning `0xe9` into `ef bf bd` with nobody having clicked.
    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(readFileSync(join(root, "latin1.txt"))).toEqual(latin1);
  });

  it("does not let the atomic write become a way around a file's permissions", async () => {
    const root = checkout();
    const file = join(root, "protegido.md");
    writeFileSync(file, "# não mexa\n");
    const base = await revisionFromRead(root, "protegido.md");
    chmodSync(file, 0o444);
    const inode = statSync(file).ino;
    // The half that makes this a property and not a mode check: the directory
    // *is* writable, and `rename` is checked against the directory, never
    // against the file. Delete the refusal in `writeFile` and this write
    // succeeds — a daemon that could not have put one byte into the file
    // replaces it whole, with the correct revision and no error anywhere.
    expect(() => accessSync(root, constants.W_OK)).not.toThrow();

    const failure = await files
      .writeFile(root, "protegido.md", { text: "# mexi\n", baseRevision: base })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(readFileSync(file, "utf8")).toBe("# não mexa\n");
    // The inode as well as the bytes: what is refused is the *replacement*, so
    // a write that happened to land the same text would still be the escape.
    expect(statSync(file).ino).toBe(inode);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("writes exactly what it was given: CRLF, no trailing newline, accents", async () => {
    const root = checkout();
    const file = join(root, "crlf.txt");
    writeFileSync(file, "um\r\ndois\r\n");
    const base = await revisionFromRead(root, "crlf.txt");

    await files.writeFile(root, "crlf.txt", { text: "um\r\ndois\r\ntrês", baseRevision: base });

    // A7: the normalisation is the client's and it is symmetric. A server that
    // "helpfully" adds a trailing newline or rewrites line endings shows every
    // file as modified in the Mudanças tab the moment it is opened.
    expect(readFileSync(file)).toEqual(Buffer.from("um\r\ndois\r\ntrês", "utf8"));
  });

  it("refuses a path that is not there, because creating is another operation", async () => {
    const root = checkout();

    await expect(
      files.writeFile(root, "src/lore/novo.ts", { text: "x\n", baseRevision: "nenhuma" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a directory as a write target", async () => {
    const root = checkout();

    await expect(
      files.writeFile(root, "docs", { text: "x\n", baseRevision: "nenhuma" }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("refuses to write inside .git, again at the call, not only at the guard", async () => {
    const root = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "[core]\n");
    const base = await revisionFromRead(root, ".git/config");

    const failure = await files
      .writeFile(root, ".git/config", { text: "[core]\n\tbare = true\n", baseRevision: base })
      .catch((error) => error);

    expect(failure).toMatchObject({ code: "BLOCKED" });
    expect(readFileSync(join(root, ".git", "config"), "utf8")).toBe("[core]\n");
  });
});
