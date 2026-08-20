import { describe, expect, it, vi } from "vitest";

import { distill } from "./distiller.js";
import { EMPTY_PROJECTION, type SessionProjection } from "./projection.js";

const DID_WORK: SessionProjection = {
  ...EMPTY_PROJECTION,
  files: [{ path: "src/loader.ts", touches: 3 }],
  commands: ["Bash pnpm gate:quick"],
  turns: 2,
};

const ONE = JSON.stringify({
  memories: [
    {
      type: "process",
      name: "O gate rápido",
      description: "o gate que vale é o que a task declara",
      body: "Rode `pnpm gate:quick` antes de dizer que acabou.",
      evidence: "package.json:17",
    },
  ],
});

describe("distill", () => {
  it("desligada por padrão: não chama agente nenhum", async () => {
    const ask = vi.fn();

    const result = await distill({ enabled: false, projection: DID_WORK, ask });

    expect(result).toEqual({ candidates: [], skipped: "disabled" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("sessão que não fez nada não custa uma sessão de agente", async () => {
    const ask = vi.fn();

    const result = await distill({ enabled: true, projection: EMPTY_PROJECTION, ask });

    // Subir um agente para receber lista vazia custaria os ~39k tokens de prompt
    // de sistema que o spike mediu.
    expect(result.skipped).toBe("nothing_happened");
    expect(ask).not.toHaveBeenCalled();
  });

  it("uma chamada por sessão, e o candidato sai estruturado", async () => {
    const ask = vi.fn().mockResolvedValue(ONE);

    const result = await distill({ enabled: true, projection: DID_WORK, ask });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.candidates).toEqual([
      {
        type: "process",
        name: "O gate rápido",
        description: "o gate que vale é o que a task declara",
        body: "Rode `pnpm gate:quick` antes de dizer que acabou.",
        evidence: "package.json:17",
      },
    ]);
  });

  it("aceita a embalagem, valida o conteúdo", async () => {
    const ask = vi.fn().mockResolvedValue(`Claro! Aqui está:\n\`\`\`json\n${ONE}\n\`\`\`\n`);

    const result = await distill({ enabled: true, projection: DID_WORK, ask });

    // Recusar por causa da cerca de código seria recusar a resposta certa pela
    // embalagem; aceitar qualquer coisa seria gravar prosa como memória.
    expect(result.candidates).toHaveLength(1);
  });

  it("prosa não vira memória", async () => {
    const ask = vi.fn().mockResolvedValue("Achei que o loader lê o frontmatter, e é isso.");

    const result = await distill({ enabled: true, projection: DID_WORK, ask });

    expect(result).toEqual({ candidates: [], skipped: "unparseable" });
  });

  it("candidato sem tipo válido é descartado inteiro, não consertado", async () => {
    const ask = vi.fn().mockResolvedValue(
      JSON.stringify({ memories: [{ type: "anotacao", name: "x", description: "y", body: "z" }] }),
    );

    const result = await distill({ enabled: true, projection: DID_WORK, ask });

    expect(result.skipped).toBe("unparseable");
  });

  it("agente que não sobe não quebra nada", async () => {
    const warns: string[] = [];
    const result = await distill({
      enabled: true,
      projection: DID_WORK,
      ask: () => Promise.reject(new Error("nenhum agente ACP configurado")),
      log: { warn: (_object, message) => void warns.push(message) },
    });

    expect(result.skipped).toBe("no_answer");
    expect(warns).toHaveLength(1);
  });

  it("o prompt carrega o teste de fronteira, porque é onde ele muda o resultado", async () => {
    const ask = vi.fn().mockResolvedValue('{"memories": []}');

    await distill({ enabled: true, projection: DID_WORK, ask });

    const prompt = ask.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("muda o que alguém **faz**");
    expect(prompt).toContain("src/loader.ts");
    // E nada da conversa: a projeção não tem prosa, então o prompt não tem.
    expect(prompt).not.toContain("hunter2");
  });
});
