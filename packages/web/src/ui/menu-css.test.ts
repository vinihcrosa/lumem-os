import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A dica do item de menu não pode estourar a linha dele.
 *
 * Conferido na folha e não no componente pelo motivo de sempre — o jsdom não
 * aplica CSS, então um teste de componente vê a *classe* e nunca a caixa. E aqui
 * a promessa não é a classe: é que **um item de menu recebe o clique que é dele**.
 *
 * O defeito que motivou isto foi medido em 2026-09-08. A dica carrega o comando de
 * um agente — um caminho absoluto, sem espaço para quebrar —, e quando o adaptador
 * passou a ser lançado da pasta do daemon ([ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md))
 * esse caminho ficou bem mais longo que o do PATH. Numa linha de altura fixa, uma
 * palavra única e comprida vira um `<span>` que sai da caixa e passa a interceptar
 * o clique do item vizinho: o e2e que escolhe um agente em `nova sessão` começou a
 * falhar em `intercepts pointer events` — e **passava rodando sozinho**, porque aí
 * o menu tinha um item só.
 *
 * Esse é o formato de defeito que só a suíte inteira pega, e a razão de a asserção
 * morar aqui em vez de virar um `waitFor` mais longo no spec.
 */

const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8");

function ruleOf(selector: string): string {
  const found = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  expect(found, `sem regra para ${selector}`).not.toBeNull();
  return found![1]!;
}

describe("a dica do item de menu", () => {
  it("trunca em vez de crescer, para não roubar o clique do vizinho", () => {
    const rule = ruleOf(".menu__hint");

    // As três juntas, e nenhuma sozinha resolve: sem `min-width: 0` o item flex
    // não deixa o filho encolher, e sem `overflow` o `text-overflow` não faz nada.
    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    // Sem isto, um caminho sem espaços não quebra e o `overflow` corta na altura
    // errada em vez de na largura.
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it("mantém a linha de altura fixa, que é o que o truncamento protege", () => {
    // Se o item deixar de ter altura fixa, um texto comprido passa a empurrar a
    // linha em vez de vazar — outro desenho, e este teste deixaria de descrever o
    // que protege. Ele falha para que a decisão seja tomada de novo, de propósito.
    expect(ruleOf(".menu__item")).toMatch(/height:\s*var\(--size-control-lg\)/);
  });
});
