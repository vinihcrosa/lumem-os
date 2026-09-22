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
import {
  CONTRAST_PAIRS,
  DISTINCTION_SETS,
  checkContrast,
  checkDistinction,
  checkNeutralLadder,
  contrastRatio,
} from "./contrast.js";
import { color, primitives } from "./tokens.js";

/**
 * A paleta, sem Python.
 *
 * Antes disto o `generate-tokens.py` **gerava** `tokens.css` e conferia contraste na
 * geração. Depois o desenho foi para o Open Design e `tokens.css` passou a **chegar**
 * de lá por cópia. Hoje ele é original, editado aqui
 * ([ADR](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)), e não é
 * gerado por ninguém.
 *
 * O que sai do gerador é a geração. O que **fica** é a verificação, e ela fica porque
 * passou a valer mais: cor escolhida à mão é exatamente o
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

  it("mede pelo menos 122 pares", () => {
    // Piso, não número exato: acrescentar par não pode falhar isto, e **apagar** par
    // para calar uma reprovação tem de falhar.
    //
    // O piso tem de acompanhar a lista. Ele ficou em `59` enquanto o array
    // crescia para `107`, e a barra da PR o levou para `71` (59+12) — o que
    // deixava **quarenta e oito** pares apagáveis em silêncio. Quem acrescentar
    // par sobe este número junto; é uma linha, e é o que faz a guarda existir.
    //
    // E foi encontrado **três atrás** outra vez, em 2026-09-22, enquanto se media
    // outra coisa: o array estava em `122` e o piso em `119`. Não custa repetir o
    // que a folga significa — três pares apagáveis sem nada falhar.
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(122);
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

describe("distinção", () => {
  /*
   * A pergunta que faltava.
   *
   * `contraste` mede cor contra FUNDO — "dá pra ler?". Isto mede cor contra a cor AO
   * LADO — "dá pra diferenciar?". São perguntas diferentes, e o repositório só tinha
   * gate para a primeira: em 2026-09-22 a suíte inteira ficou verde enquanto o quadro
   * pintava `● implementando` e `● bloqueada` quase na mesma cor. Os dois passavam no
   * contraste com folga, cada um contra o seu fundo.
   */

  it("mantém distinguível todo conjunto que divide tela", () => {
    // A mensagem é o teste: "um conjunto reprovou" não diz quais duas cores encostaram.
    expect(checkDistinction()).toEqual([]);
  });

  it("reprova duas cores que encostam — o defeito de 2026-09-22", () => {
    /*
     * A prova de que a guarda acima checa alguma coisa.
     *
     * Um gate que nasce verde é indistinguível de um gate que não checa nada, então
     * esta é a mesma checagem ficando VERMELHA de propósito — e o caso não é
     * inventado: `bg/brand` e `text/danger` são os dois tokens reais que, no dia em
     * que a marca virou laranja, o quadro pintou lado a lado significando
     * "trabalhando" e "bloqueada".
     */
    const problems = checkDistinction([
      { label: "selo trabalhando x selo bloqueada", tokens: ["bg/brand", "text/danger"] },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("bg/brand");
    expect(problems[0]).toContain("text/danger");
    expect(problems[0]).toContain("25°");
  });

  it("não compara matiz de cinza, porque matiz de cinza não significa nada", () => {
    // Dois cinzas têm matiz arbitrário e ficariam a ~0° um do outro — o que
    // reprovaria todo conjunto que tem um token neutro. Quem os separa é a
    // claridade, e disso `CONTRAST_PAIRS` já cuida. Sem esta regra o gate seria
    // ruído, e gate ruidoso é gate desligado.
    expect(checkDistinction([
      { label: "dois cinzas", tokens: ["text/secondary", "text/tertiary"] },
    ])).toEqual([]);
  });

  it("acusa conjunto que aponta para token que sumiu", () => {
    // Conjunto apontando para nome que não existe é a lista envelhecendo em silêncio:
    // o token sai do `tokens.css`, a comparação deixa de acontecer, e nada falha.
    expect(checkDistinction([
      { label: "conjunto velho", tokens: ["text/nao-existe-mais"] },
    ])).toEqual(["conjunto velho: text/nao-existe-mais não existe em tokens.ts"]);
  });

  it("mede pelo menos 9 conjuntos", () => {
    // Piso, não número exato — a mesma razão do piso de `CONTRAST_PAIRS`: acrescentar
    // conjunto não pode falhar isto, e apagar conjunto para calar uma reprovação tem
    // de falhar.
    expect(DISTINCTION_SETS.length).toBeGreaterThanOrEqual(9);
  });
});

describe("a marca é escassa", () => {
  it("só pinta CTA, foco e superfície de marca", () => {
    /*
     * A regra é do template do Cursor — "Cursor Orange is reserved for primary CTAs
     * and the wordmark. Used scarcely." — e no Lumem ela deixou de ser estilo: é o
     * que impede a laranja de voltar a ser cor de ESTADO e reencostar no vermelho.
     *
     * A identidade do agente mora na família `agent`. Quem escrever
     * `--color-turn-thought: var(--brand-400)` recria a colisão de 2026-09-22, e sem
     * esta guarda nada falharia — o `checkDistinction` só olha os conjuntos que
     * alguém lembrou de declarar.
     *
     * Lista que só ENCOLHE. Acrescentar nome aqui é decisão, não manutenção.
     */
    const brandRamp = new Set<string>(Object.values(primitives.brand));
    const usingBrand = Object.entries(color)
      .filter(([, hex]) => brandRamp.has(hex))
      .map(([token]) => token)
      .sort();

    expect(usingBrand).toEqual([
      "bg/brand",
      "bg/brand-hover",
      "bg/brand-muted",
      "bg/brand-subtle",
      "border/brand",
      "border/focus",
      "text/brand",
    ]);
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
