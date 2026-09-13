import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte do quadro, nas duas direções (`028` T8–T11).
 *
 * O mesmo raciocínio de `pr-bar-css.test.ts`: o jsdom **não aplica folha de
 * estilo**, então teste de componente não vê regra faltando, e a promessa de
 * que as classes vêm do protótipo com o mesmo nome vale exatamente o que vale
 * a coisa que confere.
 *
 * A direção contrária é a que este arquivo mais deve: o `board.css` é um
 * **recorte** do `lumem-board.css`, e recorte é onde sobra CSS de marcação que
 * não existe deste lado.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "board.css"), "utf8");

const read = (name: string): string => readFileSync(join(HERE, name), "utf8");

const components = ["Board.tsx", "TaskCard.tsx", "TaskSeal.tsx"].map(read).join("\n");

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function defined(css: string): Set<string> {
  const names = new Set<string>();
  for (const rule of stripComments(css).split("}")) {
    const selector = rule.split("{")[0] ?? "";
    for (const match of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) names.add(match[1]!);
  }
  return names;
}

function requested(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/className=(?:\{`|")([^`"]+)/g)) {
    const literalOnly = match[1]!.replace(/\$\{[^}]*\}?/g, " ");
    for (const raw of literalOnly.split(/\s+/)) {
      const name = raw.trim();
      if (name === "" || name.endsWith("--")) continue;
      names.add(name);
    }
  }
  return names;
}

/** Montadas por interpolação, então o nome nunca aparece literal. */
const INTERPOLATED = [
  "tcard--manual",
  "tcard--wait",
  "tcard--work",
  "tcard--blocked",
  "tcard--paused",
  "tcard--ghost",
  "tcard__cost--none",
  "col__stale--warn",
  "col__stale--over",
  "stale--warn",
  "stale--over",
];

/** Pintadas em outro lugar, e reusadas aqui de propósito. */
const BORROWED = new Set(["focus-ring", "glyph", "glyph--project"]);

describe("toda classe que o quadro pede existe", () => {
  const available = defined(stylesheet);

  it("define toda classe literal que os componentes usam", () => {
    const missing = [...requested(components)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("define toda classe que eles montam por interpolação", () => {
    expect(INTERPOLATED.filter((name) => !available.has(name))).toEqual([]);
  });
});

describe("a direção contrária: CSS que ninguém pede", () => {
  it("não define classe que nenhum componente usa", () => {
    // O defeito mais silencioso, e o que um recorte produz: CSS portado para
    // marcação que não existe deste lado. O rodapé de execução tinha `.hint`
    // desde o S2 e o React nunca o usou.
    const asked = new Set([...requested(components), ...INTERPOLATED]);

    const orphans = [...defined(stylesheet)].filter((name) => !asked.has(name));

    expect(orphans).toEqual([]);
  });
});

describe("nenhum literal", () => {
  const css = stripComments(stylesheet);

  it("não tem cor escrita à mão", () => {
    const literals = [
      ...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...css.matchAll(/\b(?:rgba?|hsla?)\(/g),
    ];

    expect(literals.map((match) => match[0])).toEqual([]);
  });

  it("não tem medida escrita à mão", () => {
    const measures = [...css.matchAll(/(?<![\w-])\d+(?:\.\d+)?(px|rem|em)\b/g)];

    expect(measures.map((match) => match[0])).toEqual([]);
  });

  it("a coluna e o trilho vêm do token, e não de um número", () => {
    // Os dois números medidos da feature. Escritos à mão aqui, eles deixariam
    // de ser o que o Open Design mediu e passariam a ser o que alguém digitou.
    expect(css).toContain("var(--size-board-col)");
    expect(css).toContain("var(--size-board-rail)");
  });
});
