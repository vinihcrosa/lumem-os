import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O sensor da arquitetura do `web` — a fase 0 da
 * [`032`](../../../docs/features/032-web-architecture/prd.md).
 *
 * Sem ele as fases seguintes são intenção; com ele cada uma é *"a lista de exceções
 * encolheu para N"*, e o número aparece no diff em vez de exigir leitura de
 * componente. Mora dentro do `web` porque regula fronteira **interna** de um pacote
 * só ([Q1](../../../docs/features/032-web-architecture/open-questions.md)).
 *
 * Duas propriedades fazem o mecanismo funcionar, e a segunda é a que costuma faltar:
 * a lista de exceções **só encolhe** — um arquivo que deixou de violar e continua
 * listado reprova, senão a lista vira o lugar onde a regra morre em silêncio.
 *
 * A mensagem de falha é **remediação**, e não regra: quem lê precisa saber o que
 * fazer sem abrir este arquivo.
 *
 * O que o sensor **não** garante é comportamento. Direção de dependência, chave de
 * cache e transporte são forma; se a tela mostra o dado certo é assunto dos testes
 * de componente e dos e2e.
 */

const SRC = import.meta.dirname;

type Source = {
  /** Caminho com `/`, relativo a `src/` — é o que as listas de exceção guardam. */
  readonly path: string;
  readonly text: string;
  readonly imports: readonly Import[];
};

type Import = { readonly spec: string; readonly line: number };

type Violation = { readonly path: string; readonly remedy: string };

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Lê os imports por regex, e não por parser.
 *
 * O que ela casa é o `from "…"` — e não a linha inteira do `import`, porque o
 * repositório tem import de várias linhas (`ScopePanel.tsx`, `useMemory.ts` e mais
 * vinte). O único `from "` deste `src` que não é import mora dentro de uma string
 * de teste (`changes-tab.test.tsx`), e o módulo dela (`node:fs/promises`) não
 * interessa a regra nenhuma daqui.
 */
function importsOf(text: string): Import[] {
  return [...text.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => ({
    spec: m[1]!,
    line: lineOf(text, m.index),
  }));
}

function collect(): Source[] {
  const found: Source[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, path);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        found.push({ path, text, imports: importsOf(text) });
      }
    }
  };
  walk(SRC, "");
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

const sources = collect();

/**
 * O portão único: violação fora da lista reprova, e **exceção que sobrou reprova
 * também**. As duas metades num lugar só porque esquecer a segunda é o modo de
 * falha que o mecanismo existe para evitar.
 */
function gate(list: string, violations: readonly Violation[], allowed: readonly string[]): void {
  const problems = [
    ...violations.filter((v) => !allowed.includes(v.path)).map((v) => v.remedy),
    ...allowed
      .filter((p) => !violations.some((v) => v.path === p))
      .map((p) => `\`${p}\` não precisa mais de exceção — remova-o da lista \`${list}\`.`),
  ];
  expect(problems.join("\n")).toBe("");
}

const isScreen = (spec: string): boolean => /(^|\/)(components|setup)\//.test(spec);
const isHook = (spec: string): boolean => /(^|\/)hooks\//.test(spec);
const isTransport = (spec: string): boolean => /(^|\/)lib\/trpc(\.js)?$/.test(spec);

// -- Regra 1: `ui/` não conhece dado ------------------------------------------

/**
 * A regra 1 é a que não tem exceção — e tem **uma**, por três commits.
 *
 * A T1 e a PRD dizem *"sem lista de exceções, a única violação de hoje é a story e a
 * T3 a conserta"*, mas as duas também exigem o gate verde a cada commit: a story
 * viola **agora**, e um sensor que nasce vermelho não é sensor. Então ela entra
 * listada, com endereço e prazo, e a T3 esvazia a lista — que é exatamente o
 * *"passa sem exceção"* prometido lá.
 */
const UI_KNOWS_DATA: readonly string[] = ["ui/Primitives.stories.tsx"];

describe("regra 1 — a primitiva não conhece dado", () => {
  it("nenhum arquivo de `ui/` importa tela, hook, transporte ou react-query", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("ui/")) continue;
      for (const imported of file.imports) {
        const forbidden =
          isScreen(imported.spec) ||
          isHook(imported.spec) ||
          isTransport(imported.spec) ||
          imported.spec === "@tanstack/react-query";
        if (!forbidden) continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa \`${imported.spec}\`: ` +
            "uma primitiva recebe tudo por props e não busca nada. Mova o que precisa " +
            "de dado para `components/` (ou, depois da fase 4, para `features/<domínio>/`) " +
            "e deixe em `ui/` só o que renderiza o que recebeu.",
        });
      }
    }
    gate("UI_KNOWS_DATA", violations, UI_KNOWS_DATA);
  });
});

// -- Regra 2: `lib/` não conhece tela -----------------------------------------

/** Cai na T9: `Seal` vai para `@lumem/shared` com o resto do quadro. */
const LIB_KNOWS_SCREEN = ["lib/board.ts"];

describe("regra 2 — a biblioteca não conhece tela", () => {
  it("nenhum arquivo de `lib/` importa `components/` nem `hooks/`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("lib/")) continue;
      for (const imported of file.imports) {
        if (!isScreen(imported.spec) && !isHook(imported.spec)) continue;
        violations.push({
          path: file.path,
          remedy:
            `\`${file.path}:${imported.line}\` importa \`${imported.spec}\`: ` +
            "função pura não depende de tela. Mova o tipo ou a função para " +
            "`@lumem/shared` se os dois lados da rede o nomeiam, ou para o próprio " +
            "`lib/` se só o web o lê.",
        });
      }
    }
    gate("LIB_KNOWS_SCREEN", violations, LIB_KNOWS_SCREEN);
  });
});

// -- Regra 5: hook tem nome de hook -------------------------------------------
//
// A numeração é a do §3 da PRD; as regras 3 e 4 chegam na T2.

/** Cai na T19: `notice.ts` vira `useBoardNotices.ts` no `git mv` da fase 4. */
const HOOK_WITHOUT_HOOK_NAME = ["hooks/notice.ts"];

describe("regra 5 — o arquivo de hook tem nome de hook", () => {
  it("todo arquivo de `hooks/` que exporta um `use*` chama-se `use*`", () => {
    const violations: Violation[] = [];
    for (const file of sources) {
      if (!file.path.startsWith("hooks/")) continue;
      const name = file.path.slice("hooks/".length);
      if (name.startsWith("use")) continue;
      const exported = /^export (?:async )?function (use[A-Z]\w*)/m.exec(file.text);
      if (!exported) continue;
      violations.push({
        path: file.path,
        remedy:
          `\`${file.path}:${lineOf(file.text, exported.index)}\` exporta ` +
          `\`${exported[1]}\` de um arquivo que não se chama \`use…\`: renomeie o ` +
          `arquivo para \`hooks/${exported[1]}.ts\`, para o nome do import dizer o ` +
          "que ele é antes de alguém abri-lo.",
      });
    }
    gate("HOOK_WITHOUT_HOOK_NAME", violations, HOOK_WITHOUT_HOOK_NAME);
  });
});
