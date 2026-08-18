import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import {
  DEFAULT_SCOPE_FOR_TYPE,
  entryFilename,
  MEMORY_ACTORS,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  parseEntry,
  proposalRefusal,
  resolveScope,
  serializeEntry,
  slugify,
  type MemoryEntry,
} from "./entry.js";

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    name: "Estilo de revisão",
    description: "Prefere achado com arquivo e linha antes do texto",
    type: "user",
    scope: "global",
    provenance: {
      source_actor: "human",
      source_sessions: [],
      confidence: "high",
      created_at: "2026-08-17T18:00:00.000Z",
      updated_at: "2026-08-17T18:00:00.000Z",
    },
    body: "Achado primeiro, explicação depois.",
    ...overrides,
  };
}

describe("serializeEntry e parseEntry", () => {
  it("volta igual ao que entrou", () => {
    const original = entry();

    expect(parseEntry(serializeEntry(original))).toEqual(original);
  });

  it("produz um arquivo que abre legível no editor", () => {
    const text = serializeEntry(entry());

    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain("type: user");
    expect(text).toContain("\n---\n\nAchado primeiro");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("preserva corpo com Markdown, lista e bloco de código", () => {
    const body = ["# Título", "", "- um", "- dois", "", "```ts", "const a = 1;", "```"].join("\n");

    expect(parseEntry(serializeEntry(entry({ body }))).body).toBe(body);
  });

  it("sobrevive a `---` dentro do corpo", () => {
    // O separador só é separador na abertura e no fechamento do frontmatter.
    const body = "antes\n\n---\n\ndepois";

    expect(parseEntry(serializeEntry(entry({ body }))).body).toBe(body);
  });

  it("preserva acento e aspas na descrição", () => {
    const description = 'Não usar "aspas retas" em código: preferência do Vinícius';

    expect(parseEntry(serializeEntry(entry({ description }))).description).toBe(description);
  });

  it("aceita memória sem corpo", () => {
    const parsed = parseEntry(serializeEntry(entry({ body: "" })));

    expect(parsed.body).toBe("");
  });
});

describe("parseEntry — a fronteira", () => {
  it("recusa tipo fora da taxonomia, em vez de aceitar campo livre", () => {
    const text = serializeEntry(entry()).replace("type: user", "type: anotacao");

    expect(() => parseEntry(text)).toThrow(DomainError);
    expect(() => parseEntry(text)).toThrow(/type/);
  });

  it("recusa escopo inválido", () => {
    const text = serializeEntry(entry()).replace("scope: global", "scope: worktree");

    expect(() => parseEntry(text)).toThrow(/scope/);
  });

  it("recusa proveniência ausente — memória sem origem é memória irrastreável", () => {
    const text = "---\nname: X\ndescription: Y\ntype: user\nscope: global\n---\n\ncorpo\n";

    expect(() => parseEntry(text)).toThrow(/provenance/);
  });

  it("nomeia o erro quando o frontmatter não abre", () => {
    expect(() => parseEntry("só um markdown qualquer\n", "user_x.md")).toThrow(
      /user_x\.md: falta o frontmatter/,
    );
  });

  it("nomeia o erro quando o frontmatter não fecha", () => {
    expect(() => parseEntry("---\nname: X\n")).toThrow(/não foi fechado/);
  });

  it("nomeia o erro quando o YAML está corrompido — e não devolve memória vazia", () => {
    const text = "---\nname: [aberto\ndescription: Y\n---\n\ncorpo\n";

    expect(() => parseEntry(text)).toThrow(DomainError);
  });
});

describe("identidade", () => {
  it("o nome do arquivo é o par (tipo, slug)", () => {
    expect(entryFilename("feedback", "integridade-de-teste")).toBe(
      "feedback_integridade-de-teste.md",
    );
  });

  it("slug tira acento, símbolo e caixa", () => {
    expect(slugify("Convenção de Commits!")).toBe("convencao-de-commits");
  });

  it("slug nunca vira caminho", () => {
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("a/b")).toBe("a-b");
  });

  it("recusa nome que não produz slug", () => {
    expect(() => slugify("¿?!")).toThrow(DomainError);
  });
});

describe("proposalRefusal — a matriz da Q27", () => {
  const naoHumanos = MEMORY_ACTORS.filter((actor) => actor !== "human");

  it("humano escreve qualquer tipo em qualquer escopo", () => {
    for (const type of MEMORY_TYPES) {
      for (const scope of MEMORY_SCOPES) {
        expect(proposalRefusal(type, scope, "human")).toBeNull();
      }
    }
  });

  it("os três tipos que valem para N projetos são proposta em qualquer escopo, para qualquer não-humano", () => {
    // Um caso por tipo e por ator, e não só `contract` × `agent`: `auto_research`
    // e `distiller` são exatamente os atores que o §7 do context-delivery cobre
    // com "proposta sempre, independentemente da evidência".
    for (const type of ["domain", "process", "contract"] as const) {
      for (const actor of naoHumanos) {
        for (const scope of MEMORY_SCOPES) {
          expect(proposalRefusal(type, scope, actor)).toContain("Q27");
        }
      }
    }
  });

  it("escrever para cima é proposta mesmo para os tipos que vão direto", () => {
    // Só pelo tipo, um `project` gravado com `scope: "workspace"` subiria direto
    // — e "escrita para cima é revisada" é a assimetria do §11.
    for (const type of ["user", "feedback", "project", "reference"] as const) {
      for (const actor of naoHumanos) {
        expect(proposalRefusal(type, "workspace", actor)).toContain("escopo workspace");
        expect(proposalRefusal(type, "global", actor)).toContain("escopo global");
      }
    }
  });

  it("o que sobra indo direto é `project` e `reference` no escopo deles", () => {
    for (const actor of naoHumanos) {
      expect(proposalRefusal("project", "project", actor)).toBeNull();
      expect(proposalRefusal("reference", "project", actor)).toBeNull();
      // E o inverso, para o teste não passar por vacuidade: `user` e `feedback`
      // não têm escopo de projeto como default, mas pedido explicitamente também
      // vão direto — a regra é a dos dois eixos, não uma lista de tipos.
      expect(proposalRefusal("user", "project", actor)).toBeNull();
    }
  });
});

describe("escopo default por tipo", () => {
  it("deriva do tipo quando ninguém diz", () => {
    expect(resolveScope("user")).toBe("global");
    expect(resolveScope("project")).toBe("project");
    expect(resolveScope("domain")).toBe("workspace");
  });

  it("contrato é do workspace: ele é um fato entre dois projetos", () => {
    expect(DEFAULT_SCOPE_FOR_TYPE.contract).toBe("workspace");
  });

  it("escopo explícito vence o default", () => {
    expect(resolveScope("user", "project")).toBe("project");
  });
});
