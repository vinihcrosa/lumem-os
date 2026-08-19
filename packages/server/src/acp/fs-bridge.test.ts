import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileService } from "../files/FileService.js";
import { createFsBridge, type FsBridge } from "./fs-bridge.js";

/**
 * The agent touching the disk.
 *
 * This is the one part of phase 4 that comes out *dangerous* if it comes out
 * wrong: `fs/write_text_file` is new write surface, and with `auto` as the
 * default permission mode there is less human confirmation in the path than
 * anywhere else in the feature. So the guard cases come first in this file, and
 * they were written before the write existed.
 *
 * The guard itself is the `file-editor`'s, reused without a new exception. What
 * is new — and therefore what needs proving here — is the step before it: ACP
 * sends **absolute** paths and `path-guard` refuses absolute paths on principle,
 * so something has to turn one into the other. That conversion is security code.
 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A checkout with a file in it, plus a sibling directory outside it. */
function checkout(): { root: string; outside: string; bridge: FsBridge } {
  const base = mkdtempSync(join(tmpdir(), "lumem-acp-fs-"));
  dirs.push(base);

  const root = join(base, "repo");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "loader.ts"), "um\ndois\ntres\n");

  // A sibling whose name starts with the root's, which is what makes a string
  // prefix check wrong: `/…/repo-malicioso` starts with `/…/repo`.
  const outside = join(base, "repo-malicioso");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "segredo.txt"), "não deveria sair daqui\n");

  return { root, outside, bridge: createFsBridge({ files: createFileService(), root }) };
}

