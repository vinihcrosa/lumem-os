import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it } from "vitest";
import type { ZodError } from "zod";

import { MAX_FILE_BYTES } from "../files/FileService.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/** A project on a real repository, plus a worktree cut from it. */
async function setup(): Promise<{
  context: TestCaller;
  projectId: string;
  repo: string;
  worktreeId: string;
  worktreePath: string;
}> {
  context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  mkdirSync(join(repo, "src", "lore"), { recursive: true });
  writeFileSync(join(repo, "src", "lore", "loader.ts"), "const a = 1;\n");
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  const worktree = await context.api.worktree.create({ projectId: project.id, name: "teste" });
  return {
    context,
    projectId: project.id,
    repo,
    worktreeId: worktree.id,
    worktreePath: worktree.path,
  };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("files.listDir", () => {
  it("lists the project's own checkout", async () => {
    const { context: ctx, projectId } = await setup();

    const listing = await ctx.api.files.listDir({
      scopeType: "project",
      scopeId: projectId,
      path: "",
    });

    expect(listing.entries.map((entry) => entry.name)).toContain("README.md");
    expect(listing.entries.map((entry) => entry.name)).toContain("src");
  });

  it("lists a worktree, which is a different directory than the project", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    writeFileSync(join(worktreePath, "so-na-worktree.txt"), "x");

    const listing = await ctx.api.files.listDir({
      scopeType: "worktree",
      scopeId: worktreeId,
      path: "",
    });

    expect(listing.entries.map((entry) => entry.name)).toContain("so-na-worktree.txt");
  });

  it("defaults to the root when no path is given", async () => {
    const { context: ctx, projectId } = await setup();

    const listing = await ctx.api.files.listDir({ scopeType: "project", scopeId: projectId });

    expect(listing.path).toBe("");
  });

  it("refuses a path that escapes the checkout", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(
      ctx.api.files.listDir({ scopeType: "project", scopeId: projectId, path: "src/../.." }),
    ).rejects.toThrow(/sai do checkout/);
  });

  it("refuses a symlink pointing outside, and says why", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const outside = tempDir("lumem-outside-");
    writeFileSync(join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(outside, join(repo, "chaves"));

    await expect(
      ctx.api.files.read({ scopeType: "project", scopeId: projectId, path: "chaves/id_rsa" }),
    ).rejects.toThrow(/aponta para fora do checkout/);
  });

  it("reports an unknown scope as not found", async () => {
    const { context: ctx } = await setup();

    await expect(
      ctx.api.files.listDir({ scopeType: "worktree", scopeId: "wt_inexistente" }),
    ).rejects.toThrow(/não existe/);
  });

  it("reports a checkout that vanished from disk instead of an ENOENT", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });

    await expect(
      ctx.api.files.listDir({ scopeType: "worktree", scopeId: worktreeId }),
    ).rejects.toThrow(/o checkout não está em/);
  });
});

describe("files.read", () => {
  it("returns the file's text", async () => {
    const { context: ctx, projectId } = await setup();

    const content = await ctx.api.files.read({
      scopeType: "project",
      scopeId: projectId,
      path: "src/lore/loader.ts",
    });

    expect(content).toMatchObject({ kind: "text", lines: 1 });
    expect(content.kind === "text" && content.text).toBe("const a = 1;\n");
  });

  it("carries the revision the client will write against", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const input = {
      scopeType: "project",
      scopeId: projectId,
      path: "src/lore/loader.ts",
    } as const;

    const first = await ctx.api.files.read(input);
    const again = await ctx.api.files.read(input);
    writeFileSync(join(repo, "src", "lore", "loader.ts"), "const a = 2;\n");
    const changed = await ctx.api.files.read(input);

    expect(first.kind === "text" && first.revision).toEqual(expect.any(String));
    // Nothing happened between the two reads, so nothing may look stale later.
    expect(first.kind === "text" && first.revision).toBe(again.kind === "text" && again.revision);
    expect(changed.kind === "text" && changed.revision).not.toBe(
      first.kind === "text" && first.revision,
    );
  });

  it("says over the wire when a file is not editable, and why", async () => {
    const { context: ctx, projectId, repo } = await setup();
    writeFileSync(join(repo, "latin1.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));

    const content = await ctx.api.files.read({
      scopeType: "project",
      scopeId: projectId,
      path: "latin1.txt",
    });

    expect(content).toMatchObject({ kind: "text", readOnly: "not-utf8" });
  });

  it("reports a file that is not there", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(
      ctx.api.files.read({ scopeType: "project", scopeId: projectId, path: "nao-existe.ts" }),
    ).rejects.toThrow(/não existe no checkout/);
  });
});

