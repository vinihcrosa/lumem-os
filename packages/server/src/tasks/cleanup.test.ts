import { describe, expect, it } from "vitest";

import { decideCleanup, type CleanupFacts } from "./cleanup.js";

/**
 * O `Done` que limpa (`028` Parte 4, T40 · Q27).
 *
 * Função pura, e é onde a Q27 mora inteira — os três casos que ela decidiu, e o
 * quarto que ela **não** decidiu e que a implementação teve que responder: o
 * interruptor não vale para branch não mesclada.
 */

const facts = (patch: Partial<CleanupFacts> = {}): CleanupFacts => ({
  clean: true,
  changedFiles: 0,
  merged: true,
  alwaysRemovesWhenMerged: false,
  ...patch,
});

describe("limpo e mesclado some sem perguntar", () => {
  it("não há nada a perder", () => {
    expect(decideCleanup(facts())).toMatchObject({ kind: "remove" });
  });
});

describe("sujo pergunta, e a frase diz o que se perde", () => {
  it("o número de arquivos está na frase", () => {
    /*
     * É a emenda inteira da Q27: um aviso que não nomeia o custo é um aviso que
     * se aprende a aceitar. *"3 arquivos não commitados"* é uma frase que faz
     * alguém parar; *"a worktree está suja"* não é.
     */
    expect(decideCleanup(facts({ clean: false, changedFiles: 3 }))).toEqual({
      kind: "keep",
      reason: "há 3 arquivos não commitados na worktree",
    });
  });

  it("um arquivo é singular — plural com um é a marca de uma frase montada", () => {
    expect(decideCleanup(facts({ clean: false, changedFiles: 1 })).reason).toBe(
      "há 1 arquivo não commitado na worktree",
    );
  });

  it("com o interruptor ligado, some — e o motivo diz o que foi descartado", () => {
    // Ligar é dizer *"pode apagar rascunho meu"*, e o motivo devolvido é o que
    // a tela mostra depois: o que sumiu, não um "ok".
    expect(
      decideCleanup(facts({ clean: false, changedFiles: 2, alwaysRemovesWhenMerged: true })),
    ).toEqual({ kind: "remove", reason: "mesclada — 2 arquivos não commitados descartados" });
  });
});

describe("não mesclada nunca some", () => {
  it("nem limpa", () => {
    /*
     * Um commit que só existe naquela branch é trabalho perdido do mesmo jeito
     * que um arquivo não commitado — e o checkout estar limpo não diz nada
     * sobre isso.
     */
    expect(decideCleanup(facts({ merged: false }))).toEqual({
      kind: "keep",
      reason: "a branch ainda não foi mesclada",
    });
  });

  it("nem com o interruptor ligado", () => {
    // O interruptor se chama *"PR **mesclada** sempre remove"*. Estendê-lo para
    // o não mesclado seria o produto fazendo mais do que a frase que você leu.
    expect(
      decideCleanup(facts({ merged: false, clean: false, changedFiles: 4, alwaysRemovesWhenMerged: true })),
    ).toMatchObject({ kind: "keep" });
  });

  it("e a frase soma os dois motivos quando os dois valem", () => {
    expect(decideCleanup(facts({ merged: false, clean: false, changedFiles: 4 })).reason).toBe(
      "a branch ainda não foi mesclada, e há 4 arquivos não commitados",
    );
  });
});
