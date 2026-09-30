import { describe, expect, it } from "vitest";

import { costPercent, verdictOf, type Measurement } from "./measure-resources.js";

/**
 * O veredito da medição de recursos (`038`, C61). Quem mede — dez sessões, o `ps` de
 * verdade — é o `pnpm measure:resources`; o que se prova aqui é a **conta**, e que ela
 * se recusa a passar quando não mediu.
 */

const ten = (overrides: Partial<Measurement> = {}): Measurement => ({
  samples: 10,
  intervalMs: 3_000,
  nodeCpuMs: 30,
  childCpuMs: 100,
  wallMs: 250,
  processes: 700,
  ...overrides,
});

describe("measure:resources verdict", () => {
  it("adds the daemon's cpu and the ps's per sample, over the interval", () => {
    // (30 + 100) ms em 10 amostras = 13 ms por amostra, a cada 3 s = 0,43%.
    expect(costPercent(ten())).toBeCloseTo(0.4333, 3);
  });

  it("passes under 1% and fails at or above it", () => {
    expect(verdictOf(ten(), true)).toBe("ok");
    // 300 ms em 10 amostras = 30 ms a cada 3 s: exatamente 1%, e o limite é *abaixo* de 1%.
    expect(verdictOf(ten({ nodeCpuMs: 100, childCpuMs: 200 }), true)).toBe("over");
    expect(verdictOf(ten({ nodeCpuMs: 500, childCpuMs: 900 }), true)).toBe("over");
  });

  it("refuses to pass when it did not measure", () => {
    // O amostrador não viu as dez sessões: passar seria medir uma máquina vazia.
    expect(verdictOf(ten(), false)).toBe("invalid");
    // O `ps` não pôde ser medido: a metade do custo ficou de fora, e sem ela o número é bom demais.
    expect(verdictOf(ten({ childCpuMs: null }), true)).toBe("invalid");
    // Onde a leitura não lança filho (Linux), zero é uma medida, e não a falta dela.
    expect(verdictOf(ten({ childCpuMs: 0 }), true)).toBe("ok");
  });
});
