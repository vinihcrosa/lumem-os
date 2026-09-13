import { describe, expect, it } from "vitest";

import { needsYou, staleCount, staleLevel, type BoardCard, type BoardColumn } from "../lib/board.js";
import { columnsOutside } from "./Board.js";
import { elapsed, sealModifier, sealText } from "./TaskSeal.js";

/**
 * As regras do quadro que **não** são pintura (`028` T9–T11).
 *
 * O jsdom não aplica folha de estilo, então o que cabe testar aqui é decisão:
 * o texto do selo, os limiares de encalhe, e o que o filtro *precisa de mim*
 * deixa passar. A pintura é do `board-css.test.ts`, e a prova de que nada fica
 * recortado por ancestral é do e2e (T12) — com `document.elementFromPoint`, e
 * não `toBeVisible`, que é a lição da `023`.
 */

const NOW = new Date("2026-09-12T12:00:00Z").getTime();

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "t1",
    title: "o /orders devolve 500",
    projectId: "p1",
    projectName: "acme-api",
    worktreeId: null,
    worktreeName: null,
    branch: null,
    position: 0,
    statusChangedAt: new Date(NOW).toISOString(),
    tokens: 0,
    cost: null,
    currency: null,
    turns: 0,
    createdBy: "human",
    links: [],
    seal: { kind: "manual" },
    ...overrides,
  };
}

const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("o selo diz o verbo, e a coluna diz o papel", () => {
  it("o default do produto é ninguém pega", () => {
    expect(sealText({ kind: "manual" }, NOW)).toBe("manual — ninguém pega");
  });

  it("trabalhando devolve o verbo, esperando devolve o substantivo", () => {
    // `revisor trabalhando há 2 min` pede 168px numa caixa de 151 medidos. O
    // papel já está no cabeçalho da coluna; esperando, ele volta, porque aí não
    // é redundante — é o que falta.
    expect(sealText({ kind: "working", role: "revisor", since: minutesAgo(2) }, NOW)).toBe(
      "revisando há 2 min",
    );
    expect(sealText({ kind: "waiting", role: "implementador" }, NOW)).toBe(
      "aguardando implementador",
    );
  });

  it("numa coluna sem papel, o verbo é o genérico dos três", () => {
    expect(sealText({ kind: "working", role: null, since: minutesAgo(2) }, NOW)).toBe(
      "trabalhando há 2 min",
    );
  });

  it("o relógio nunca conta segundos", () => {
    // O selo é lido de relance: `há 47 s` muda a cada segundo e não diz nada
    // que `agora` não diga.
    expect(elapsed(minutesAgo(0.5), NOW)).toBe("agora");
    expect(elapsed(minutesAgo(12), NOW)).toBe("12 min");
    expect(elapsed(minutesAgo(120), NOW)).toBe("2 h");
    expect(elapsed(minutesAgo(60 * 26), NOW)).toBe("1 d");
  });

  it("a barra de 2px carrega um eixo só — o selo", () => {
    expect(sealModifier({ kind: "manual" })).toBe("manual");
    expect(sealModifier({ kind: "working", role: null, since: minutesAgo(1) })).toBe("work");
    expect(sealModifier({ kind: "waiting", role: "revisor" })).toBe("wait");
    expect(sealModifier({ kind: "blocked", reason: "teto do workspace" })).toBe("blocked");
  });
});

describe("o relógio só conta o tempo em que o cartão podia ter andado", () => {
  it("as três etapas da máquina cobram em 30 min e em 2 h", () => {
    expect(staleLevel(card({ statusChangedAt: minutesAgo(29) }), NOW, "in_progress")).toBeNull();
    expect(staleLevel(card({ statusChangedAt: minutesAgo(31) }), NOW, "review")).toBe("warn");
    expect(staleLevel(card({ statusChangedAt: minutesAgo(121) }), NOW, "testing")).toBe("over");
  });

  it("o fim da esteira é você, e você tem uma vida", () => {
    expect(staleLevel(card({ statusChangedAt: minutesAgo(120) }), NOW, "ready_to_merge")).toBeNull();
    expect(staleLevel(card({ statusChangedAt: minutesAgo(241) }), NOW, "ready_to_merge")).toBe("warn");
  });

  it("a To-Do não cobra, porque estar parado ali é o desenho", () => {
    // Com teto, uma tarefa esperando vaga está esperando desenho — e cobrar o
    // que é desenho é a forma mais rápida de tornar o aviso invisível.
    expect(staleLevel(card({ statusChangedAt: minutesAgo(60 * 24 * 3) }), NOW, "open")).toBeNull();
    expect(staleLevel(card({ statusChangedAt: minutesAgo(60 * 24 * 3) }), NOW, "backlog")).toBeNull();
  });

  it("cota não é encalhe: ela volta sozinha", () => {
    const paused = card({
      statusChangedAt: minutesAgo(300),
      seal: { kind: "paused", until: new Date(NOW + 3_600_000).toISOString() },
    });

    expect(staleLevel(paused, NOW, "in_progress")).toBeNull();
  });

  it("o ponto do cabeçalho agrega a coluna", () => {
    const column: BoardColumn = {
      status: "review",
      cards: [
        card({ id: "a", statusChangedAt: minutesAgo(5) }),
        card({ id: "b", statusChangedAt: minutesAgo(45) }),
        card({ id: "c", statusChangedAt: minutesAgo(200) }),
      ],
    };

    expect(staleCount(column, NOW)).toEqual({ warn: 1, over: 1 });
  });
});

describe("precisa de mim", () => {
  it("deixa passar o bloqueio, o encalhe e a sua vez", () => {
    const blocked = card({ seal: { kind: "blocked", reason: "teto do agente" } });
    const stalled = card({ statusChangedAt: minutesAgo(90) });

    expect(needsYou(blocked, "in_progress", NOW)).toBe(true);
    expect(needsYou(stalled, "review", NOW)).toBe(true);
    expect(needsYou(card(), "ready_to_merge", NOW)).toBe(true);
    expect(needsYou(card(), "open", NOW)).toBe(true);
  });

  it("tira o que anda sozinho", () => {
    const working = card({ seal: { kind: "working", role: "revisor", since: minutesAgo(3) } });

    expect(needsYou(working, "review", NOW)).toBe(false);
    expect(needsYou(card(), "in_progress", NOW)).toBe(false);
  });

  it("Done não precisa de você — ele já é o fim", () => {
    expect(needsYou(card(), "done", NOW)).toBe(false);
  });
});

describe("abaixo do piso, o quadro diz que está rolando", () => {
  it("não avisa quando cabe", () => {
    expect(columnsOutside(1200, 1200)).toBe(0);
  });

  it("conta pelo que transbordou, em colunas de piso", () => {
    // O piso é 200px e é medido: abaixo dele o título vira três linhas e a
    // linha viva perde o nome do arquivo.
    expect(columnsOutside(1418, 1218)).toBe(1);
    expect(columnsOutside(1418, 1018)).toBe(2);
  });

  it("um pixel a menos já é uma coluna fora — e não meia", () => {
    // Arredondar para baixo daria "0 colunas fora da tela" com uma coluna
    // cortada ao meio, que é a forma mais educada de mentir.
    expect(columnsOutside(1419, 1418)).toBe(1);
  });

  it("é do quadro, não da janela", () => {
    // A janela pode ter 3440px e o quadro estar espremido porque o painel
    // direito abriu. Quem sabe a largura é quem transborda.
    expect(columnsOutside(2000, 1500)).toBe(3);
  });
});
