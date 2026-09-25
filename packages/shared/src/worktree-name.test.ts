import { describe, expect, it } from "vitest";

import { WORKTREE_NAME_FALLBACK, worktreeNameFromPrompt } from "./worktree-name.js";

describe("worktreeNameFromPrompt", () => {
  it("as seis primeiras palavras, em minúsculas e sem pontuação", () => {
    expect(worktreeNameFromPrompt("Corrigir o bug do login no Safari!")).toBe(
      "corrigir-o-bug-do-login-no",
    );
  });

  it("tira o acento em vez de tirar a letra", () => {
    // `ação` virando `a-o` seria um nome que ninguém reconhece como seu.
    expect(worktreeNameFromPrompt("Migração da configuração")).toBe("migracao-da-configuracao");
  });

  it("guarda os dígitos e junta o que a pontuação separava", () => {
    expect(worktreeNameFromPrompt("Fix #123 — no  parser")).toBe("fix-123-no-parser");
  });

  it("menos de seis palavras: todas", () => {
    expect(worktreeNameFromPrompt("refatorar")).toBe("refatorar");
  });

  it("não passa de 48 caracteres, e não termina em hífen", () => {
    const name = worktreeNameFromPrompt(
      "internacionalização desproporcionalmente inconstitucionalíssima otorrinolaringologista",
    );

    expect(name.length).toBeLessThanOrEqual(48);
    expect(name).toBe("internacionalizacao-desproporcionalmente-inconst");
    expect(worktreeNameFromPrompt(`${"a".repeat(47)} b`)).toBe("a".repeat(47));
  });

  it.each([
    ["só pontuação", "!!! ???"],
    ["só espaço", "   "],
    ["só emoji", "🚀🔥"],
  ])("sem nenhuma letra aproveitável (%s): o nome de sempre", (_label, prompt) => {
    expect(worktreeNameFromPrompt(prompt)).toBe(WORKTREE_NAME_FALLBACK);
    expect(WORKTREE_NAME_FALLBACK).toBe("worktree");
  });
});
