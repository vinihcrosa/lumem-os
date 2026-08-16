import { execFileSync } from "node:child_process";
import {
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { createFileService, writeAtomically } from "./FileService.js";

/**
 * The case that justifies the feature: two writers, one file, no lock.
 *
 * The agent writes into the same checkout without knowing an editor is open,
 * and autosave writes on its own without anybody clicking. Every other test of
 * `writeFile` sets the disk up and then asks a question; these set the disk up
 * from *outside the process*, which is the only version of the question the
 * product actually faces.
 *
 * Real writes, never simulated — the same policy `docs/project/testing.md`
 * states for git. A stub of "the file changed" would answer whatever this
 * service assumes about it, and the assumption is the thing under test.
 */

const files = createFileService();

afterEach(() => {
  cleanupGitFixtures();
});

function checkout(): string {
  const root = tempDir("lumem-concurrent-");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "loader.ts"), "const a = 1;\nconst b = 2;\n");
  return root;
}

/**
 * Another process writing the file, which is what the agent is.
 *
 * Not `writeFileSync` from this process: the daemon holds no lock and no cache,
 * and a write from inside the test could quietly come to depend on either.
 */
function agentWrites(file: string, text: string): void {
  execFileSync(process.execPath, [
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], process.argv[2])",
    file,
    text,
  ]);
}

async function revisionFromRead(root: string, path: string): Promise<string> {
  const content = await files.readFile(root, path);
  if (content.kind !== "text") throw new Error(`a fixture ${path} não é texto`);
  return content.revision;
}