describe("files.write", () => {
  it("writes the file and hands back the revision the next write is based on", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const target = { scopeType: "project", scopeId: projectId, path: "src/lore/loader.ts" } as const;
    const before = await ctx.api.files.read(target);
    if (before.kind !== "text") throw new Error(`a fixture veio como ${before.kind}`);

    const result = await ctx.api.files.write({
      ...target,
      text: "const a = 2;\n",
      baseRevision: before.revision,
    });

    if (!result.ok) throw new Error(`esperava gravar, veio ${result.reason}`);
    expect(readFileSync(join(repo, "src", "lore", "loader.ts"), "utf8")).toBe("const a = 2;\n");
    // The revision that comes back is the one a read would now give, which is
    // what lets autosave chain writes without a read in between.
    const after = await ctx.api.files.read(target);
    expect(after.kind === "text" && after.revision).toBe(result.revision);
  });

  it("answers a conflict as a result instead of throwing (D3.1)", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    const file = join(worktreePath, "loader.ts");
    writeFileSync(file, "const a = 1;\n");
    const target = { scopeType: "worktree", scopeId: worktreeId, path: "loader.ts" } as const;
    const read = await ctx.api.files.read(target);
    if (read.kind !== "text") throw new Error(`a fixture veio como ${read.kind}`);

    // The agent, writing beside the editor. Not simulated: this is the disk.
    writeFileSync(file, "const doAgente = 1;\n");
    const result = await ctx.api.files.write({
      ...target,
      text: "const meu = 1;\n",
      baseRevision: read.revision,
    });

    if (result.ok) throw new Error("a escrita passou por cima do agente");
    expect(result.reason).toBe("stale");
    // A number, not a Date: `initTRPC` runs without a transformer, so a Date
    // would reach the client as a string with the type still saying Date.
    expect(typeof result.changedAt).toBe("number");
    expect(result.changedAt).toBeGreaterThan(0);
    expect(readFileSync(file, "utf8")).toBe("const doAgente = 1;\n");
    // The disk's revision, so the "sobrescrever" of E10 needs no second read.
    const disk = await ctx.api.files.read(target);
    expect(disk.kind === "text" && disk.revision).toBe(result.revision);
  });

  it("lets a multibyte text past the schema and refuses it by bytes", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const target = { scopeType: "project", scopeId: projectId, path: "src/lore/loader.ts" } as const;
    const read = await ctx.api.files.read(target);
    if (read.kind !== "text") throw new Error(`a fixture veio como ${read.kind}`);
    // Three bytes in UTF-8, one unit in UTF-16. ASCII would prove nothing here:
    // the two counts agree on it, and the whole point is that they disagree.
    const text = "€".repeat(400_000);
    const bytes = Buffer.byteLength(text, "utf8");
    expect(text.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(bytes).toBeGreaterThan(MAX_FILE_BYTES);

    await expect(
      ctx.api.files.write({ ...target, text, baseRevision: read.revision }),
    ).rejects.toThrow(new RegExp(`${bytes} bytes`));
    expect(readFileSync(join(repo, "src", "lore", "loader.ts"), "utf8")).toBe("const a = 1;\n");
  });

  it("stops an absurd text at the schema, before the scope is even resolved", async () => {
    const { context: ctx } = await setup();

    const failure = await ctx.api.files
      .write({
        // Bogus on purpose: with the schema's ceiling gone this call reaches
        // `resolveScope` and comes back NOT_FOUND, which is how the assertion
        // below can tell that zod refused first.
        scopeType: "project",
        scopeId: "prj_que_nao_existe",
        path: "a.ts",
        text: "a".repeat(MAX_FILE_BYTES + 1),
        baseRevision: "0".repeat(64),
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TRPCError);
    expect((failure as TRPCError).code).toBe("BAD_REQUEST");
    expect(((failure as TRPCError).cause as ZodError).issues).toContainEqual(
      expect.objectContaining({ code: "too_big", path: ["text"], maximum: MAX_FILE_BYTES }),
    );
  });
});

