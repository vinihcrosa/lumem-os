import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A cor dos pontos da faixa de abas, conferida onde ela mora.
 *
 * Mesmo motivo do `conversation-css.test.ts`: o jsdom não aplica folha de
 * estilo, então um teste de componente vê a *classe* e nunca a cor. E aqui a
 * classe não é a promessa — a promessa é que dois significados que aparecem na
 * mesma faixa não usem o mesmo degrau. Um teste que só olha o nome da classe
 * passa feliz depois de alguém trocar as duas cores por uma.
 */

const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8");

function tokenOf(selector: string): string {
  const rule = new RegExp(`\\${selector}\\s*\\{[^}]*background:\\s*var\\((--[a-z0-9-]+)\\)`, "i");
  const found = css.match(rule);
  expect(found, `sem regra de background para ${selector}`).not.toBeNull();
  return found![1]!;
}

describe("os pontos da faixa de abas", () => {
  it("pinta sujeira com o token de sujeira, e não com o de sessão", () => {
    // Âmbar aqui, âmbar no chip da aba, âmbar na sidebar. O ponto da aba do
    // checkout é o único sinal que sobra quando outra aba está na frente, e
    // um sinal que muda de cor conforme a tela não é um sinal.
    expect(tokenOf(".tab-item__dot--dirty")).toBe("--color-worktree-dirty");
  });

  it("não deixa sujeira e sessão rodando com o mesmo degrau", () => {
    // As duas aparecem na mesma faixa, lado a lado: a aba do checkout e a de
    // uma conversa viva. Iguais, o olho lê uma coisa só.
    expect(tokenOf(".tab-item__dot--dirty")).not.toBe(tokenOf(".tab-item__dot"));
  });

  it("dá ao interruptor da faixa o alvo mínimo de 24px", () => {
    // WCAG 2.5.8, o mesmo piso do `✕` da aba. Ele é glifo sozinho: sem o alvo
    // em volta, o que sobra é um caractere de 16px para acertar.
    const block = css.match(/\.tab-toggle\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("width: var(--size-control-sm)");
    expect(block).toContain("height: var(--size-control-sm)");
  });
});