describe("writing while the agent writes", () => {
  it("refuses the stale save and leaves what the agent wrote on disk", async () => {
    const root = checkout();
    const file = join(root, "src", "loader.ts");
    const opened = await revisionFromRead(root, "src/loader.ts");

    agentWrites(file, "const a = 1;\nconst b = 3;\nconst c = 4;\n");
    const result = await files.writeFile(root, "src/loader.ts", {
      text: "const a = 2;\nconst b = 2;\n",
      baseRevision: opened,
    });

    expect(result.ok).toBe(false);
    // The agent's bytes, untouched. This is the whole risk the PRD names: the
    // editor had been open for a minute and the debounce fired on its own.
    expect(readFileSync(file, "utf8")).toBe("const a = 1;\nconst b = 3;\nconst c = 4;\n");
    expect(readdirSync(join(root, "src"))).toEqual(["loader.ts"]);
  });

  it("hands back the disk's revision, so overwriting needs no second read", async () => {
    const root = checkout();
    const file = join(root, "src", "loader.ts");
    const opened = await revisionFromRead(root, "src/loader.ts");
    agentWrites(file, "escrito pelo agente\n");

    const refusal = await files.writeFile(root, "src/loader.ts", {
      text: "o que eu digitei\n",
      baseRevision: opened,
    });

    expect(refusal).toMatchObject({ ok: false, reason: "stale" });
    // Two claims in one: it is a revision of the disk *now*, not of what the
    // client had, and it is the same string a fresh read would produce — which
    // is what makes the second attempt below possible without one.
    const onDisk = await revisionFromRead(root, "src/loader.ts");
    expect(refusal.ok === false && refusal.revision).toBe(onDisk);
    expect(refusal.ok === false && refusal.revision).not.toBe(opened);
    expect(refusal.ok === false && refusal.changedAt).toBe(Math.round(statSync(file).mtimeMs));
  });

  it("takes the revision that came with the refusal, which is the overwrite button", async () => {
    const root = checkout();
    const file = join(root, "src", "loader.ts");
    const opened = await revisionFromRead(root, "src/loader.ts");
    agentWrites(file, "escrito pelo agente\n");

    const refusal = await files.writeFile(root, "src/loader.ts", {
      text: "o que eu digitei\n",
      baseRevision: opened,
    });
    const overwrite = await files.writeFile(root, "src/loader.ts", {
      text: "o que eu digitei\n",
      baseRevision: refusal.ok === false ? refusal.revision : "",
    });

    // "Sobrescrever" on the conflict screen, end to end: the client never reads
    // the file again, it answers with what the refusal gave it. If this failed,
    // the only way out of a conflict would be to lose what was typed.
    expect(overwrite.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("o que eu digitei\n");
  });

  it("chains its own writes without a read in between", async () => {
    const root = checkout();
    const file = join(root, "src", "loader.ts");
    const opened = await revisionFromRead(root, "src/loader.ts");

    const first = await files.writeFile(root, "src/loader.ts", {
      text: "primeira\n",
      baseRevision: opened,
    });
    const second = await files.writeFile(root, "src/loader.ts", {
      text: "segunda\n",
      baseRevision: first.ok ? first.revision : "",
    });

    // Autosave fires again while the tab is still open. If the revision handed
    // back by a write were anything other than the file's new one, the second
    // keystroke of every session would come back `stale` against nobody.
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("segunda\n");
  });

  it("sees a change made between the read and the save even when the size is the same", async () => {
    const root = checkout();
    const file = join(root, "src", "loader.ts");
    const opened = await revisionFromRead(root, "src/loader.ts");

    agentWrites(file, "const a = 9;\nconst b = 2;\n");
    const result = await files.writeFile(root, "src/loader.ts", {
      text: "const a = 1;\nconst b = 5;\n",
      baseRevision: opened,
    });

    // Same byte count, same second on a filesystem with one-second mtimes: a
    // revision made of size, or of size plus mtime, calls this file unchanged
    // and overwrites the agent (Q4). It is the hash that catches it.
    expect(result.ok).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("const a = 9;\nconst b = 2;\n");
  });
});

describe("what the atomic write protects, and the guard does not", () => {
  it("leaves a file outside the checkout intact when a hard link points at it", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    const secret = join(outside, "id_rsa");
    writeFileSync(secret, "PRIVATE KEY");
    // §5, said out loud: `realpath` cannot see a hard link, so this file is
    // indistinguishable from an ordinary one inside the checkout and passes all
    // five path rules. Refusing every file with st_nlink > 1 would cost more
    // than it buys, so what covers it is *this*, and only this.
    linkSync(secret, join(root, "inocente.txt"));
    const base = await revisionFromRead(root, "inocente.txt");

    const result = await files.writeFile(root, "inocente.txt", {
      text: "sobrescrito\n",
      baseRevision: base,
    });

    expect(result.ok).toBe(true);
    // In place, these three lines are the vector: the bytes would go through
    // the shared inode and `~/.ssh/id_rsa` would now read "sobrescrito". With
    // the temporary and the rename, what is lost is the link, not the file.
    expect(readFileSync(secret, "utf8")).toBe("PRIVATE KEY");
    expect(readFileSync(join(root, "inocente.txt"), "utf8")).toBe("sobrescrito\n");
    expect(statSync(join(root, "inocente.txt")).ino).not.toBe(statSync(secret).ino);
  });

  it("leaves a file outside intact when the last component becomes a link after the guard ran", async () => {
    const root = checkout();
    const outside = tempDir("lumem-outside-");
    const secret = join(outside, "id_rsa");
    writeFileSync(secret, "PRIVATE KEY");
    // The state the swap leaves behind: the guard approved a path, and by the
    // time the bytes are written that path is a link pointing outside. The
    // window is declared accepted in §5 — the threat model is accident — so
    // this is not about closing it, it is about what happens when it is hit.
    // Exercised on the primitive because forcing the race is not a test.
    symlinkSync(secret, join(root, "alvo.txt"));

    await writeAtomically(join(root, "alvo.txt"), Buffer.from("sobrescrito\n"), 0o644);

    expect(readFileSync(secret, "utf8")).toBe("PRIVATE KEY");
    expect(readFileSync(join(root, "alvo.txt"), "utf8")).toBe("sobrescrito\n");
    // The rename replaced the link with a plain file, which is the "o que se
    // perde é o link" the PRD measured.
    expect(lstatSync(join(root, "alvo.txt")).isSymbolicLink()).toBe(false);
  });
});
