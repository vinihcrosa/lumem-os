import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project } from "../db/schema.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

describe("workspace.create", () => {
  it("creates and returns the workspace", async () => {
    const { api } = caller();

    const created = await api.workspace.create({ name: "pessoal" });

    expect(created.name).toBe("pessoal");
    expect(await api.workspace.list()).toHaveLength(1);
  });

  it("trims the name", async () => {
    // " pessoal" and "pessoal" are the same workspace to a person and two
    // different rows to SQLite.
    const { api } = caller();

    const created = await api.workspace.create({ name: "  pessoal  " });

    expect(created.name).toBe("pessoal");
  });

  it.each(["", "   ", "\t\n"])("refuses the blank name %j", async (name) => {
    const { api } = caller();

    await expect(api.workspace.create({ name })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a name longer than the cap", async () => {
    const { api } = caller();

    await expect(api.workspace.create({ name: "x".repeat(81) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("turns a duplicate name into a conflict, not a crash", async () => {
    const { api } = caller();
    await api.workspace.create({ name: "pessoal" });

    const failure = api.workspace.create({ name: "pessoal" });

    // 409, not 400: the request was well formed and the state refused it.
    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/já existe um workspace chamado "pessoal"/);
  });
});

describe("workspace.list", () => {
  it("is empty on a fresh install", async () => {
    const { api } = caller();

    expect(await api.workspace.list()).toEqual([]);
  });

  it("returns them sorted by name", async () => {
    const { api } = caller();
    await api.workspace.create({ name: "trabalho" });
    await api.workspace.create({ name: "aberto" });

    expect((await api.workspace.list()).map((row) => row.name)).toEqual(["aberto", "trabalho"]);
  });
});

describe("workspace.get", () => {
  it("returns null instead of failing for an unknown id", async () => {
    // The client polls this after a workspace may have been removed elsewhere;
    // a 404 there would show an error banner for an ordinary state.
    const { api } = caller();

    expect(await api.workspace.get({ id: "nope" })).toBeNull();
  });
});

describe("workspace.rename", () => {
  it("renames", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "pessoal" });

    expect(await api.workspace.rename({ id: created.id, name: "particular" })).toMatchObject({
      name: "particular",
    });
  });

  it("reports an unknown workspace as not found", async () => {
    const { api } = caller();

    await expect(api.workspace.rename({ id: "nope", name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("não mexe em disco: a memória do workspace continua sendo achada", async () => {
    /*
     * A W6 da [tela do workspace](../../../../docs/prd/workspace-screen/open-questions.md):
     * renomear é uma coluna, e nada mais.
     *
     * O caminho da memória é `workspaces/<id>/`, por **id** — então o nome pode
     * mudar à vontade. O oposto valeria para o **projeto**, cujo `id` está no
     * `.lumem` do repositório, e é por isso que isto é teste em vez de comentário.
     */
    const { api } = caller();
    const created = await api.workspace.create({ name: "pessoal" });
    const written = await api.memory.write({
      name: "Release deste workspace",
      description: "tag assinada, sempre",
      body: "Release sai de tag assinada.",
      type: "process",
      scope: "workspace",
      workspaceId: created.id,
      actor: "human",
    });

    await api.workspace.rename({ id: created.id, name: "particular" });

    // O mesmo caminho, achado pela mesma identidade.
    const read = await api.memory.read({
      type: "process",
      name: "Release deste workspace",
      scope: "workspace",
      workspaceId: created.id,
    });
    expect(read.body).toContain("tag assinada");
    expect(written.path).toContain(`workspaces/${created.id}/`);
    // E o nome novo não aparece em caminho nenhum: se aparecesse, renomear
    // significaria mover diretório.
    expect(written.path).not.toContain("particular");
    // `await` no `resolves`: sem ele a asserção vira promessa que ninguém espera,
    // e o teste passa mesmo quando ela falharia.
    await expect(api.memory.list({ workspaceId: created.id })).resolves.toMatchObject({
      entries: [{ name: "Release deste workspace" }],
    });
  });

  it("reports a name collision as a conflict", async () => {
    const { api } = caller();
    await api.workspace.create({ name: "pessoal" });
    const other = await api.workspace.create({ name: "trabalho" });

    await expect(api.workspace.rename({ id: other.id, name: "pessoal" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("workspace.remove", () => {
  it("removes an empty workspace", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "pessoal" });

    await api.workspace.remove({ id: created.id });

    expect(await api.workspace.list()).toEqual([]);
  });

  it("refuses while the workspace still has projects, saying why", async () => {
    const { api, db } = caller();
    const created = await api.workspace.create({ name: "pessoal" });
    await db.insert(project).values({
      id: newId(),
      workspaceId: created.id,
      name: "lorebase",
      path: "/repos/lorebase",
      defaultBranch: "main",
    });

    const failure = api.workspace.remove({ id: created.id });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/ainda tem projetos/);
  });

  it("reports an unknown workspace as not found", async () => {
    const { api } = caller();

    await expect(api.workspace.remove({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
