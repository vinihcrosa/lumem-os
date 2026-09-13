import { describe, expect, it } from "vitest";

import { decideGate, gateStrength, type GateFacts } from "./gate.js";

/**
 * O portão (`028` Parte 2, T28).
 *
 * Função pura, então **todo ramo é exercitável sem processo** — e alguns deles
 * não têm chamador ainda, o que é aceitável aqui e não seria em CSS: um contrato
 * escrito com teste é um contrato; uma classe para marcação que não existe é
 * lixo esperando divergir.
 */

const facts = (patch: Partial<GateFacts> = {}): GateFacts => ({
  committed: true,
  testExitCode: 0,
  hasTest: true,
  pr: null,
  ...patch,
});

describe("sem commit, não há o que julgar", () => {
  it("é `unfinished`, e não `fail`", () => {
    /*
     * A distinção não é cosmética: `fail` diz *"foi feito e está errado"*, que é
     * o que produz parecer e devolve a tarefa. Um turno que morreu no meio não
     * produziu parecer nenhum — produziu uma tentativa gasta.
     */
    expect(decideGate(facts({ committed: false }))).toEqual({
      kind: "unfinished",
      reason: "o turno acabou sem commit",
    });
  });

  it("nem o teste verde salva — commit é a porta de entrada", () => {
    expect(decideGate(facts({ committed: false, testExitCode: 0 })).kind).toBe("unfinished");
  });
});

describe("o teste do projeto", () => {
  it("verde e commitado passa", () => {
    expect(decideGate(facts())).toEqual({ kind: "pass" });
  });

  it("vermelho reprova, e o motivo carrega o código de saída", () => {
    expect(decideGate(facts({ testExitCode: 1 }))).toEqual({
      kind: "fail",
      reason: "o teste do projeto falhou (saída 1)",
    });
  });

  it("declarado e não rodou é `unfinished`, e não vermelho", () => {
    // Tratá-los igual faria um erro de execução do daemon parecer um defeito do
    // código do projeto — e gastaria uma tentativa contra o diagnóstico errado.
    expect(decideGate(facts({ testExitCode: null }))).toEqual({
      kind: "unfinished",
      reason: "o teste do projeto não chegou a rodar",
    });
  });

  it("projeto sem `test` declarado avança com o commit", () => {
    /*
     * A frase desconfortável da Q53, virada asserção: num repositório sem teste
     * a esteira **não tem como saber** que o implementador inventou — a tarefa
     * impossível da medição virou commit em 3 de 4 execuções. A PRD já dizia
     * isso; aqui o produto passa a ter onde mostrar.
     */
    expect(decideGate(facts({ hasTest: false, testExitCode: null }))).toEqual({ kind: "pass" });
  });
});

describe("a PR entra também, e não no lugar", () => {
  it("não haver PR não segura nada", () => {
    // `null` é *não há PR*, que é a maioria dos turnos. Recusar por isso faria
    // a esteira exigir uma PR que ninguém pediu.
    expect(decideGate(facts({ pr: null })).kind).toBe("pass");
  });

  it("bloqueada reprova", () => {
    expect(decideGate(facts({ pr: "blocked" }))).toEqual({
      kind: "fail",
      reason: "a PR está bloqueada",
    });
  });

  it("CI rodando não é veredito", () => {
    // `pending` contra um relógio não é uma falha do trabalho; gastar tentativa
    // com isso seria punir a tarefa pela lentidão do runner.
    expect(decideGate(facts({ pr: "pending" })).kind).toBe("unfinished");
  });

  it("rascunho com teste verde passa", () => {
    // Exigir que a PR saia do rascunho seria a esteira decidindo uma coisa que
    // é sua.
    expect(decideGate(facts({ pr: "draft" })).kind).toBe("pass");
  });

  it("o teste vermelho ganha da PR pronta", () => {
    // A ordem importa: o `test` local é a metade que funciona em quase todo
    // repositório, e ele é lido antes.
    expect(decideGate(facts({ testExitCode: 2, pr: "ready" })).kind).toBe("fail");
  });
});

describe("a força do portão é visível", () => {
  it("diz qual é a melhor garantia que este projeto tem", () => {
    expect(gateStrength({ hasTest: true, pr: "ready" })).toBe("test");
    expect(gateStrength({ hasTest: false, pr: "ready" })).toBe("pr");
    // Nem teste nem PR: só o commit, que é a ausência de garantia. Ela precisa
    // ser visível para não ser confundida com uma.
    expect(gateStrength({ hasTest: false, pr: null })).toBe("commit");
  });
});