describe("the guard, before anything is written", () => {
  it("refuses an absolute path outside the checkout", async () => {
    const { bridge, outside } = checkout();

    await expect(bridge.read(join(outside, "segredo.txt"))).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("refuses a sibling whose name merely starts with the checkout's", async () => {
    // The reason the check is not a string prefix. `/…/repo-malicioso` passes
    // `startsWith("/…/repo")` and is a different repository.
    const { bridge, outside } = checkout();

    await expect(bridge.write(join(outside, "novo.txt"), "x")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("refuses a relative path that climbs out, after normalising", async () => {
    const { bridge, root } = checkout();

    await expect(bridge.read(join(root, "src", "..", "..", "etc", "passwd"))).rejects.toThrow();
  });

  it("refuses a path with a null byte", async () => {
    const { bridge, root } = checkout();

    await expect(bridge.read(`${join(root, "src")}\0/loader.ts`)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("refuses a symlink that resolves outside the checkout", async () => {
    // Not simulated: a real link, because the guard's whole answer comes from
    // `realpath` and a fake would prove nothing.
    const { bridge, root, outside } = checkout();
    symlinkSync(outside, join(root, "atalho"));

    await expect(bridge.read(join(root, "atalho", "segredo.txt"))).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("accepts a symlink that stays inside the checkout", async () => {
    // The other half, and the one a paranoid guard breaks: a guard that refuses
    // every link passes every security test and breaks the product.
    const { bridge, root } = checkout();
    symlinkSync(join(root, "src"), join(root, "codigo"));

    await expect(bridge.read(join(root, "codigo", "loader.ts"))).resolves.toContain("dois");
  });

  it("refuses to write inside .git", async () => {
    const { bridge, root } = checkout();
    mkdirSync(join(root, ".git"), { recursive: true });

    await expect(bridge.write(join(root, ".git", "config"), "x")).rejects.toMatchObject({
      code: "BLOCKED",
    });
  });

  it("still allows .gitignore, which is an ordinary file", async () => {
    // `.git` as a whole component, never a substring. People edit `.gitignore`
    // all day.
    const { bridge, root } = checkout();

    await expect(bridge.write(join(root, ".gitignore"), "node_modules\n")).resolves.toBeUndefined();
  });
});

describe("reading", () => {
  it("gives back the file's text", async () => {
    const { bridge, root } = checkout();

    await expect(bridge.read(join(root, "src", "loader.ts"))).resolves.toBe("um\ndois\ntres\n");
  });

  it("honours the window the agent asked for", async () => {
    // `line` and `limit` are optional in ACP and are how an agent reads a slice
    // of something large. Ignoring them would send the whole file and blow the
    // agent's own context on content it did not ask for.
    const { bridge, root } = checkout();

    await expect(bridge.read(join(root, "src", "loader.ts"), { line: 2, limit: 1 })).resolves.toBe(
      "dois\n",
    );
  });

  it("treats a line past the end as an empty window rather than an error", async () => {
    const { bridge, root } = checkout();

    await expect(bridge.read(join(root, "src", "loader.ts"), { line: 99 })).resolves.toBe("");
  });

  it("refuses a binary file, because this method is about text", async () => {
    const { bridge, root } = checkout();
    writeFileSync(join(root, "imagem.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));

    await expect(bridge.read(join(root, "imagem.png"))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: /binário/,
    });
  });

  it("refuses a file past the ceiling, and says the ceiling", async () => {
    const { bridge, root } = checkout();
    const files = createFileService({ maxBytes: 16 });
    const small = createFsBridge({ files, root });
    writeFileSync(join(root, "grande.txt"), "x".repeat(64));

    await expect(small.read(join(root, "grande.txt"))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: /16/,
    });
    void bridge;
  });

  it("refuses a file that is not there, without pretending it is empty", async () => {
    const { bridge, root } = checkout();

    await expect(bridge.read(join(root, "fantasma.ts"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("writing", () => {
  it("overwrites a file that exists", async () => {
    const { bridge, root } = checkout();

    await bridge.write(join(root, "src", "loader.ts"), "novo conteúdo\n");

    await expect(bridge.read(join(root, "src", "loader.ts"))).resolves.toBe("novo conteúdo\n");
  });

  it("creates a file that does not exist yet", async () => {
    // ACP's write creates or replaces; the `FileService`'s refuses a missing
    // file because for the editor that would let autosave resurrect something
    // just deleted. The bridge is what reconciles the two intents.
    const { bridge, root } = checkout();

    await bridge.write(join(root, "src", "frontmatter.ts"), "export {};\n");

    await expect(bridge.read(join(root, "src", "frontmatter.ts"))).resolves.toBe("export {};\n");
  });

  it("creates the directories the new file needs", async () => {
    const { bridge, root } = checkout();

    await bridge.write(join(root, "novo", "fundo", "arquivo.ts"), "ok\n");

    await expect(bridge.read(join(root, "novo", "fundo", "arquivo.ts"))).resolves.toBe("ok\n");
  });

  it("does not need a revision, because the agent has no buffer", async () => {
    /*
     * The editor's `baseRevision` exists because a *human's* buffer can be stale
     * by the time it saves. An agent's write is not a buffer being flushed — it
     * is a statement of what the file should now contain. So the bridge reads the
     * current revision immediately before writing rather than asking the agent
     * for one it could not have.
     *
     * What that costs is named rather than hidden: two agents writing the same
     * file in the same instant, and the second wins. What it protects is the
     * editor, which keeps its own check — if a person had unsaved text, their
     * next autosave still comes back `stale`, which is the conflict the
     * `file-editor` already handles.
     */
    const { bridge, root } = checkout();

    await bridge.write(join(root, "src", "loader.ts"), "primeiro\n");
    await bridge.write(join(root, "src", "loader.ts"), "segundo\n");

    await expect(bridge.read(join(root, "src", "loader.ts"))).resolves.toBe("segundo\n");
  });

  it("refuses a file the disk says is read-only", async () => {
    const { bridge, root } = checkout();
    const locked = join(root, "travado.txt");
    writeFileSync(locked, "não mexa\n");
    chmodSync(locked, 0o444);

    await expect(bridge.write(locked, "mexi\n")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("refuses text past the byte ceiling", async () => {
    const { bridge: _unused, root } = checkout();
    const small = createFsBridge({ files: createFileService({ maxBytes: 8 }), root });

    await expect(small.write(join(root, "grande.txt"), "x".repeat(64))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    void _unused;
  });
});
