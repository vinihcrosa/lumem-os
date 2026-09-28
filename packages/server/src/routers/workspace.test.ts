import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { createAgentCatalog } from "../agents/catalog.js";
import { project } from "../db/schema.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { configForAdapter } from "../repositories/agentConfig.js";
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
     * A W6 da [tela do workspace](../../../../docs/features/010-workspace-screen/open-questions.md):
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

describe("workspace.setAutonomy", () => {
  it("nasce em `manual`, com o teto que a folha desenha", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "acme" });

    // A propriedade que a migração não pode quebrar: nenhum workspace acorda
    // andando sozinho.
    expect(created).toMatchObject({ autonomy: "manual", autonomyMaxParallel: 2 });
  });

  it("liga os dois de uma vez — ligar sem dizer quantas é ligar sem freio", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "acme" });

    const saved = await api.workspace.setAutonomy({
      id: created.id,
      autonomy: "autonomo",
      maxParallel: 3,
    });

    expect(saved).toMatchObject({ autonomy: "autonomo", autonomyMaxParallel: 3 });
  });

  it("`0` é escrevível — é como se pausa a esteira sem mexer em cada tarefa", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "acme" });

    const saved = await api.workspace.setAutonomy({
      id: created.id,
      autonomy: "autonomo",
      maxParallel: 0,
    });

    // Aqui não existe *sem teto*: a coluna é `NOT NULL`, e `0` quer dizer
    // bloqueia tudo — o mesmo vocabulário da Parte 3.
    expect(saved.autonomyMaxParallel).toBe(0);
  });

  it("teto negativo é recusado antes de chegar ao banco", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "acme" });

    await expect(
      api.workspace.setAutonomy({ id: created.id, autonomy: "manual", maxParallel: -1 }),
    ).rejects.toThrow();
  });
});

/*
 * O trio de cada encaixe da esteira, no nível do workspace (`034` T16, Q5).
 *
 * A tela de `/settings` lê o que o workspace diz para cada encaixe — ou o
 * default, com esse nome — e troca conta, modelo e effort de um encaixe só.
 */
describe("workspace.slots e workspace.setSlot", () => {
  it("sem nada configurado, os três encaixes são o default, herdando tudo", async () => {
    const { api } = caller();
    const created = await api.workspace.create({ name: "acme" });

    const slots = await api.workspace.slots({ id: created.id });

    expect(slots.map((slot) => slot.role)).toEqual(["implementador", "revisor", "testador"]);
    for (const slot of slots) {
      expect(slot).toMatchObject({
        from: "default",
        adapter: "claude",
        accountId: null,
        accountLabel: null,
        model: null,
        effort: null,
      });
    }
  });

  it("trocar só o revisor: ele vem do workspace com o trio novo, e os outros não mudam", async () => {
    const { api, db } = caller();
    const created = await api.workspace.create({ name: "acme" });
    const codex = await configForAdapter(db, "codex");
    const conta = await createAgentAccountRepository(db).create({
      agentConfigId: codex,
      label: "trabalho",
      configDir: "/contas/trabalho",
    });

    await api.workspace.setSlot({
      id: created.id,
      role: "revisor",
      adapter: "codex",
      accountId: conta.id,
      model: "gpt-5.5",
      effort: "high",
    });
    const slots = await api.workspace.slots({ id: created.id });

    expect(slots.find((slot) => slot.role === "revisor")).toMatchObject({
      from: "workspace",
      adapter: "codex",
      accountId: conta.id,
      accountLabel: "trabalho",
      model: "gpt-5.5",
      effort: "high",
    });
    expect(slots.find((slot) => slot.role === "implementador")).toMatchObject({ from: "default" });
  });

  it("trocar de novo reescreve o mesmo agente do encaixe, sem empilhar", async () => {
    const { api, db } = caller();
    const created = await api.workspace.create({ name: "acme" });

    await api.workspace.setSlot({ id: created.id, role: "revisor", adapter: "claude", accountId: null, model: "sonnet", effort: null });
    await api.workspace.setSlot({ id: created.id, role: "revisor", adapter: "claude", accountId: null, model: "haiku", effort: null });

    expect((await api.workspace.slots({ id: created.id }))[1]).toMatchObject({ from: "workspace", model: "haiku" });
    expect(await createAgentCatalog(db).listByWorkspace(created.id)).toHaveLength(1);
  });

  it("uma conta de outro agente é recusada, e nada muda", async () => {
    const { api, db } = caller();
    const created = await api.workspace.create({ name: "acme" });
    const codex = await configForAdapter(db, "codex");
    const conta = (await createAgentAccountRepository(db).defaultFor(codex))!;

    await expect(
      api.workspace.setSlot({ id: created.id, role: "revisor", adapter: "claude", accountId: conta.id, model: null, effort: null }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await api.workspace.slots({ id: created.id }))[1]).toMatchObject({ from: "default" });
  });
});
