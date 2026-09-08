import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte do modal, nas duas direções.
 *
 * O mesmo raciocínio de `pr-bar-css.test.ts` e `run-dock-css.test.ts`: o jsdom
 * **não aplica folha de estilo**, então teste de componente não vê regra
 * faltando, e a promessa de que as classes vêm do protótipo com o mesmo nome
 * vale exatamente o que vale a coisa que confere.
 *
 * E este arquivo é o caso em que mais importa: o `Modal` é a peça que os dois
 * diálogos da árvore herdam, e uma regra faltando aqui não quebra um lugar,
 * quebra os dois — sem erro nenhum no console.
 */

const UI = import.meta.dirname;
const COMPONENTS = join(UI, "..", "components");

const stylesheet = readFileSync(join(UI, "modal.css"), "utf8");

/**
 * As folhas de tela que os diálogos trazem consigo.
 *
 * Um diálogo pode ter corpo próprio — o bloco de origem da
 * [`026-worktree-from`](../../../../docs/features/026-worktree-from/prd.md) é o
 * primeiro —, e esse corpo não é do `Modal`: ele é da tela que o `Modal`
 * hospeda. A auditoria continua exigindo que **toda** classe exista, e passa a
 * saber onde procurar. A alternativa era listar cada uma como emprestada, que é
 * o mesmo que parar de conferi-las.
 */
const screenSheets = ["create-worktree.css"]
  .map((name) => readFileSync(join(COMPONENTS, name), "utf8"))
  .join("\n");

/** Quem desenha as classes deste arquivo. */
const consumers = ["Modal.tsx"]
  .map((name) => readFileSync(join(UI, name), "utf8"))
  .concat(
    ["AddProjectDialog.tsx", "CreateWorktreeDialog.tsx", "CloneStatus.tsx"].map((name) =>
      readFileSync(join(COMPONENTS, name), "utf8"),
    ),
  )
  .join("\n");

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

/** Montadas por ternário, então o nome nunca aparece num `className="…"`. */
const INTERPOLATED = ["modal__esc", "modal__esc--held"];

/**
 * Desenhadas por outro componente, e alcançadas daqui por seletor descendente.
 *
 * `.modal__where .glyph` encolhe o glifo do cabeçalho. O `Glyph` é quem escreve
 * a classe, e exigir que ele apareça num `className` literal deste conjunto
 * seria exigir a coisa errada.
 */
const DESCENDANTS = new Set(["glyph"]);

/** Pintadas em outro lugar, e reusadas aqui de propósito. */
const BORROWED = new Set([
  // Primitivas compartilhadas, de `ui/ui.css`.
  "kbd",
  "glyph",
  // O segmentado, que já existia na aba de mudanças e na tela do workspace. O
  // trilho de origem usa o mesmo, e é isso que faz "de onde cortar" parecer o
  // resto do produto em vez de um controle novo.
  "seg__btn",
  // O clone: a barra e os desfechos continuam em `components/clone.css`, que é
  // de onde eles vieram. Só a geometria da linha subiu para cá.
  "bar",
  "bar--unknown",
  "bar__fill",
  "add-project",
  "add-project__answer",
  "add-project__answer-label",
  "add-project__answer-path",
  "echo",
  "echo__arrow",
  "echo--refused",
  "clone-outcome",
  "clone-outcome--done",
  "clone-outcome--failed",
  "clone-outcome__title",
  "clone-outcome__body",
  "clone-outcome__ways",
  "clone-outcome__git",
  "clone-outcome__actions",
  "clone-outcome__path",
  "create-worktree__hint",
]);

describe("toda classe que o modal pede existe", () => {
  it("define toda classe literal que os componentes usam", () => {
    const available = new Set([...defined(stylesheet), ...defined(screenSheets)]);
    const missing = [...requested(consumers)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("define toda classe que ele monta por ternário", () => {
    const available = defined(stylesheet);
    expect(INTERPOLATED.filter((name) => !available.has(name))).toEqual([]);
  });
});

describe("a direção contrária: CSS que ninguém pede", () => {
  it("não define classe que nenhum componente usa", () => {
    // O defeito oposto e mais silencioso: CSS portado para marcação que não
    // existe. Foi o que aconteceu com o rodapé de execução — o desenho tinha
    // `.hint` desde o S2, e o React nunca usou.
    const asked = new Set([...requested(consumers), ...INTERPOLATED]);
    const orphans = [...defined(stylesheet)].filter(
      (name) => !asked.has(name) && !DESCENDANTS.has(name),
    );

    expect(orphans).toEqual([]);
  });
});

describe("nenhum literal", () => {
  const css = stripComments(stylesheet);

  it("não tem cor escrita à mão", () => {
    // Token novo nasce no Open Design. Cor escolhida aqui não passa pela
    // verificação de contraste, que é o que a `contrast.ts` existe para impedir.
    const literals = [
      ...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...css.matchAll(/\b(?:rgba?|hsla?)\(/g),
    ];

    expect(literals.map((match) => match[0])).toEqual([]);
  });

  it("não tem medida escrita à mão fora do fio de borda", () => {
    // A exceção é `1px` de borda, que é o estilo da casa em todo o repositório:
    // não existe token de espessura de fio, e inventar um aqui — num arquivo
    // que é cópia derivada do Open Design — seria criar uma segunda verdade.
    const withoutHairlines = css.replace(/(?<=border[a-z-]*:\s*)1px\b/g, "");
    const measures = [...withoutHairlines.matchAll(/(?<![\w-])\d+(?:\.\d+)?(px|rem|em)\b/g)];
    expect(measures.map((match) => match[0])).toEqual([]);
  });
});
