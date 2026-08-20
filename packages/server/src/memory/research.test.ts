import { describe, expect, it, vi } from "vitest";

import { research } from "./research.js";

const ANSWER = JSON.stringify({
  answer: "O checkout expõe POST /v2/checkout.",
  memories: [
    {
      type: "project",
      name: "Endpoint de checkout",
      description: "o caminho que o web consome",
      body: "POST /v2/checkout, com cupom opcional.",
      evidence: "src/api/checkout.ts:88",
    },
  ],
});

describe("research", () => {
  it("responde, e separa a evidência do corpo", async () => {
    const result = await research({ question: "qual é o endpoint de checkout?", ask: () => Promise.resolve(ANSWER) });

    expect(result.degraded).toBeNull();
    expect(result.answer?.answer).toContain("/v2/checkout");
    // Separada porque é ela que decide direto × proposta (D7).
    expect(result.answer?.memories[0]?.evidence).toBe("src/api/checkout.ts:88");
  });

  it("resposta sem nada durável é resposta: nem tudo vale guardar", async () => {
    const result = await research({
      question: "quantos testes rodaram?",
      ask: () => Promise.resolve('{"answer": "2164", "memories": []}'),
    });

    expect(result.degraded).toBeNull();
    expect(result.answer?.memories).toEqual([]);
  });

  it("timeout degrada, e diz que foi timeout", async () => {
    const warns: string[] = [];
    const result = await research({
      question: "algo",
      ask: () => new Promise(() => {/* nunca resolve */}),
      timeoutMs: 20,
      log: { warn: (_object, message) => void warns.push(message) },
    });

    // A sessão principal está esperando: uma pergunta que sobe agente não pode
    // demorar o que um agente demora.
    expect(result).toEqual({ answer: null, degraded: "timeout" });
    expect(warns[0]).toContain("timeout");
  });

  it("agente que não sobe degrada, e não estoura", async () => {
    const result = await research({
      question: "algo",
      ask: () => Promise.reject(new Error("nenhum agente ACP configurado")),
    });

    expect(result).toEqual({ answer: null, degraded: "failed" });
  });

  it("prosa não vira resposta", async () => {
    const result = await research({
      question: "algo",
      ask: () => Promise.resolve("Acho que é /v2/checkout, mas não olhei."),
    });

    expect(result.degraded).toBe("unparseable");
  });

  it("o prompt cobra a fonte, que é o que decide o destino da resposta", async () => {
    const ask = vi.fn().mockResolvedValue(ANSWER);

    await research({ question: "qual é o endpoint?", ask });

    const prompt = ask.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("cite de onde tirou");
    expect(prompt).toContain("Não invente");
    expect(prompt).toContain("qual é o endpoint?");
  });
});
