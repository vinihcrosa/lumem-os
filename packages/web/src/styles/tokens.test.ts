import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Importado, não lido por caminho: um teste que só faz `readFileSync` é invisível
// para o `vitest --changed`, então editar o arquivo não re-rodaria a guarda que existe
// para vigiá-lo. Importar põe a aresta no grafo de módulos que o `--changed` percorre.
//
// `tokens.css` é a exceção, e é do vitest: com `css: false` — o padrão, e o que todo
// outro teste aqui quer — um import de `.css` resolve para string vazia, mesmo com
// `?raw`. Então o conteúdo vem do disco e a *dependência* é declarada importando o
// arquivo pelo efeito colateral.
import "./tokens.css";

import { tokensTsFromCss } from "../../scripts/tokens-from-css.js";
import { CONTRAST_PAIRS, checkContrast, checkNeutralLadder, contrastRatio } from "./contrast.js";
import { color } from "./tokens.js";

/**
 * A paleta, sem Python.
 *
 * Antes disto o `generate-tokens.py` **gerava** `tokens.css` e conferia contraste na
 * geração. O design passou a ser feito inteiramente no Open Design
 * ([decisão](../../../../docs/project/design-source-of-truth.md)), então `tokens.css`
 * chega de lá pelo `design:sync` e não é mais gerado por ninguém.
 *
 * O que sai do gerador é a geração. O que **fica** é a verificação, e ela fica porque
 * passou a valer mais: cor escolhida à mão numa ferramenta de design é exatamente o
 * caso que precisa de alguém conferindo contraste. Antes a conta rodava na geração;
 * agora roda aqui, que é onde ela vira gate.
 */

const CSS = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

describe("contraste", () => {
  it("aprova todo par declarado", () => {
    const failures = checkContrast().filter((result) => !result.ok);

    // A mensagem é o teste: "um par reprovou" não diz qual combinação da tela quebrou.
    expect(
      failures.map((f) => `${f.label}: ${f.ratio.toFixed(2)}:1, mínimo ${f.min}`),
    ).toEqual([]);
  });

  it("mede pelo menos 59 pares", () => {
    // Piso, não número exato: acrescentar par não pode falhar isto, e **apagar** par
    // para calar uma reprovação tem de falhar.
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(59);
  });

  it("aponta só para token que existe", () => {
    // Par apontando para nome que sumiu é a lista envelhecendo em silêncio — e o
    // `checkContrast` reprova esse caso, então este teste é o que separa "reprovou por
    // contraste" de "reprovou porque o token não existe".
    const known = new Set(Object.keys(color));
    const dangling = CONTRAST_PAIRS.flatMap((pair) =>
      [pair.fg, pair.bg].filter((token) => !known.has(token)),
    );

    expect(dangling).toEqual([]);
  });

  it("calcula a razão como a WCAG define", () => {
    // Âncoras conhecidas: se a conta derivar, tudo acima reprova ou aprova errado sem
    // nenhum sinal.
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("mantém a escada de cinzas monótona", () => {
    // Número maior é sempre mais escuro. Quebrar isso envenena tudo o que escolhe
    // degrau confiando na ordem — que é toda superfície e toda borda.
    expect(checkNeutralLadder()).toEqual([]);
  });
});

describe("tokens.ts", () => {
  it("é exatamente o que a derivação produz do tokens.css", () => {
    /*
     * A guarda que substituiu a comparação byte a byte com o gerador.
     *
     * Ela pega as duas coisas que quebram este arquivo: alguém editar o derivado à mão,
     * e alguém sincronizar o `tokens.css` sem rodar a derivação. Nos dois casos o
     * JavaScript passa a acreditar numa paleta que o CSS não tem — e a tela fica certa
     * enquanto o tema do xterm e do CodeMirror ficam errados, que é o tipo de
     * divergência que ninguém vê olhando.
     */
    const committed = readFileSync(join(import.meta.dirname, "tokens.ts"), "utf8");

    expect(tokensTsFromCss(CSS)).toBe(committed);
  });

  it("declara toda cor de editor que o tema do CodeMirror lê por nome", () => {
    // `codemirror-setup.ts` lê estas de `tokens.ts`. São derivadas, então a guarda de
    // que continuam existindo mora junto da derivação.
    for (const name of [
      "editor/cursor",
      "editor/selection",
      "editor/active-line",
      "editor/line-number",
      "editor/line-number-active",
      "editor/readonly",
    ] as const) {
      expect(color[name], `${name} sumiu de tokens.ts`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
