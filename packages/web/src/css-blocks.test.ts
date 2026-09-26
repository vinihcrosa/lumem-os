import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O sensor de CSS — T32 da [`032`](../../../docs/features/032-web-architecture/prd.md).
 *
 * Dois defeitos, e os dois já aconteceram sem que nada falhasse: um bloco de
 * primeiro nível definido em duas folhas (`.empty`/`.meta`, que a T30 consertou
 * na mão em `conversation.css`, e que este sensor teria achado sozinho — inclusive
 * o terceiro `.empty {}` de `right-panel.css`, que a T30 tinha registrado e não
 * tocado), e uma classe pedida por um componente que nenhuma folha define (as
 * "13 órfãs que a `028` Parte 3 pagou"). Nenhum dos dois aparece rodando o app:
 * o CSS que colide silenciosamente vence por ordem de bundle, e a classe que
 * falta só aparece como um pixel sem estilo — o mesmo motivo por que
 * `conversation-css.test.ts` (C8) lê arquivo em vez de renderizar componente.
 *
 * Este arquivo é **complementar** aos onze `*-css.test.ts` de feature, não um
 * substituto: aqueles enumeram por extenso cada variante que uma tela monta por
 * interpolação (`INTERPOLATED`) e cada classe emprestada de outra folha
 * (`BORROWED`) — precisão que só compensa dentro do raio de uma tela. Este
 * cobre o `web` inteiro, então usa uma regra mais barata para não dar falso
 * positivo em interpolação: o texto **estático** ao redor de um `${…}` dentro de
 * um `className` — prefixo, sufixo, ou o meio — precisa aparecer em algum nome de
 * classe definido, em vez de exigir o nome inteiro por extenso (que o sensor não
 * tem como calcular sem rodar o componente). `` `btn--${variant}` `` nunca
 * precisa entrar numa lista à mão: o sensor lê o próprio template e cobra
 * "existe uma classe que contém `btn--`", sem saber, e sem precisar saber, quais
 * são os valores de `variant`.
 */

const SRC = import.meta.dirname;

function collect(matches: (name: string) => boolean): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, path);
      else if (matches(entry.name)) found.push({ path, text: readFileSync(full, "utf8") });
    }
  };
  walk(SRC, "");
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** Todo CSS de produção do `web` — nenhuma folha fica de fora por engano. */
const cssFiles = collect((name) => name.endsWith(".css"));

/**
 * Todo `.tsx` de produção — inclui `.stories.tsx` (é o que o `build-storybook`
 * do gate desta fase compila) e exclui só `.test.tsx`, que não vai para o
 * bundle e testa comportamento, não marcação.
 */