describe("files.create", () => {
  it("creates in the scope's own checkout and nowhere else", async () => {
    const { context: ctx, repo, worktreeId, worktreePath } = await setup();
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.files.create({ ...scope, path: "notas", kind: "dir" });
    const created = await ctx.api.files.create({
      ...scope,
      path: "./notas//rascunho.md",
      kind: "file",
    });

    // Normalised by the guard, because the tree keys on this string.
    expect(created).toEqual({ path: "notas/rascunho.md" });
    expect(readFileSync(join(worktreePath, "notas", "rascunho.md"), "utf8")).toBe("");
    // The worktree is a different directory than the project, and a scope
    // resolved wrong would have landed here.
    expect(existsSync(join(repo, "notas"))).toBe(false);
  });

  it("refuses a name that is already taken instead of overwriting it", async () => {
    const { context: ctx, projectId, repo } = await setup();

    await expect(
      ctx.api.files.create({
        scopeType: "project",
        scopeId: projectId,
        path: "src/lore/loader.ts",
        kind: "file",
      }),
    ).rejects.toThrow(/já existe/);
    expect(readFileSync(join(repo, "src", "lore", "loader.ts"), "utf8")).toBe("const a = 1;\n");
  });

  it("refuses to create inside .git", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(
      ctx.api.files.create({
        scopeType: "project",
        scopeId: projectId,
        path: ".git/hooks/pre-commit",
        kind: "file",
      }),
    ).rejects.toThrow(/não é editável pelo Lumem/);
  });
});

describe("files.rename", () => {
  it("moves the entry and echoes the new path back", async () => {
    const { context: ctx, projectId, repo } = await setup();

    const moved = await ctx.api.files.rename({
      scopeType: "project",
      scopeId: projectId,
      from: "src/lore/loader.ts",
      to: "src/loader.ts",
    });

    expect(moved).toEqual({ path: "src/loader.ts" });
    expect(existsSync(join(repo, "src", "lore", "loader.ts"))).toBe(false);
    expect(readFileSync(join(repo, "src", "loader.ts"), "utf8")).toBe("const a = 1;\n");
  });

  it("guards the destination end too, not only the source", async () => {
    const { context: ctx, projectId, repo } = await setup();

    await expect(
      ctx.api.files.rename({
        scopeType: "project",
        scopeId: projectId,
        from: "src/lore/loader.ts",
        to: "../fora.ts",
      }),
    ).rejects.toThrow(/sai do checkout/);
    expect(existsSync(join(repo, "src", "lore", "loader.ts"))).toBe(true);
  });
});

