import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The port audit for the login panel, in both directions.
 *
 * Same reasoning as `conversation-css.test.ts` and `setup-css.test.ts`: jsdom
 * applies no stylesheets, so a component test cannot see a missing rule, and the
 * promise that the classes come from the prototype with the same names is worth
 * exactly as much as the thing that checks it.
 */

const HERE = join(import.meta.dirname, ".");

const stylesheet = readFileSync(join(HERE, "agent-login.css"), "utf8");
const component = readFileSync(join(HERE, "AgentLogin.tsx"), "utf8");

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

/** Built by interpolation, so the name never appears literally. */
const INTERPOLATED = [
  "foot-row--on",
  "foot-row--off",
  "foot-row--warn",
  "foot-row--err",
  // A marca da linha que abriu o painel entra por interpolação, no mesmo
  // `className` do estado (`second-agent`, T12).
  "is-open",
  "prep__r--done",
  "prep__r--now",
  "prep__r--wait",
  /*
   * O par da opção de login sai de um ternário, não de um template.
   *
   * `index === 0 ? "opt opt--primary" : "opt"` é a regra de "um preenchido por
   * painel", e ela é escolha e não interpolação — o leitor de `className=` deste
   * teste não vê string dentro de expressão.
   */
  "opt",
  "opt--primary",
];

/** Painted elsewhere, and reused here on purpose. */
const BORROWED = new Set([
  // The failure block and the output tail are the conversation's (conversation.css):
  // a launch failure looks the same wherever it is read, and repainting it would
  // be a second opinion about what a failure looks like.
  "fail",
  "fail__title",
  "fail__body",
  "fail__cmd",
  "out",
  "out--short",
  "l",
  // Shared primitives, from `ui/ui.css`.
  "glyph",
  "btn",
  // The custom-adapter drawer is the old dialog, with its own rules in sidebar.css.
  "agents",
  // O campo de texto é o `Input` do design system, e ele pinta o `.input`. O que
  // esta folha acrescenta é o `.key-in` em volta dele — a linha campo + botão.
  "input",
]);

describe("every class the login panel asks for exists", () => {
  const available = defined(stylesheet);

  it("defines every literal class the panel uses", () => {
    const missing = [...requested(component)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("defines every class it builds by interpolation", () => {
    expect(INTERPOLATED.filter((name) => !available.has(name))).toEqual([]);
  });

  it("defines nothing the panel does not use", () => {
    /*
     * The other direction, and what it caught twice.
     *
     * A primeira vez: `.key-in` estava no protótipo para o caminho da chave de
     * API, que ficou fora da entrega da `agent-login` — pintar sem markup deixa
     * CSS morto. A segunda: o `.input` de dentro dele é do design system, e
     * declará-lo aqui como bloco próprio seria uma segunda opinião sobre a
     * aparência de um campo de texto.
     */
    const asked = requested(component);

    const orphans = [...available]
      .filter((name) => !asked.has(name))
      .filter((name) => !INTERPOLATED.includes(name))
      // Emprestado nas duas direções: uma classe que outro arquivo pede pode
      // aparecer aqui como seletor de contexto (`.key-in .input`) sem que este
      // componente a escreva.
      .filter((name) => !BORROWED.has(name))
      .filter((name) => {
        const block = name.split(/__|--/)[0]!;
        return block === name && !asked.has(block);
      });

    expect(orphans).toEqual([]);
  });
});