const tsxFiles = collect((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Apaga o texto de um comentário sem apagar as linhas — troca cada caractere
 * por um espaço, exceto a quebra de linha. Um `.replace` que some com o
 * comentário inteiro desalinha todo `lineOf` calculado depois dele; isto
 * mantém o índice de cada caractere restante igual ao do arquivo original.
 */
function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

// ---------------------------------------------------------------------------
// Defeito 1: o mesmo bloco de primeiro nível, definido em duas folhas.
// ---------------------------------------------------------------------------

type Block = { readonly key: string; readonly file: string; readonly line: number };

/**
 * Um seletor conta como bloco de primeiro nível quando ele não é nada além de
 * uma ou mais classes coladas — sem descendente, sem pseudo, sem atributo.
 * `.empty.empty--conversation` (T30) é a razão de aceitar a cadeia inteira: é
 * o par de classes que forma o bloco, e comparar por esse par (ordenado, para
 * `.a.b` e `.b.a` contarem como o mesmo bloco) é o que faz o modificador
 * composto **não** colidir com `.empty` sozinho — são blocos diferentes, com
 * dono comum de propósito.
 */
const PURE_CLASS_CHAIN = /^(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)+$/;

function blocksOf(file: { path: string; text: string }): Block[] {
  const blanked = blankComments(file.text);
  const blocks: Block[] = [];
  for (const rule of blanked.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const rawSelector = rule[1]!;
    for (const part of rawSelector.split(",")) {
      const selector = part.trim();
      if (selector === "" || !PURE_CLASS_CHAIN.test(selector)) continue;
      const classes = [...selector.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)]
        .map((m) => m[1]!)
        .sort();
      blocks.push({ key: classes.join("."), file: file.path, line: lineOf(file.text, rule.index ?? 0) });
    }
  }
  return blocks;
}

function duplicateBlocks(): { key: string; occurrences: Block[] }[] {
  const byKey = new Map<string, Block[]>();
  for (const file of cssFiles) {
    for (const block of blocksOf(file)) {
      const list = byKey.get(block.key) ?? [];
      list.push(block);
      byKey.set(block.key, list);
    }
  }
  return [...byKey.entries()]
    .map(([key, occurrences]) => ({ key, occurrences }))
    .filter((group) => new Set(group.occurrences.map((o) => o.file)).size > 1);
}

describe("nenhum bloco de primeiro nível repete entre folhas", () => {
  it("todo `.classe[.classe…]` de primeiro nível tem uma folha dona só", () => {
    const problems = duplicateBlocks().map((group) => {
      const where = group.occurrences.map((o) => `${o.file}:${o.line}`).join(", ");
      return (
        `.${group.key} está definido em mais de um arquivo: ${where}. Um bloco de ` +
        "primeiro nível tem uma dona: mova a diferença para um modificador composto " +
        "(`.base.base--variante`, T30) ou renomeie um dos dois (T31) — nunca repita a " +
        "mesma regra em duas folhas."
      );
    });
    expect(problems.join("\n\n")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Defeito 2: classe pedida por um componente que nenhuma folha define.
// ---------------------------------------------------------------------------

/** Toda classe mencionada em qualquer seletor de qualquer folha, em qualquer posição — inclusive dentro de pseudo e descendente. É o universo contra o qual um `className` é conferido. */
function allDefinedClasses(): Set<string> {
  const names = new Set<string>();
  for (const file of cssFiles) {
    const blanked = blankComments(file.text);
    for (const rule of blanked.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const match of rule[1]!.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) names.add(match[1]!);
    }
  }
  return names;
}

/** É comparação (`status === "deleted"`), não literal de classe — a única forma de `className={[...]}` do repositório (`FileTree.tsx`) mistura os dois no mesmo array. */
function precededByComparison(raw: string, quoteIndex: number): boolean {
  let i = quoteIndex - 1;
  while (i >= 0 && /\s/.test(raw[i]!)) i--;
  return /[!=]==?$/.test(raw.slice(0, i + 1));
}

type Segment = { readonly text: string; readonly index: number };

/**
 * Marca onde um `${…}` foi removido de um template literal.
 *
 * Um caractere da área de uso privado do Unicode, e não `\0` ou outro
 * controle: os dois analisam igual em JavaScript, mas um controle embutido
 * numa string faz o `git` classificar o arquivo inteiro como binário —
 * `git diff` vira "Bin 0 -> N bytes", e ninguém revisa um sensor às cegas.
 */
const HOLE = "";

/**
 * Extrai o texto estático de dentro de um `className={…}`: string entre aspas
 * em qualquer posição do nível raiz (cobre o ternário de strings puras, como
 * `Modal.tsx`), e o texto fora de `${…}` de todo template literal — sem
 * recursar para dentro do `${…}`, porque lá mora tanto o nome de classe de um
 * ramo de ternário quanto o valor comparado (`tone === "quiet"`), e as duas
 * strings têm a mesma forma. Cada `${…}` vira um único `HOLE`, preservando a
 * palavra ao redor: `` `btn--${variant}` `` sai como `"btn--" + HOLE`, uma
 * palavra só.
 */
function segmentsOf(raw: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '"' || ch === "'") {
      const start = i + 1;
      let j = start;
      while (j < raw.length && raw[j] !== ch) j++;
      if (!precededByComparison(raw, i)) segments.push({ text: raw.slice(start, j), index: start });
      i = j + 1;
    } else if (ch === "`") {
      const start = i + 1;
      let buf = "";
      let j = start;
      while (j < raw.length && raw[j] !== "`") {
        if (raw[j] === "$" && raw[j + 1] === "{") {
          let depth = 1;
          let k = j + 2;
          while (k < raw.length && depth > 0) {
            if (raw[k] === "{") depth++;
            else if (raw[k] === "}") depth--;
            k++;
          }
          buf += HOLE;
          j = k;
        } else {
          buf += raw[j];
          j++;
        }
      }
      segments.push({ text: buf, index: start });
      i = j + 1;
    } else {
      i++;
    }
  }
  return segments;
}

type Request = { readonly word: string; readonly dynamic: boolean; readonly file: string; readonly line: number };

/**
 * Lê todo `className=` de um arquivo — `"literal"` direto e `{…}` (string,
 * template, ternário, array `.filter(Boolean).join(" ")` de `FileTree.tsx`) —
 * e devolve cada palavra que ele pede, com a linha do próprio `className=`
 * (não da palavra: um template de várias linhas — `SpendList.tsx`,
 * `UsageFooter.tsx` — perde a exatidão de qual linha gerou qual `HOLE` assim
 * que um `${…}` é trocado por um caractere só; a linha do atributo já basta
 * para quem lê a mensagem encontrar o uso).
 */
function requestsOf(file: { path: string; text: string }): Request[] {
  const requests: Request[] = [];
  for (const attr of file.text.matchAll(/className=/g)) {
    const line = lineOf(file.text, attr.index);
    const openAt = attr.index + attr[0].length;
    const opener = file.text[openAt];
    let raw: string;
    if (opener === '"') {
      const end = file.text.indexOf('"', openAt + 1);
      if (end === -1) continue;
      raw = `"${file.text.slice(openAt + 1, end)}"`;
    } else if (opener === "{") {
      let depth = 1;
      let k = openAt + 1;
      while (k < file.text.length && depth > 0) {
        if (file.text[k] === "{") depth++;
        else if (file.text[k] === "}") depth--;
        k++;
      }
      raw = file.text.slice(openAt + 1, k - 1);
    } else {
      continue;
    }
    for (const segment of segmentsOf(raw)) {
      for (const word of segment.text.split(/\s+/)) {
        if (word === "") continue;
        const dynamic = word.includes(HOLE);
        requests.push({ word, dynamic, file: file.path, line });
      }
    }
  }
  return requests;
}

const KNOWN = allDefinedClasses();

/** Uma palavra estática — sem `HOLE` — precisa existir por extenso. */
function missingExact(word: string): boolean {
  return !KNOWN.has(word);
}

/**
 * Uma palavra com `HOLE` vira um ou mais fragmentos estáticos (prefixo,
 * sufixo, ou os dois — `` `usage-stat${tone === "quiet" ? "" : ` usage-stat--${tone}` }` ``
 * chega aqui já achatado pela extração de segmento, um por ramo). Cada
 * fragmento não vazio precisa aparecer em pelo menos um nome de classe real —
 * não precisa ser prefixo nem sufixo exato, porque um fragmento no meio de
 * dois `HOLE` (raro, nenhum caso hoje) não tem lado para exigir.
 */
function missingDynamic(word: string): boolean {
  const fragments = word.split(HOLE).filter((f) => f !== "");
  return fragments.some((fragment) => ![...KNOWN].some((c) => c.includes(fragment)));
}

describe("toda classe pedida por um componente existe em alguma folha", () => {
  it("cada `className` literal e cada fragmento estático de interpolação batem com um nome real", () => {
    const problems: string[] = [];
    for (const file of tsxFiles) {
      for (const request of requestsOf(file)) {
        const missing = request.dynamic ? missingDynamic(request.word) : missingExact(request.word);
        if (!missing) continue;
        const shown = request.word.replaceAll(HOLE, "${…}");
        problems.push(
          `\`${request.file}:${request.line}\` pede a classe \`${shown}\`, que nenhuma folha CSS ` +
            "define: corrija o nome, ou crie a regra que falta.",
        );
      }
    }
    expect(problems.join("\n")).toBe("");
  });
});
