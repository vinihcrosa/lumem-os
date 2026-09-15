import { DEFAULT_ADAPTER_ID, newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import { project, roleBinding, type NamedAgentRow } from "../db/schema.js";
import { createAgentCatalog, resolveFromBindings } from "./catalog.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O catálogo e a cascata (`028` §5.1, Parte 2 — T23).
 *
 * Dois arquivos de teste em um, de propósito: a **cascata** é pura e exercitada
 * sem banco, e o **catálogo** é I/O. A separação não é estética — ela é o que
 * permite provar *"o projeto ganha do workspace"* sem montar dois projetos.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

function fakeAgent(name: string, patch: Partial<NamedAgentRow> = {}): NamedAgentRow {
  return {
    id: newId(),
    workspaceId: "w1",
    name,
    adapter: "claude",
    model: null,
    instructions: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe("a cascata, sem banco", () => {
  it("a tarefa ganha do projeto, e o projeto do workspace", () => {
    const task = fakeAgent("revisor-da-tarefa");
    const projectAgent = fakeAgent("revisor-do-projeto");
    const workspaceAgent = fakeAgent("revisor-do-workspace");

    expect(
      resolveFromBindings({ task, project: projectAgent, workspace: workspaceAgent }).from,
    ).toBe("task");
    expect(resolveFromBindings({ project: projectAgent, workspace: workspaceAgent }).from).toBe(
      "project",
    );
    expect(resolveFromBindings({ workspace: workspaceAgent }).from).toBe("workspace");
  });

  it("ninguém configurou nada — o default responde, e ele tem nome", () => {
    const resolved = resolveFromBindings({});

    /*
     * O quarto degrau **não** está no banco, e é isso que este caso guarda:
     * guardar o default seria guardar a ausência — toda instalação nasceria com
     * três linhas repetindo o código, e mudar o default do produto deixaria de
     * mudar o comportamento de quem nunca configurou nada.
     */
    expect(resolved).toMatchObject({ agent: null, from: "default", adapter: DEFAULT_ADAPTER_ID });
  });

  it("um buraco no meio não interrompe a descida", () => {
    const workspaceAgent = fakeAgent("revisor-do-workspace");

    // Tarefa vazia, projeto vazio, workspace amarrado. Uma cadeia de `??` faria
    // o mesmo; o array é o que torna este caso escrevível sem reescrever a
    // função quando um quinto degrau aparecer.
    expect(resolveFromBindings({ workspace: workspaceAgent }).agent?.name).toBe(
      "revisor-do-workspace",
    );
  });

  it("o agente decide adaptador, modelo e instrução — não só o nome", () => {
    const agent = fakeAgent("revisor-severo", {
      adapter: "codex",
      model: "o3",
      instructions: "reprove por qualquer teste faltando",
    });

    expect(resolveFromBindings({ project: agent })).toMatchObject({
      adapter: "codex",
      model: "o3",
      instructions: "reprove por qualquer teste faltando",
    });
  });
});

async function scene() {
  context = createTestCaller();
  const { api, db } = context;
  const space = await api.workspace.create({ name: `acme-${newId()}` });

  async function withProject(name: string) {
    const projectId = newId();
    await db.insert(project).values({
      id: projectId,
      workspaceId: space.id,
      name,
      path: `/repos/${projectId}`,
      defaultBranch: "main",
    });
    const created = await api.task.create({
      workspaceId: space.id,
      projectId,
      title: `tarefa de ${name}`,
    });
    return { projectId, taskId: created.id };
  }

  return { api, db, workspaceId: space.id, withProject, catalog: createAgentCatalog(db) };
}

describe("o catálogo", () => {
  it("recusa um adaptador que não existe, e diz qual veio", async () => {
    const { catalog, workspaceId } = await scene();

    /*
     * Validado aqui e não por estrangeiro: o `ADAPTERS` é código do bundle, não
     * tabela. Sem esta checagem, um agente apontando para `gpt` seria aceito e
     * só falharia no `spawn`, longe de quem o criou.
     */
    await expect(
      catalog.create({ workspaceId, name: "revisor", adapter: "gpt" }),
    ).rejects.toThrow(/adaptador desconhecido: gpt/);
  });

  it("dois agentes com o mesmo nome no mesmo workspace não existem", async () => {
    const { catalog, workspaceId } = await scene();
    await catalog.create({ workspaceId, name: "revisor-severo", adapter: "claude" });

    // A cascata é escrita com nomes; dois iguais seriam dois agentes que ela
    // não consegue distinguir.
    await expect(
      catalog.create({ workspaceId, name: "revisor-severo", adapter: "codex" }),
    ).rejects.toThrow(/já existe um agente chamado/);
  });

  it("reamarrar substitui em vez de empilhar", async () => {
    const { catalog, workspaceId, withProject } = await scene();
    const { projectId, taskId } = await withProject("acme-api");
    const first = await catalog.create({ workspaceId, name: "revisor-a", adapter: "claude" });
    const second = await catalog.create({ workspaceId, name: "revisor-b", adapter: "claude" });

    await catalog.bind({ scopeType: "project", scopeId: projectId, role: "revisor", agentId: first.id });
    await catalog.bind({ scopeType: "project", scopeId: projectId, role: "revisor", agentId: second.id });

    // O índice único recusaria a segunda linha; tratá-la como erro obrigaria
    // quem chama a desamarrar antes — duas escritas para um gesto que é um.
    expect((await catalog.resolve({ taskId, role: "revisor" })).agent?.name).toBe("revisor-b");
  });
});

describe("a cascata, contra o banco", () => {
  it("dois projetos do mesmo workspace têm revisores diferentes", async () => {
    const { catalog, workspaceId, withProject } = await scene();
    const api = await withProject("acme-api");
    const web = await withProject("acme-web");
    const severe = await catalog.create({ workspaceId, name: "revisor-severo", adapter: "claude" });
    const quick = await catalog.create({ workspaceId, name: "revisor-rapido", adapter: "claude" });

    await catalog.bind({
      scopeType: "project",
      scopeId: api.projectId,
      role: "revisor",
      agentId: severe.id,
    });
    await catalog.bind({
      scopeType: "project",
      scopeId: web.projectId,
      role: "revisor",
      agentId: quick.id,
    });

    // É a frase do §5.1 virando asserção: *"um `revisor-severo` no `acme-api` e
    // um `revisor-rapido` no `acme-web` são configuração, não código"*.
    expect((await catalog.resolve({ taskId: api.taskId, role: "revisor" })).agent?.name).toBe(
      "revisor-severo",
    );
    expect((await catalog.resolve({ taskId: web.taskId, role: "revisor" })).agent?.name).toBe(
      "revisor-rapido",
    );
  });

  it("a tarefa ganha do projeto, que ganha do workspace", async () => {
    const { catalog, workspaceId, withProject } = await scene();
    const { projectId, taskId } = await withProject("acme-api");
    const ofWorkspace = await catalog.create({ workspaceId, name: "do-workspace", adapter: "claude" });
    const ofProject = await catalog.create({ workspaceId, name: "do-projeto", adapter: "claude" });
    const ofTask = await catalog.create({ workspaceId, name: "da-tarefa", adapter: "claude" });

    await catalog.bind({
      scopeType: "workspace",
      scopeId: workspaceId,
      role: "implementador",
      agentId: ofWorkspace.id,
    });
    expect((await catalog.resolve({ taskId, role: "implementador" })).from).toBe("workspace");

    await catalog.bind({
      scopeType: "project",
      scopeId: projectId,
      role: "implementador",
      agentId: ofProject.id,
    });
    expect((await catalog.resolve({ taskId, role: "implementador" })).from).toBe("project");

    await catalog.bind({
      scopeType: "task",
      scopeId: taskId,
      role: "implementador",
      agentId: ofTask.id,
    });
    expect((await catalog.resolve({ taskId, role: "implementador" })).from).toBe("task");
  });

  it("amarrar um papel não amarra os outros dois", async () => {
    const { catalog, workspaceId, withProject } = await scene();
    const { projectId, taskId } = await withProject("acme-api");
    const agent = await catalog.create({ workspaceId, name: "revisor-severo", adapter: "codex" });
    await catalog.bind({
      scopeType: "project",
      scopeId: projectId,
      role: "revisor",
      agentId: agent.id,
    });

    expect((await catalog.resolve({ taskId, role: "revisor" })).from).toBe("project");
    // Os três encaixes são independentes: configurar o revisor não escolhe o
    // implementador por tabela.
    expect((await catalog.resolve({ taskId, role: "implementador" })).from).toBe("default");
  });

  it("desamarrar devolve o degrau de baixo, e não o default", async () => {
    const { catalog, workspaceId, withProject } = await scene();
    const { projectId, taskId } = await withProject("acme-api");
    const ofWorkspace = await catalog.create({ workspaceId, name: "do-workspace", adapter: "claude" });
    const ofProject = await catalog.create({ workspaceId, name: "do-projeto", adapter: "claude" });
    await catalog.bind({
      scopeType: "workspace",
      scopeId: workspaceId,
      role: "testador",
      agentId: ofWorkspace.id,
    });
    await catalog.bind({
      scopeType: "project",
      scopeId: projectId,
      role: "testador",
      agentId: ofProject.id,
    });

    await catalog.unbind({ scopeType: "project", scopeId: projectId, role: "testador" });

    expect((await catalog.resolve({ taskId, role: "testador" })).from).toBe("workspace");
  });

  it("uma amarração de outro workspace não vaza para esta tarefa", async () => {
    const { catalog, withProject } = await scene();
    const { taskId } = await withProject("acme-api");
    const other = await scene();
    const stranger = await other.catalog.create({
      workspaceId: other.workspaceId,
      name: "intruso",
      adapter: "claude",
    });
    await other.catalog.bind({
      scopeType: "workspace",
      scopeId: other.workspaceId,
      role: "revisor",
      agentId: stranger.id,
    });

    // A consulta casa por **par** (tipo, id), e não por id solto: sem isso uma
    // linha de outro escopo entraria no degrau errado.
    expect((await catalog.resolve({ taskId, role: "revisor" })).from).toBe("default");
  });

  it("uma linha com o tipo errado não entra pelo id — o par decide", async () => {
    const { catalog, db, workspaceId, withProject } = await scene();
    const { projectId, taskId } = await withProject("acme-api");
    const ofProject = await catalog.create({ workspaceId, name: "do-projeto", adapter: "claude" });
    const impostor = await catalog.create({ workspaceId, name: "impostor", adapter: "codex" });
    await catalog.bind({
      scopeType: "project",
      scopeId: projectId,
      role: "revisor",
      agentId: ofProject.id,
    });

    /*
     * Escrito direto no banco, porque o `bind` não constrói isto: uma linha
     * `scope_type = 'task'` apontando para o **id do projeto**.
     *
     * Parece impossível — os ids são `randomUUID` —, e *"é improvável"* não é
     * uma propriedade que o schema garanta. Uma consulta que casasse só pelo id
     * poria esta linha no degrau da tarefa, que é o mais alto, e o agente errado
     * abriria a sessão. Este caso existe porque a mutação que trocava o par por
     * um `inArray` de ids **passava** sem ele.
     */
    await db
      .insert(roleBinding)
      .values({
        id: newId(),
        scopeType: "task",
        scopeId: projectId,
        role: "revisor",
        agentId: impostor.id,
      });

    const resolved = await catalog.resolve({ taskId, role: "revisor" });
    expect(resolved).toMatchObject({ from: "project" });
    expect(resolved.agent?.name).toBe("do-projeto");
  });

  it("tarefa que não existe é NOT_FOUND, e não um default silencioso", async () => {
    const { catalog } = await scene();

    // O caminho perigoso: devolver o default para um id errado esconderia o
    // erro, e a esteira abriria sessão para uma tarefa que não está lá.
    await expect(catalog.resolve({ taskId: "nao-existe", role: "revisor" })).rejects.toThrow(
      /não existe/,
    );
  });
});
