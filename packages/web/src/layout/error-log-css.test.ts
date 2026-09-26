import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A auditoria de porte do registro de erros, no mesmo padrão dos outros oito.
 *
 * O jsdom não aplica folha de estilo, então teste de componente **não vê** regra
 * faltando: uma classe que o React pede e o CSS não define passa verde na suíte
 * e some só na tela. Isto confere que toda classe pedida existe.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "error-log.css"), "utf8");
const component = readFileSync(join(HERE, "ErrorLog.tsx"), "utf8");

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

describe("toda classe que o registro de erros pede existe", () => {
  const available = defined(stylesheet);

  it("define toda classe literal que o componente usa", () => {
    const missing = [...requested(component)].filter((name) => !available.has(name));
    expect(missing).toEqual([]);
  });
});
