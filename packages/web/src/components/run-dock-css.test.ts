import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte do rodapé de execução, nas duas direções.
 *
 * O mesmo raciocínio de `conversation-css.test.ts`: o jsdom não aplica folha de
 * estilo, então teste de componente **não vê** regra faltando, e a promessa de
 * que as classes vêm do protótipo com o mesmo nome vale exatamente o que vale a
 * coisa que confere.
 *
 * A direção contrária pega o defeito oposto e mais silencioso: CSS portado para
 * marcação que não existe. Foi o que aconteceu com esta tela — o desenho tinha
 * `.hint` no cartão de número desde o S2, e o React não usava.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "run-dock.css"), "utf8");
const component = readFileSync(join(HERE, "RunDock.tsx"), "utf8");

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
const INTERPOLATED = ["dtab--active", "dtab__dot--run", "dtab__dot--fail", "dtab__dot--ok"];

/** Pintadas em outro lugar, e reusadas aqui de propósito. */
const BORROWED = new Set([
  // Primitivas compartilhadas, de `ui/ui.css`.
  "btn",
  "focus-ring",
]);

describe("toda classe que o rodapé pede existe", () => {
  const available = defined(stylesheet);

  it("define toda classe literal que o rodapé usa", () => {
    const missing = [...requested(component)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("define toda classe que ele monta por interpolação", () => {
    expect(INTERPOLATED.filter((name) => !available.has(name))).toEqual([]);
  });
});
