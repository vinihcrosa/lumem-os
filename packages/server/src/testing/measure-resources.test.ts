import { describe, expect, it } from "vitest";

import { costPercent, cpuOfTimeOutput, verdictOf, type Measurement } from "./measure-resources.js";

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

describe("the ps cost, read from the system's time", () => {
  it("adds user and sys from time -p, in milliseconds", () => {
    // Uma medição em lote de 50 `ps`: 0,25 s de usuário e 1,00 s de sistema.
    expect(cpuOfTimeOutput("real 1.30\nuser 0.25\nsys 1.00\n")).toBeCloseTo(1_250, 6);
    expect(cpuOfTimeOutput("real 0.02\nuser 0.00\nsys 0.02\n")).toBeCloseTo(20, 6);
  });

  it("answers null for an output that is not time -p's, so the run cannot pass without it", () => {
    expect(cpuOfTimeOutput("")).toBeNull();
    expect(cpuOfTimeOutput("ps: command not found")).toBeNull();
    // Falta uma das duas metades: somar só a que veio é um número bom demais.
    expect(cpuOfTimeOutput("real 0.02\nuser 0.01\n")).toBeNull();
    expect(cpuOfTimeOutput("real 0.02\nsys 0.01\n")).toBeNull();
  });
});
