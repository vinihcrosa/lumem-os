import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BoardCard } from "../lib/board.js";
import { TaskCard } from "./TaskCard.js";

/**
 * O que a esteira acrescentou ao cartão (`028` Parte 2, T31 e T32).
 *
 * O jsdom não aplica folha de estilo, então o que cabe aqui é **o que aparece e
 * o que não aparece** — a pintura é do `board-css.test.ts` e a prova de que nada
 * fica recortado é do e2e, que é a lição da `023`.
 */

const NOW = new Date("2026-09-13T12:00:00Z").getTime();

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
    attempts: 0,
    autonomy: "inherit",
    preparedPrompt: null,
    queuedBeyondSlots: false,
    notice: null,
    seal: { kind: "manual" },
    ...overrides,
  };
}

describe("a tentativa só aparece quando é maior que um", () => {
  it("uma tentativa não é escrita", () => {
    render(<TaskCard status="in_progress" card={card({ attempts: 1 })} now={NOW} onOpen={vi.fn()} />);

    // `tentativa 1` é o caso de toda tarefa que a esteira pegou. Escrevê-lo em
    // todo cartão seria um número que não distingue nada de nada.
    expect(screen.queryByText(/tentativa/)).toBeNull();
  });

  it("a segunda é", () => {
    render(<TaskCard status="in_progress" card={card({ attempts: 2 })} now={NOW} onOpen={vi.fn()} />);

    expect(screen.getByText("tentativa 2")).toBeInTheDocument();
  });
});

describe("o cartão bloqueado diz do quê", () => {
  it("o motivo aparece inteiro, e não só no selo", () => {
    render(
      <TaskCard
        status="in_progress"
        card={card({ seal: { kind: "blocked", reason: "o teste do projeto falhou (saída 1)" } })}
        now={NOW}
        onOpen={vi.fn()}
      />,
    );

    /*
     * Duas vezes de propósito: o selo tem **151px medidos** e trunca, e o
     * bloqueio que não diz do quê é um alarme, não um aviso. A linha de baixo é
     * onde a frase inteira cabe, com corte em três linhas.
     */
    expect(screen.getByText(/bloqueada:/)).toBeInTheDocument();
    expect(screen.getByText("o teste do projeto falhou (saída 1)")).toBeInTheDocument();
  });

  it("um cartão que não está bloqueado não ganha a linha", () => {
    render(<TaskCard status="in_progress" card={card()} now={NOW} onOpen={vi.fn()} />);

    expect(document.querySelector(".tcard__ask")).toBeNull();
  });
});

