import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";

import { memoryDirFor, repoRelative, type ScopeTarget } from "./paths.js";

describe("memoryDirFor", () => {
  it("cada escopo no seu lugar", () => {
    expect(memoryDirFor("/s", { scope: "global" })).toBe("/s/memory");
    expect(memoryDirFor("/s", { scope: "workspace", workspaceId: "ws" })).toBe("/s/workspaces/ws/memory");
    expect(memoryDirFor("/s", { scope: "project", workspaceId: "ws", projectId: "pj" })).toBe(
      "/s/workspaces/ws/projects/pj/memory",
    );
  });

  /**
   * O `switch` fecha porque `scope` chega de fora — flag de CLI, corpo de
   * requisição —, e o tipo não garante nada em tempo de execução. Sem o ramo
   * final, um escopo desconhecido saía daqui como `undefined` e morria adiante
   * num `TypeError` do `node:path`, que não diz ao operador o que ele errou.
   */
  it("escopo fora da taxonomia é erro de domínio, e não TypeError", () => {
    const invalido = { scope: "worktree" } as unknown as ScopeTarget;

    expect(() => memoryDirFor("/s", invalido)).toThrow(DomainError);
    expect(() => memoryDirFor("/s", invalido)).toThrow(/escopo inválido: worktree/);
  });

  it("exige o que cada escopo precisa", () => {
    expect(() => memoryDirFor("/s", { scope: "workspace" })).toThrow(/workspaceId é obrigatório/);
    expect(() => memoryDirFor("/s", { scope: "project", workspaceId: "ws" })).toThrow(
      /projectId é obrigatório/,
    );
  });

  it("id que é segmento de caminho não pode conter caminho", () => {
    expect(() => memoryDirFor("/s", { scope: "workspace", workspaceId: "../fora" })).toThrow(DomainError);
    expect(() => memoryDirFor("/s", { scope: "workspace", workspaceId: ".." })).toThrow(/inválido/);
    expect(() => memoryDirFor("/s", { scope: "workspace", workspaceId: "com/barra" })).toThrow(/inválido/);
  });
});

describe("repoRelative", () => {
  it("devolve caminho com barra, do jeito que o git fala", () => {
    // O git não entende `\` como separador: no Windows o `join` devolveria isso.
    expect(repoRelative("/s", "/s/memory/user_x.md")).toBe("memory/user_x.md");
  });

  it("recusa caminho fora do state dir", () => {
    expect(() => repoRelative("/s", "/outro/user_x.md")).toThrow(DomainError);
    expect(() => repoRelative("/s", "/outro/user_x.md")).toThrow(/fora do state dir/);
  });
});
