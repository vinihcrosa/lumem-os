/**
 * O markdown que um agente escreve, do jeito que ele escreve.
 *
 * **Por que à mão, e não uma biblioteca.** O que chega aqui é texto de um modelo,
 * e vai para dentro do React como elementos — nunca `innerHTML`. Uma biblioteca
 * de markdown devolve HTML, e aí o caminho natural é `dangerouslySetInnerHTML`
 * com texto que vem de fora do produto. O subconjunto que um agente usa é
 * pequeno e conhecido, então ele é parseado aqui e renderizado como árvore.
 *
 * **Por que existe.** O protótipo do Open Design sempre desenhou `.msg` com
 * `<p>` e `<code>` dentro — o desenho supõe markdown renderizado. A
 * implementação jogava a mensagem inteira num `<p>` só, e o resultado foi uma
 * parede de texto com `##`, `**` e cercas de código à vista, tudo numa linha.
 *
 * Duas escolhas de dialeto, e as duas são sobre conversa e não sobre documento:
 *
 * - **quebra de linha simples vira quebra de linha.** No markdown de documento
 *   ela é espaço; num chat, quem apertou Enter quis a linha nova — é o que o
 *   GitHub faz em comentário, e pelo mesmo motivo;
 * - **cerca não fechada é código até o fim.** Durante o streaming a cerca chega
 *   antes do fechamento, e tratar como parágrafo faria o bloco piscar de texto
 *   para código a cada chunk.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: readonly Inline[] }
  | { kind: "em"; children: readonly Inline[] }
  | { kind: "strike"; children: readonly Inline[] }
  | { kind: "link"; href: string; children: readonly Inline[] }
  | { kind: "break" };

export interface ListItem {
  content: readonly Inline[];
  /** Itens de um nível mais fundo. Um só nível — mais que isso vira o mesmo. */
  children: readonly ListItem[];
}

export type Block =
  | { kind: "paragraph"; content: readonly Inline[] }
  | { kind: "heading"; level: number; content: readonly Inline[] }
  | { kind: "code"; language: string | null; text: string }
  | { kind: "list"; ordered: boolean; items: readonly ListItem[] }
  | { kind: "quote"; content: readonly Inline[] }
  | { kind: "table"; header: readonly (readonly Inline[])[]; rows: readonly (readonly Inline[])[][] }
  | { kind: "rule" };

