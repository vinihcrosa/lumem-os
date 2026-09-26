import { describe, expect, it } from "vitest";

import { MEMORY_TYPES } from "./entry.js";
import { MEMORY_DIRECTIVE, memorySkill } from "./skill.js";

const context = {
  askUrl: "http://127.0.0.1:4317/memory/ask",
  sessionId: "ses_1",
  projects: ["lumem-os", "lorebase"],
};

describe("memorySkill", () => {
  it("é fixa: o tamanho não muda com o acervo", () => {
    // A propriedade que define a camada 2. Se um dia alguém enfiar aqui a lista
    // de memórias, este teste é o que vai reclamar — a skill não recebe acervo
    // nenhum como parâmetro, e é de propósito.
    const withProjects = memorySkill(context);
    const withoutProjects = memorySkill({ ...context, projects: [] });

    expect(withProjects.length - withoutProjects.length).toBeLessThan(80);
  });

  it("ensina a chamar, com a sessão que dá escopo e registra o uso", () => {
    const text = memorySkill(context);

    expect(text).toContain("curl");
    expect(text).toContain("http://127.0.0.1:4317/memory/ask");
    expect(text).toContain("session=ses_1");
  });

  it("cita os sete tipos e os três escopos — é o vocabulário das respostas", () => {
    const text = memorySkill(context);

    for (const type of MEMORY_TYPES) expect(text).toContain(type);
    expect(text).toContain("global → workspace → project");
  });

  it("carrega um mapa: os projetos do workspace, nunca nome de memória", () => {
    const text = memorySkill(context);

    expect(text).toContain("lumem-os, lorebase");
  });

  it("a diretiva é comportamento, e diz quando consultar é obrigatório", () => {
    // Ela vai no **núcleo**, não aqui: se a descoberta dependesse de a skill ser
    // lida, dependeria de a skill ser descoberta.
    expect(MEMORY_DIRECTIVE).toContain("obrigatório");
    expect(MEMORY_DIRECTIVE.split("\n")).toHaveLength(4);
  });
});

describe("o parágrafo das tarefas", () => {
  const tasks = { url: "http://127.0.0.1:4317/tasks", budget: 5 };

  it("não custa nada quando a porta não existe", () => {
    // A propriedade que o §F3 cobra: um parágrafo, e zero para quem não tem a
    // feature de pé.
    expect(memorySkill(context)).not.toContain("/tasks");
  });

  it("ensina a porta, o teto e a regra de escrever para cima", () => {
    const text = memorySkill({ ...context, tasks });

    expect(text).toContain("http://127.0.0.1:4317/tasks?session=ses_1");
    // O teto junto: sem ele, a recusa chega como surpresa no meio do trabalho.
    expect(text).toContain("5 por tarefa");
    // E a regra do §3.2, porque um agente que acha que criou trabalho no outro
    // projeto vai agir como se tivesse criado.
    expect(text).toContain("escrever para cima é");
    expect(text).toContain("`done` é de uma pessoa");
  });

  it("cabe num parágrafo — o custo é asserido em caracteres", () => {
    const grew = memorySkill({ ...context, tasks }).length - memorySkill(context).length;

    // O preâmbulo é lido em **todo primeiro turno de toda sessão**. Este número
    // existe para alguém ter que justificar quando ele mudar.
    expect(grew).toBeLessThan(700);
  });
});