describe("files.remove", () => {
  it("removes an entry from the scope's checkout", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    writeFileSync(join(worktreePath, "so-na-worktree.txt"), "x");

    await ctx.api.files.remove({
      scopeType: "worktree",
      scopeId: worktreeId,
      path: "so-na-worktree.txt",
    });

    expect(existsSync(join(worktreePath, "so-na-worktree.txt"))).toBe(false);
  });

  it("refuses a directory with content unless recursive, and says how much is inside", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const target = { scopeType: "project", scopeId: projectId, path: "src" } as const;

    await expect(ctx.api.files.remove(target)).rejects.toThrow(/1 entrada dentro/);
    expect(existsSync(join(repo, "src"))).toBe(true);

    await ctx.api.files.remove({ ...target, recursive: true });
    expect(existsSync(join(repo, "src"))).toBe(false);
  });

  it("refuses the checkout root, which the schema's floor alone would let through", async () => {
    const { context: ctx, projectId, repo } = await setup();

    // `.` passes `min(1)` and dies in the guard, which is where the rule lives:
    // the schema is a floor against a forgotten field, not a copy of §5.
    await expect(
      ctx.api.files.remove({ scopeType: "project", scopeId: projectId, path: "." }),
    ).rejects.toThrow(/a raiz do checkout não aceita escrita/);
    expect(existsSync(join(repo, ".git"))).toBe(true);
  });
});

describe("files.deletePreview", () => {
  it("says whether git has a copy, which is what the dialog promises", async () => {
    const { context: ctx, projectId } = await setup();
    const scope = { scopeType: "project", scopeId: projectId } as const;

    const tracked = await ctx.api.files.deletePreview({ ...scope, path: "README.md" });
    const untracked = await ctx.api.files.deletePreview({ ...scope, path: "src/lore/loader.ts" });

    expect(tracked).toEqual({ kind: "file", path: "README.md", tracked: true });
    expect(untracked).toEqual({ kind: "file", path: "src/lore/loader.ts", tracked: false });
  });

  it("counts a directory recursively, and changes nothing", async () => {
    const { context: ctx, projectId, repo } = await setup();

    const preview = await ctx.api.files.deletePreview({
      scopeType: "project",
      scopeId: projectId,
      path: "src",
    });

    expect(preview).toEqual({
      kind: "dir",
      path: "src",
      files: 1,
      dirs: 1,
      untracked: 1,
      truncated: false,
    });
    expect(existsSync(join(repo, "src", "lore", "loader.ts"))).toBe(true);
  });
});

describe("the write side's scope", () => {
  it("goes through resolveScope in every one of the five", async () => {
    const { context: ctx } = await setup();
    const scope = { scopeType: "worktree", scopeId: "wt_inexistente" } as const;
    // Named in full: `/não existe/` alone would also match the guard's "não
    // existe no checkout", and this test exists to prove the *scope* was
    // resolved before the guard ever saw a path.
    const refusal = /worktree wt_inexistente não existe/;

    await expect(
      ctx.api.files.write({ ...scope, path: "a.ts", text: "x", baseRevision: "r" }),
    ).rejects.toThrow(refusal);
    await expect(ctx.api.files.create({ ...scope, path: "a.ts", kind: "file" })).rejects.toThrow(
      refusal,
    );
    await expect(ctx.api.files.rename({ ...scope, from: "a.ts", to: "b.ts" })).rejects.toThrow(
      refusal,
    );
    await expect(ctx.api.files.remove({ ...scope, path: "a.ts" })).rejects.toThrow(refusal);
    await expect(ctx.api.files.deletePreview({ ...scope, path: "a.ts" })).rejects.toThrow(refusal);
  });

  it("reports a checkout that vanished from disk instead of an ENOENT", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;
    const refusal = /o checkout não está em/;

    await expect(
      ctx.api.files.write({ ...scope, path: "a.ts", text: "x", baseRevision: "r" }),
    ).rejects.toThrow(refusal);
    await expect(ctx.api.files.create({ ...scope, path: "a.ts", kind: "file" })).rejects.toThrow(
      refusal,
    );
    await expect(ctx.api.files.rename({ ...scope, from: "a.ts", to: "b.ts" })).rejects.toThrow(
      refusal,
    );
    await expect(ctx.api.files.remove({ ...scope, path: "a.ts" })).rejects.toThrow(refusal);
    await expect(ctx.api.files.deletePreview({ ...scope, path: "a.ts" })).rejects.toThrow(refusal);
  });
});
