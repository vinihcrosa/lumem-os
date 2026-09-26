import { describe, expect, it } from "vitest";

import { branchNameForIssue, fromOf } from "./useOriginChoice.js";

/**
 * As duas funções puras do trilho de origem, sem DOM nenhum.
 *
 * Migrado de `CreateWorktreeDialog.test.tsx` (`033` T20): o diálogo antigo
 * saiu — `NewWorktreeComposerModal.tsx` é quem liga o trilho agora —, mas as
 * duas funções não mudaram uma linha, e o teste delas não devia depender de
 * qual componente as chama.
 */

describe("o nome derivado de uma issue", () => {
  it.each([
    [52, "worktree-from: cortar de uma issue", "52-worktree-from-cortar-de-uma-issue"],
    [7, "Acentuação é problema?", "7-acentuacao-e-problema"],
    [9, "   ", "9"],
  ])("issue #%s vira %s", (number, title, expected) => {
    expect(branchNameForIssue(number, title)).toBe(expected);
  });
});

describe("o pedido é derivado da aba aberta", () => {
  /**
   * A aba pode **sumir debaixo da escolha**: o host responde `no-auth` numa
   * releitura, as abas de host somem, o trilho passa a desenhar `default`
   * pressionado — e a escolha anterior continua na memória. Derivar do `kind`
   * cru mandava a origem da PR enquanto a tela dizia default.
   */
  it("não manda origem nenhuma quando a aba aberta não é a da escolha", () => {
    expect(fromOf("default", { kind: "pr", number: 19 })).toBeUndefined();
    expect(fromOf("branch", { kind: "issue", number: 52 })).toBeUndefined();
  });

  it("manda a escolha quando ela é da aba aberta", () => {
    expect(fromOf("pr", { kind: "pr", number: 19 })).toEqual({ kind: "pr", number: 19 });
  });

  it("`default` nunca viaja: ausente já quer dizer isso", () => {
    expect(fromOf("default", null)).toBeUndefined();
  });
});
