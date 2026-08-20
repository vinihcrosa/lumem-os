import { describe, expect, it } from "vitest";

import { classifyEvidence, markUnverified, routeFor, UNVERIFIED_MARK } from "./evidence.js";

describe("classifyEvidence", () => {
  it("caminho com linha é verificável: dá para conferir", () => {
    expect(classifyEvidence("src/lore/loader.ts:42")).toBe("verifiable");
    expect(classifyEvidence("o formato vem de packages/shared/src/acp-protocol.ts:229")).toBe(
      "verifiable",
    );
  });

  it("comando com saída é verificável", () => {
    expect(classifyEvidence("$ pnpm gate:quick → 2164 passed")).toBe("verifiable");
  });

  it("conclusão não é evidência, mesmo bem escrita", () => {
    // O custo de tratar fato como proposta é uma revisão sua; o de tratar
    // conclusão como fato é uma invenção que N projetos herdam.
    expect(classifyEvidence("concluí que o endpoint é /v2/checkout")).toBe("inference");
    expect(classifyEvidence("provavelmente src/api.ts:10")).toBe("inference");
    expect(classifyEvidence("o padrão do time é esse")).toBe("inference");
  });

  it("evidência vazia é conclusão: ausência não é evidência de nada", () => {
    expect(classifyEvidence(undefined)).toBe("inference");
    expect(classifyEvidence("   ")).toBe("inference");
  });
});

describe("routeFor", () => {
  it("projeto com artefato verificável vira memória direta", () => {
    expect(routeFor({ scope: "project", evidence: "src/api.ts:88" })).toBe("direct");
  });

  it("projeto sem evidência vira proposta", () => {
    expect(routeFor({ scope: "project" })).toBe("proposal");
  });

  it("workspace é proposta sempre, com evidência ou sem (Q27)", () => {
    // Errar ali contamina N projetos, e ninguém revisou.
    expect(routeFor({ scope: "workspace", evidence: "src/api.ts:88" })).toBe("proposal");
  });

  it("global é você, e nada automático escreve sobre você", () => {
    expect(routeFor({ scope: "global", evidence: "src/api.ts:88" })).toBe("proposal");
  });
});

describe("markUnverified", () => {
  it("a marca vai no corpo, que é o que o agente lê", () => {
    const body = markUnverified("O checkout aceita cupom.", "src/api.ts:88");

    expect(body.startsWith(UNVERIFIED_MARK)).toBe(true);
    expect(body).toContain("Evidência: src/api.ts:88");
    expect(body).toContain("O checkout aceita cupom.");
  });

  it("sem evidência, a marca vai sozinha", () => {
    expect(markUnverified("texto", undefined)).toContain(UNVERIFIED_MARK);
    expect(markUnverified("texto", undefined)).not.toContain("Evidência");
  });
});
