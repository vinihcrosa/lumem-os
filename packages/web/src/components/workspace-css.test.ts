import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte da tela do workspace, nas duas direções.
 *
 * O mesmo raciocínio das outras: o jsdom não aplica folha de estilo, então teste
 * de componente não vê regra faltando — e a direção contrária pega CSS portado
 * para marcação que não existe.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "workspace.css"), "utf8");
const sources = [
  readFileSync(join(HERE, "WorkspacePanel.tsx"), "utf8"),
  readFileSync(join(HERE, "SpendList.tsx"), "utf8"),
].join("\n");

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

/** Montadas por interpolação, então o nome nunca aparece literal. */
const INTERPOLATED = ["spend__row--idle", "spend__row--outside"];

/** Pintadas em outro lugar, e reusadas aqui de propósito. */
const BORROWED = new Set([
  // A moldura de página de detalhe é a mesma do projeto e da worktree
  // (`detail.css`): o workspace é uma página de detalhe, não um lugar novo.
  "pane",
  "detail__title",
  "detail__banner",
  "detail__hint",
  "chips",
  "actions__spacer",
  "section",
  "dim",
  // Primitivas compartilhadas, de `ui/ui.css` — inclusive o segmentado, que subiu
  // para lá quando ganhou o segundo usuário.
  "seg",
  "seg__btn",
  "focus-ring",
  "glyph",
]);

describe("toda classe que a tela do workspace pede existe", () => {
  const available = defined(stylesheet);

  it("define toda classe literal que a tela usa", () => {
    const missing = [...requested(sources)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("define toda classe que ela monta por interpolação", () => {
    expect(INTERPOLATED.filter((name) => !available.has(name))).toEqual([]);
  });

  it("não define nada que a tela não usa", () => {
    const asked = new Set([...requested(sources), ...INTERPOLATED]);
    const unused = [...available].filter((name) => !asked.has(name));

    expect(unused).toEqual([]);
  });
});