describe("o `assistido` mostra o que ia ser enviado", () => {
  it("o prompt preparado aparece, e com ele o verbo que envia", () => {
    const onSend = vi.fn();
    render(
      <TaskCard
        status="in_progress"
        card={card({ preparedPrompt: "Implemente a tarefa abaixo neste checkout." })}
        now={NOW}
        onOpen={vi.fn()}
        onSend={onSend}
      />,
    );

    // A promessa do degrau: *"você vê o que ele **ia** fazer"*.
    expect(screen.getByText("Implemente a tarefa abaixo neste checkout.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "enviar" })).toBeInTheDocument();
  });

  it("clicar em enviar não abre a tarefa", () => {
    const onOpen = vi.fn();
    const onSend = vi.fn();
    render(
      <TaskCard
        status="in_progress"
        card={card({ preparedPrompt: "faça isto" })}
        now={NOW}
        onOpen={onOpen}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "enviar" }));

    /*
     * Sem o `stopPropagation`, o clique sobe até o cartão — que é um `<button>`
     * inteiro — e abre a conversa: você aprovaria e cairia na tela sem ter
     * enviado, que é o oposto do gesto.
     */
    expect(onSend).toHaveBeenCalledWith("t1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sem quem enviar, o verbo não aparece", () => {
    render(<TaskCard status="in_progress" card={card({ preparedPrompt: "faça isto" })} now={NOW} onOpen={vi.fn()} />);

    // Um botão que não faz nada é pior que nenhum: ele promete um gesto.
    expect(screen.queryByRole("button", { name: "enviar" })).toBeNull();
  });

  it("sem nada preparado, nem a linha nem o verbo", () => {
    render(<TaskCard status="in_progress" card={card()} now={NOW} onOpen={vi.fn()} onSend={vi.fn()} />);

    expect(document.querySelector(".tcard__act")).toBeNull();
  });
});

describe("o relógio do rodapé é pintado, e a coluna é quem diz", () => {
  /** Duas horas é o `over` de `in_progress`; meia hora é o `warn`. */
  const sinceMinutes = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

  it("âmbar e vermelho saem da coluna em que o cartão está", () => {
    /*
     * `BoardCard` **não tem `status`**: o daemon agrupa a resposta por coluna, e
     * ela mora no grupo. Chamando `staleLevel(card, now)` sem o terceiro
     * argumento, a função lia `undefined`, devolvia `null` para todo cartão e o
     * modificador nunca era aplicado — a cor de encalhe por cartão ficava morta
     * com o ponto agregado do cabeçalho continuando certo, que é o jeito mais
     * caro de esconder um defeito.
     */
    const { rerender } = render(
      <TaskCard
        status="in_progress"
        card={card({ statusChangedAt: sinceMinutes(45) })}
        now={NOW}
        onOpen={vi.fn()}
      />,
    );
    expect(document.querySelector(".stale--warn")).not.toBeNull();

    rerender(
      <TaskCard
        status="in_progress"
        card={card({ statusChangedAt: sinceMinutes(180) })}
        now={NOW}
        onOpen={vi.fn()}
      />,
    );
    expect(document.querySelector(".stale--over")).not.toBeNull();
  });

  it("a mesma idade em `open` não cobra nada", () => {
    // `To-Do` não tem limiar: com teto, estar parado ali é o desenho — e cobrar
    // o que é desenho é a forma mais rápida de tornar o aviso invisível.
    render(
      <TaskCard
        status="open"
        card={card({ statusChangedAt: sinceMinutes(180) })}
        now={NOW}
        onOpen={vi.fn()}
      />,
    );

    expect(document.querySelector(".stale--warn")).toBeNull();
    expect(document.querySelector(".stale--over")).toBeNull();
  });
});

describe("`parar` só aparece quando há o que parar (Q57)", () => {
  const working = { kind: "working" as const, role: "implementador" as const, since: new Date().toISOString() };

  it("um cartão com turno em voo oferece o verbo", () => {
    render(<TaskCard status="in_progress" card={card({ seal: working })} now={NOW} onOpen={vi.fn()} onStop={vi.fn()} />);

    expect(screen.getByRole("button", { name: "parar" })).toBeInTheDocument();
  });

  it("um cartão parado não oferece", () => {
    render(<TaskCard status="in_progress" card={card()} now={NOW} onOpen={vi.fn()} onStop={vi.fn()} />);

    // O verbo custa: ele interrompe um turno pago. Oferecê-lo onde ninguém está
    // trabalhando seria um botão que não faz nada visível — e um botão assim
    // ensina que os outros também não fazem.
    expect(screen.queryByRole("button", { name: "parar" })).toBeNull();
  });

  it("clicar em parar não abre a tarefa", () => {
    const onOpen = vi.fn();
    const onStop = vi.fn();
    render(<TaskCard status="in_progress" card={card({ seal: working })} now={NOW} onOpen={onOpen} onStop={onStop} />);

    fireEvent.click(screen.getByRole("button", { name: "parar" }));

    // Mesma armadilha do `enviar`, e a razão de os dois verbos serem a mesma
    // peça: sem o `stopPropagation` o clique sobe até o cartão.
    expect(onStop).toHaveBeenCalledWith("t1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