const FENCE = /^\s{0,3}(?:```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d{1,9}[.)]\s+(.*)$/;
const TABLE_ROW = /^\s{0,3}\|(.+)\|\s*$/;
const TABLE_RULE = /^\s{0,3}\|[\s:|-]+\|\s*$/;

/** Blocos, na ordem em que aparecem. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1] === "" ? null : fence[1]!;
      const body: string[] = [];
      index += 1;
      // Cerca não fechada consome até o fim: é o estado normal do streaming.
      while (index < lines.length && !FENCE.test(lines[index]!)) {
        body.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language, text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        content: parseInline(heading[2]!.trim()),
      });
      index += 1;
      continue;
    }

    // Regra antes de lista: `---` casa `[-*+]\s+`? Não casa (falta o espaço),
    // mas casa a linha de fechamento de frontmatter que o agente cola no chat.
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index]!);
        if (!quoted) break;
        body.push(quoted[1]!);
        index += 1;
      }
      blocks.push({ kind: "quote", content: parseInline(body.join("\n")) });
      continue;
    }

    if (TABLE_ROW.test(line) && index + 1 < lines.length && TABLE_RULE.test(lines[index + 1]!)) {
      const header = cells(line);
      // Duas linhas: o cabeçalho e o `|---|` que o marca como tabela. Sem o
      // segundo, `| isto |` é só um parágrafo com barras.
      index += 2;
      const rows: (readonly Inline[])[][] = [];
      while (index < lines.length && TABLE_ROW.test(lines[index]!)) {
        rows.push(cells(lines[index]!));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const { items, next } = parseList(lines, index, ordered);
      blocks.push({ kind: "list", ordered, items });
      index = next;
      continue;
    }

    /*
     * Parágrafo: **a primeira linha sempre entra**, e as seguintes até a linha
     * vazia ou até algo que abra outro bloco.
     *
     * "Sempre entra" não é detalhe: uma linha que `opensBlock` reconhece mas que
     * nenhum ramo acima consumiu — `| isto |` sem a régua da tabela — deixava o
     * `index` parado, e o laço enchia a memória de parágrafos vazios. O teste
     * dessa linha derrubou o processo com OOM, que é a melhor falha possível
     * para um laço que não avança.
     */
    const paragraph: string[] = [lines[index]!.trim()];
    index += 1;
    while (index < lines.length) {
      const current = lines[index]!;
      if (current.trim() === "" || opensBlock(current)) break;
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", content: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

/** O que interrompe um parágrafo. Lista entra aqui: agente não deixa linha vazia antes. */
function opensBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    TABLE_ROW.test(line)
  );
}

function cells(line: string): (readonly Inline[])[] {
  const inner = TABLE_ROW.exec(line)![1]!;
  return inner.split("|").map((cell) => parseInline(cell.trim()));
}

/**
 * Uma lista, com um nível de aninhamento.
 *
 * Um nível e não N: `- a` dentro de `- b` dentro de `- c` é raro na conversa e
 * caro no parser. O terceiro nível cai no segundo, que é feio e legível — o
 * contrário de correto e ilegível, que é o que uma pilha mal fechada produz.
 */
function parseList(
  lines: readonly string[],
  start: number,
  ordered: boolean,
): { items: ListItem[]; next: number } {
  const items: { content: readonly Inline[]; children: ListItem[] }[] = [];
  let index = start;
  let baseIndent: number | null = null;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === "") {
      // Uma linha vazia entre itens não fecha a lista; duas fecham.
      if (index + 1 < lines.length && itemOf(lines[index + 1]!) !== null) {
        index += 1;
        continue;
      }
      break;
    }

    const item = itemOf(line);
    if (item === null) break;
    if (item.ordered !== ordered && item.indent === (baseIndent ?? item.indent)) break;

    baseIndent ??= item.indent;
    if (item.indent > baseIndent) {
      const parent = items[items.length - 1];
      if (parent === undefined) break;
      parent.children.push({ content: parseInline(item.text), children: [] });
    } else {
      items.push({ content: parseInline(item.text), children: [] });
    }
    index += 1;
  }

  return { items, next: index };
}

function itemOf(line: string): { indent: number; text: string; ordered: boolean } | null {
  const bullet = BULLET.exec(line);
  if (bullet) return { indent: bullet[1]!.length, text: bullet[2]!, ordered: false };
  const ordered = ORDERED.exec(line);
  if (ordered) return { indent: ordered[1]!.length, text: ordered[2]!, ordered: true };
  return null;
}

/**
 * O inline, com **código primeiro**.
 *
 * Código vence porque dentro dele nada é marcação: `` `a **b** c` `` mostra os
 * asteriscos, e é o caso que aparece toda hora — um agente citando o próprio
 * markdown. Depois vêm link, forte, ênfase e riscado, nessa ordem, porque `**`
 * tem que ser tentado antes de `*`.
 */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";

  const flush = (): void => {
    if (buffer === "") return;
    for (const [at, piece] of buffer.split("\n").entries()) {
      if (at > 0) out.push({ kind: "break" });
      if (piece !== "") out.push({ kind: "text", text: piece });
    }
    buffer = "";
  };

  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);

    const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: "code", text: code[2]!.trim() });
      index += code[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^\s)]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: "link", href: link[2]!, children: parseInline(link[1]!) });
      index += link[0].length;
      continue;
    }

    const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: "strong", children: parseInline(strong[2]!) });
      index += strong[0].length;
      continue;
    }

    const strike = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest);
    if (strike) {
      flush();
      out.push({ kind: "strike", children: parseInline(strike[1]!) });
      index += strike[0].length;
      continue;
    }

    // `_` só delimita entre fronteiras de palavra: `snake_case_assim` é nome de
    // variável, e itálico no meio dele foi o primeiro defeito que apareceu.
    const em = /^(\*)(?=\S)([\s\S]*?\S)\1|^(_)(?=\S)([\s\S]*?\S)\3(?![\w])/.exec(rest);
    if (em && (em[1] === "*" || index === 0 || /[^\w]/.test(source[index - 1]!))) {
      flush();
      out.push({ kind: "em", children: parseInline(em[2] ?? em[4]!) });
      index += em[0].length;
      continue;
    }

    buffer += source[index]!;
    index += 1;
  }

  flush();
  return out;
}
