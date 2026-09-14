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
  // `implementador` é o default porque é o único papel cujo portão lê commit e
  // `test`. O do revisor lê parecer, e tem bloco próprio no fim do arquivo.
  role: "implementador",
  findings: null,
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

describe("o portão do revisor lê parecer, e não commit (Parte 7 — Q67)", () => {
  /*
   * O defeito medido em 2026-09-14: o mesmo `committed` julgava os três papéis,
   * e ele é *árvore limpa **e** à frente da base* — que fica verdadeiro para
   * sempre depois do primeiro commit do implementador. O revisor **reprovou
   * duas vezes** e o daemon registrou `portão verde` nas duas.
   */
  const review = (patch: Partial<GateFacts> = {}): GateFacts =>
    facts({ role: "revisor", committed: false, hasTest: true, testExitCode: 1, ...patch });

  it("sem parecer nenhum é `unfinished` — o turno não entregou", () => {
    // Diferente de lista vazia: aqui o revisor **calou**, e deixar o cartão
    // andar por silêncio é o portão falhando aberto.
    expect(review({ findings: null })).toBeDefined();
    expect(decideGate(review({ findings: null }))).toEqual({
      kind: "unfinished",
      reason: "o revisor não deixou parecer",
    });
  });

  it("parecer vazio **passa** — é o revisor dizendo que não achou nada que segure", () => {
    /*
     * E passa **apesar** de `committed: false` e `testExitCode: 1`: o que o
     * revisor entrega não é código, e cobrar commit dele é o defeito de 14/09
     * ao contrário.
     */
    expect(
      decideGate(review({ findings: { reproduced: [], refuted: 0, notes: 0 } })),
    ).toEqual({ kind: "pass" });
  });

  it("um achado que **reproduziu** segura, e a frase é a dele", () => {
    expect(
      decideGate(
        review({
          findings: {
            reproduced: [{ title: "mutante sobrevivente na linha 194", command: "pnpm vitest" }],
            refuted: 0,
            notes: 0,
          },
        }),
      ),
    ).toEqual({ kind: "fail", reason: "mutante sobrevivente na linha 194" });
  });

  it("com mais de um, a frase diz quantos — o cartão tem 151px", () => {
    expect(
      decideGate(
        review({
          findings: {
            reproduced: [
              { title: "mutante na 194", command: "a" },
              { title: "o job nunca rodou", command: "b" },
            ],
            refuted: 0,
            notes: 0,
          },
        }),
      ),
    ).toMatchObject({ kind: "fail", reason: "mutante na 194 (e mais 1 reproduzidos)" });
  });

  it("um achado que **não** reproduziu não segura", () => {
    // Reprodução inventada cai sozinha, e é a defesa que o balde `blocks` tem.
    expect(
      decideGate(review({ findings: { reproduced: [], refuted: 3, notes: 0 } })),
    ).toEqual({ kind: "pass" });
  });

  it("anotações não seguram nada, por mais que sejam", () => {
    /*
     * É a metade da Q67 que responde *"toda vez que você pede um review, o
     * agente acha alguma coisa"*: ele acha quanto quiser, e o que não é
     * reproduzível vai para a PR em vez de travar a esteira.
     */
    expect(
      decideGate(review({ findings: { reproduced: [], refuted: 0, notes: 9 } })),
    ).toEqual({ kind: "pass" });
  });
});
