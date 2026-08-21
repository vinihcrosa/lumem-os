import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, type Block, type Inline } from "./markdown.js";

/** O texto de uma árvore inline, para asserção legível. */
const flat = (nodes: readonly Inline[]): string =>
  nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.text;
        case "break":
          return "\n";
        default:
          return flat(node.children);
      }
    })
    .join("");

const kinds = (blocks: readonly Block[]): string[] => blocks.map((block) => block.kind);

describe("parseMarkdown — blocos", () => {
  it("parágrafos separados por linha vazia", () => {
    const blocks = parseMarkdown("primeiro\n\nsegundo");

    expect(kinds(blocks)).toEqual(["paragraph", "paragraph"]);
  });

  it("quebra de linha simples é quebra de linha, não espaço", () => {
    // Dialeto de conversa: quem apertou Enter quis a linha nova. É o que o
    // GitHub faz em comentário, e pelo mesmo motivo.
    const [block] = parseMarkdown("uma\noutra");

    expect(block?.kind).toBe("paragraph");
    expect(block?.kind === "paragraph" && block.content.some((node) => node.kind === "break")).toBe(
      true,
    );
  });

  it("título com nível", () => {
    const blocks = parseMarkdown("## O que entrou\n\ntexto");

    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[0]?.kind === "heading" && flat(blocks[0].content)).toBe("O que entrou");
  });

  it("cerca de código guarda o texto cru e a linguagem", () => {
    const [block] = parseMarkdown("```ts\nconst a = **1**;\n```");

    expect(block).toEqual({ kind: "code", language: "ts", text: "const a = **1**;" });
  });

  it("cerca não fechada é código até o fim — é o estado do streaming", () => {
    // Tratar como parágrafo faria o bloco piscar de texto para código a cada
    // chunk que chega.
    const [block] = parseMarkdown("```\nlinha um\nlinha dois");

    expect(block).toEqual({ kind: "code", language: null, text: "linha um\nlinha dois" });
  });

  it("lista com marcador, e com número", () => {
    const bullets = parseMarkdown("- um\n- dois");
    const numbers = parseMarkdown("1. um\n2. dois");

    expect(bullets[0]).toMatchObject({ kind: "list", ordered: false });
    expect(bullets[0]?.kind === "list" && bullets[0].items).toHaveLength(2);
    expect(numbers[0]).toMatchObject({ kind: "list", ordered: true });
  });

  it("um nível de aninhamento", () => {
    const [block] = parseMarkdown("- pai\n  - filho\n- outro");

    expect(block?.kind).toBe("list");
    if (block?.kind !== "list") return;
    expect(block.items).toHaveLength(2);
    expect(flat(block.items[0]!.children[0]!.content)).toBe("filho");
  });

  it("lista começa sem linha vazia antes — é como agente escreve", () => {
    const blocks = parseMarkdown("O que fica:\n- um\n- dois");

    expect(kinds(blocks)).toEqual(["paragraph", "list"]);
  });

  it("citação junta as linhas dela", () => {
    const [block] = parseMarkdown("> primeira\n> segunda");

    expect(block?.kind).toBe("quote");
    expect(block?.kind === "quote" && flat(block.content)).toBe("primeira\nsegunda");
  });

  it("régua horizontal", () => {
    expect(kinds(parseMarkdown("a\n\n---\n\nb"))).toEqual(["paragraph", "rule", "paragraph"]);
  });

  it("tabela com cabeçalho e linhas", () => {
    const [block] = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");

    expect(block?.kind).toBe("table");
    if (block?.kind !== "table") return;
    expect(block.header.map(flat)).toEqual(["a", "b"]);
    expect(block.rows).toHaveLength(2);
    expect(block.rows[1]!.map(flat)).toEqual(["3", "4"]);
  });

  it("linha com barras sem a régua é parágrafo, não tabela", () => {
    expect(kinds(parseMarkdown("| isto não é tabela |"))).toEqual(["paragraph"]);
  });

  it("texto vazio não produz bloco nenhum", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("código vence tudo: dentro dele não há marcação", () => {
    // O caso que aparece toda hora: um agente citando o próprio markdown.
    const nodes = parseInline("use `a **b** c` aqui");

    expect(nodes[1]).toEqual({ kind: "code", text: "a **b** c" });
  });

  it("forte, ênfase e riscado", () => {
    expect(parseInline("**forte**")[0]?.kind).toBe("strong");
    expect(parseInline("*ênfase*")[0]?.kind).toBe("em");
    expect(parseInline("~~riscado~~")[0]?.kind).toBe("strike");
  });

  it("`_` no meio de palavra não é ênfase", () => {
    // `snake_case_assim` é nome de variável, e foi o primeiro defeito a aparecer.
    const nodes = parseInline("snake_case_assim");

    expect(nodes).toEqual([{ kind: "text", text: "snake_case_assim" }]);
  });

  it("link guarda o destino e o texto", () => {
    const [node] = parseInline("veja [o PRD](docs/prd/x.md) aqui");

    expect(node).toEqual({ kind: "text", text: "veja " });
    expect(parseInline("[o PRD](docs/prd/x.md)")[0]).toMatchObject({
      kind: "link",
      href: "docs/prd/x.md",
    });
  });

  it("asterisco solto continua sendo asterisco", () => {
    expect(flat(parseInline("2 * 3 = 6"))).toBe("2 * 3 = 6");
  });

  it("marcação não fechada é texto", () => {
    expect(flat(parseInline("isto **não fecha"))).toBe("isto **não fecha");
  });
});
