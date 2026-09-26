import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O sensor de `queryKeys.ts` (`032` T6), por texto — no molde do
 * `architecture.test.ts`. Lê o disco em vez de repetir um mapa de exportações
 * à mão: uma chave nova é auditada sem precisar editar este arquivo, e uma
 * exceção que ficaria pra sempre com `[0]` mentindo sobre o prefixo inteiro
 * não tem onde se esconder — é exatamente a lacuna que deixou `["project",
 * "get"]` (o bug que o `cd9549d` consertou) passar num teste anterior.
 *
 * A prova de que o login **alcança** quem lê `agentConfigsKey()` é um teste
 * de componente, e por isso não mora aqui: este arquivo é `lib/`, e a regra 2
 * do sensor proíbe `lib/` de importar tela. Ela está em
 * `components/agent-login.test.tsx`, ao lado da fixture que já monta o
 * rodapé.
 */

const SOURCE_PATH = join(import.meta.dirname, "queryKeys.ts");

const CLOSED_PREFIXES = [
  "workspace",
  "project",
  "worktree",
  "task",
  "session",
  "scripts",
  "files",
  "changes",
  "memory",
  "usage",
  "pr",
  "agentConfig",
  "adapterCatalog",
  "secrets",
  "setup",
  "health",
  "pty",
] as const;

interface Declaration {
  readonly name: string;
  /** Um array por `[` achado no corpo — pode ser mais de um (ternário). */
  readonly arrays: readonly (readonly string[])[];
}

/**
 * Os elementos de string no começo de um array-literal, a partir de `index`
 * (logo após o `[`). Para no primeiro elemento que não é string — variável,
 * `...spread`, `]` vazio — porque é isso que separa "prefixo" de "parâmetro".
 */
function leadingLiterals(text: string, index: number): string[] {
  const literals: string[] = [];
  let cursor = index;
  for (;;) {
    const match = /^\s*"([^"]+)"\s*,?/.exec(text.slice(cursor));
    if (!match) return literals;
    literals.push(match[1]!);
    cursor += match[0].length;
  }
}

/**
 * Todo `export const`/`export function` do arquivo, com os arrays-literais
 * que o corpo dele contém. Comentários saem primeiro — sem isso, um `["task",
 * "board"]` de prosa dentro de um `/** ... *​/` seria lido como declaração.
 */
function declarations(): readonly Declaration[] {
  const text = readFileSync(SOURCE_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const headers = [...text.matchAll(/export (?:const|function) (\w+)/g)];
  return headers.map((header, index) => {
    const start = header.index! + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1]!.index! : text.length;
    const body = text.slice(start, end);
    const arrays = [...body.matchAll(/\[/g)]
      .map((bracket) => leadingLiterals(body, bracket.index! + 1))
      .filter((literals) => literals.length > 0);
    return { name: header[1]!, arrays };
  });
}

describe("os prefixos de queryKeys.ts", () => {
  it("toda chave exportada começa por um prefixo da lista fechada", () => {
    const problems: string[] = [];
    for (const { name, arrays } of declarations()) {
      for (const array of arrays) {
        if (!CLOSED_PREFIXES.includes(array[0] as (typeof CLOSED_PREFIXES)[number])) {
          problems.push(`\`${name}\` usa o prefixo "${array[0]}", fora da lista fechada.`);
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  it("nenhum `*_PREFIX` existe só do lado de quem invalida", () => {
    const all = declarations();
    const reads = all.filter((d) => !d.name.endsWith("_PREFIX"));
    const prefixes = all.filter((d) => d.name.endsWith("_PREFIX"));

    const problems: string[] = [];
    for (const { name, arrays } of prefixes) {
      for (const prefix of arrays) {
        // O prefixo inteiro precisa ser o começo de alguma chave de leitura —
        // não só o primeiro elemento, que é onde `["project", "get"]" no
        // lugar de `["project", "detail"]` passaria sem ser notado.
        const reached = reads.some((read) =>
          read.arrays.some(
            (array) =>
              array.length >= prefix.length && prefix.every((el, i) => el === array[i]),
          ),
        );
        if (!reached) {
          problems.push(
            `\`${name}\` = ${JSON.stringify(prefix)} não é prefixo de nenhuma chave de leitura.`,
          );
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });
});
