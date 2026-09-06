import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte da barra da PR, nas duas direções.
 *
 * O mesmo raciocínio de `run-dock-css.test.ts` e `conversation-css.test.ts`: o
 * jsdom **não aplica folha de estilo**, então teste de componente não vê regra
 * faltando, e a promessa de que as classes vêm do protótipo com o mesmo nome
 * vale exatamente o que vale a coisa que confere.
 *
 * A terceira verificação é desta feature e não das outras: **nenhum literal**.
 * O CSS veio do Open Design, onde tudo é `var(--token)`; um hexadecimal ou um
 * `12px` aqui significa que alguém escolheu cor à mão deste lado — que é
 * exatamente o que a regra de design proíbe.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "pr-bar.css"), "utf8");

const read = (name: string): string => readFileSync(join(HERE, name), "utf8");

/** Os componentes desta feature: tudo o que eles pedem tem de estar no arquivo. */
const components = ["PrBar.tsx", "PrWriteDialog.tsx", "ChecksTab.tsx"].map(read).join("\n");

/**
 * A sidebar entra só na direção contrária.
 *
 * Ela é dona de dezenas de classes de `sidebar.css` e `run-dock.css`, então
 * exigir que este arquivo defina tudo o que ela pede seria exigir a coisa
 * errada. O que ela empresta daqui é o `prmark` — e é por isso que ela precisa
 * estar do outro lado, para o marcador não parecer CSS órfão.
 */
const consumers = [components, read("SidebarTree.tsx")].join("\n");

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
  "prbar--ready",
  "prbar--blocked",
  "prbar--pending",
  "prbar--merged",
  "prbar--none",
  "prbar__fresh--stale",
  "prmark--ready",
  "prmark--blocked",
  "prmark--pending",
  "prmark--merged",
  "prmark--draft",
  "prmark--closed",
  "rtab__count--bad",
  "rtab__count--run",
  "rtab__count--ok",
  "checks__row--ok",
  "checks__row--bad",
  "checks__row--run",
  "checks__row--skip",
];

/** Pintadas em outro lugar, e reusadas aqui de propósito. */
const BORROWED = new Set([
  // Primitivas compartilhadas, de `ui/ui.css`.
  "btn",
  "btn--sm",
  "btn--ghost",
  "focus-ring",
  "sr-only",
  // A faixa de abas e a coluna são do `right-panel.css`; daqui sai só o que a
  // quarta aba acrescenta.
  "rtab",
  "rtab__count",
]);

describe("toda classe que a barra da PR pede existe", () => {
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
    // O defeito oposto e mais silencioso: CSS portado para marcação que não
    // existe. É o que aconteceu com o rodapé de execução — o desenho tinha
    // `.hint` desde o S2, e o React não usava.
    const asked = new Set([...requested(consumers), ...INTERPOLATED]);
    // A coluna inteira, que este arquivo só decora com o `container`.
    const framework = new Set(["rp"]);

    const orphans = [...defined(stylesheet)].filter(
      (name) => !asked.has(name) && !framework.has(name),
    );

    expect(orphans).toEqual([]);
  });
});

describe("nenhum literal", () => {
  const css = stripComments(stylesheet);

  it("não tem cor escrita à mão", () => {
    // Token novo nasce no Open Design. Cor escolhida aqui não passa pela
    // verificação de contraste, que é justamente o que a `contrast.ts` existe
    // para impedir.
    const literals = [
      ...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...css.matchAll(/\b(?:rgba?|hsla?)\(/g),
    ];

    expect(literals.map((match) => match[0])).toEqual([]);
  });

  it("não tem medida escrita à mão fora das larguras de container", () => {
    // A exceção é a `@container`: a consulta compara com a largura real da
    // coluna, e uma largura de breakpoint não é um espaçamento — não existe
    // token para ela, e inventar um seria pior.
    const withoutQueries = css.replace(/@container[^{]*\{/g, "{");
    const measures = [...withoutQueries.matchAll(/(?<![\w-])\d+(?:\.\d+)?(px|rem|em)\b/g)];

    expect(measures.map((match) => match[0])).toEqual([]);
  });
});
