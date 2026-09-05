import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte das ações da árvore, nas duas direções.
 *
 * O mesmo raciocínio de `run-dock-css.test.ts`: o jsdom não aplica folha de
 * estilo, então teste de componente **não vê** regra faltando — e esta feature
 * inteira depende de regras que nenhuma asserção de comportamento alcança. O
 * `+` invisível em repouso é `opacity: 0`; o slot reservado é uma largura; o véu
 * é uma composição de token. Nada disso aparece no DOM.
 *
 * A direção contrária pega o defeito mais silencioso: classe que o protótipo tem
 * e o React não usa. Foi o que aconteceu com o `.cfail` — desenhado no protótipo
 * e nunca portado, porque o cartão de falha do clone já existia melhor no app.
 */

const HERE = join(import.meta.dirname, ".");
const PROTOTYPE = join(HERE, "..", "..", "prototype");

const sidebar = readFileSync(join(HERE, "sidebar.css"), "utf8");
const clone = readFileSync(join(HERE, "clone.css"), "utf8");
const ui = readFileSync(join(HERE, "..", "ui", "ui.css"), "utf8");
// A árvore importa esta: a marca de `run` na linha do checkout nasceu na
// `project-scripts` e continua sendo dela.
const runDock = readFileSync(join(HERE, "run-dock.css"), "utf8");
const prototype = readFileSync(join(PROTOTYPE, "lumem-sidebar-actions.css"), "utf8");

const tree = readFileSync(join(HERE, "SidebarTree.tsx"), "utf8");
const cloneStatus = readFileSync(join(HERE, "CloneStatus.tsx"), "utf8");
const modal = readFileSync(join(HERE, "..", "ui", "Modal.tsx"), "utf8");
const row = readFileSync(join(HERE, "..", "ui", "Row.tsx"), "utf8");

function defined(css: string): Set<string> {
  const names = new Set<string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of withoutComments.split("}")) {
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

/** As peças novas, e o nome exato que o desenho lhes deu. */
const FROM_THE_DESIGN = [
  "tree__head",
  "row__act",
  "row__slot",
  "modal",
  "modal__scrim",
  "modal__card",
  "modal__head",
  "modal__body",
  "modal__foot",
  "modal__where",
];

describe("as ações da árvore, portadas do protótipo", () => {
  const available = new Set([
    ...defined(sidebar),
    ...defined(clone),
    ...defined(ui),
    ...defined(runDock),
  ]);
  const drawn = defined(prototype);

  it("define toda classe literal que a árvore, o clone e o modal pedem", () => {
    const missing = [
      ...requested(tree),
      ...requested(cloneStatus),
      ...requested(modal),
      ...requested(row),
    ]
      .filter((name) => !available.has(name))
      // Pintadas em outro lugar de propósito: primitivas de `ui/ui.css` e o
      // `sr-only` do `styles/base.css`.
      .filter((name) => !["glyph", "kbd", "row", "focus-ring", "sr-only"].includes(name));

    expect(missing).toEqual([]);
  });

  it("usa os nomes do desenho, e não sinônimos inventados na tradução", () => {
    // Nos dois lados: o que o desenho nomeou existe aqui, e é o mesmo nome. É o
    // que faz tela desenhada no Open Design ser implementável sem tradução.
    expect(FROM_THE_DESIGN.filter((name) => !available.has(name))).toEqual([]);
    expect(FROM_THE_DESIGN.filter((name) => !drawn.has(name))).toEqual([]);
  });

  it("não deixa literal de cor, espaço ou tipografia nas folhas novas", () => {
    // A regra do projeto: componente só usa `var(--token)`. Um hexadecimal aqui
    // quebra a promessa de que trocar uma rampa no Open Design troca a interface.
    const suspects = [...sidebar.split("\n"), ...clone.split("\n")]
      .filter((line) => !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("*"))
      .filter((line) => /#[0-9a-fA-F]{3,8}\b|:\s*-?\d+px|\b\d+pt\b/.test(line))
      // Porcentagem de composição e `0`/`1px` de borda não são valor de design.
      .filter((line) => !/:\s*0px|1px solid/.test(line));

    expect(suspects).toEqual([]);
  });
});
