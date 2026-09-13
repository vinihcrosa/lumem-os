import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * O mock **antes** do componente, e a ordem não é estética.
 *
 * O `vi.mock` é içado para cima dos imports, mas a fábrica dele roda na primeira
 * vez que alguém importa `lib/trpc.js` — e quem importa é o `Board`. Com o
 * `Board` acima, a fábrica corre antes de `trpcMock` existir e o erro é
 * `Cannot access '__vi_import_4__' before initialization`, que não fala de
 * nada disto.
 */
import { installTrpcDefaults, trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", () => ({ trpc: trpcMock }));

import { Board } from "./Board.js";
import type { BoardCard } from "../lib/board.js";

/**
 * O aviso do quadro (`028` Parte 4, T36 e T37).
 *
 * O que está sob teste é **quem decide** e **quantas vezes**: a frase vem pronta
 * do daemon, a aba responde *"mostrei"*, e só quem escreveu notifica. Nenhuma
 * dessas perguntas é sobre a `Notification`, que aqui é um espião.
 */

const mock = trpcMock;

function card(patch: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "t1",
    title: "o /orders devolve 500",
    projectId: "p1",
    projectName: "acme-api",
    worktreeId: null,
    worktreeName: null,
    branch: null,
    position: 0,
    statusChangedAt: new Date().toISOString(),
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
    ...patch,
  };
}

function board(cards: BoardCard[]) {
  return [
    { status: "backlog", cards: [] },
    { status: "open", cards: [] },
    { status: "in_progress", cards: [] },
    { status: "review", cards: [] },
    { status: "testing", cards: [] },
    { status: "ready_to_merge", cards },
    { status: "done", cards: [] },
  ];
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Board workspaceId="w1" onOpen={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  vi.stubGlobal(
    "Notification",
    Object.assign(vi.fn(), { permission: "granted", requestPermission: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a frase que some quando você olha", () => {
  it("conta o que o daemon ainda não registrou", async () => {
    mock.task.board.query.mockResolvedValue(
      board([card({ notice: "o /orders devolve 500 está pronta para mesclar" })]),
    );

    renderBoard();

    expect(await screen.findByText("1 parou enquanto você não estava")).toBeInTheDocument();
  });

  it("sem nada a avisar, ela não existe", async () => {
    mock.task.board.query.mockResolvedValue(board([card()]));

    renderBoard();

    // Ela não é modal, não tem `✕` e não guarda preferência: some porque você
    // viu, e nasce ausente quando não há o que ver.
    await waitFor(() => {
      expect(screen.queryByText(/pararam enquanto/)).toBeNull();
      expect(screen.queryByText(/parou enquanto/)).toBeNull();
    });
  });
});

describe("uma vez, sem repetir", () => {
  it("a aba responde `markNotified` e notifica quando foi ela que escreveu", async () => {
    mock.task.board.query.mockResolvedValue(board([card({ notice: "pronta para mesclar" })]));
    mock.task.markNotified.mutate.mockResolvedValue({ first: true });

    renderBoard();

    await waitFor(() => {
      expect(mock.task.markNotified.mutate).toHaveBeenCalledWith({ id: "t1" });
    });
    await waitFor(() => {
      expect(Notification).toHaveBeenCalledWith(
        "Lumem",
        expect.objectContaining({ body: "pronta para mesclar" }),
      );
    });
  });

  it("a segunda aba perde a corrida no daemon e **não** notifica", async () => {
    mock.task.board.query.mockResolvedValue(board([card({ notice: "pronta para mesclar" })]));
    // `first: false` é o daemon dizendo que outra aba já escreveu. Sem esta
    // linha, duas abas abertas dariam dois avisos — que é o que a Q55 recusa, e
    // a razão de o registro não ser do navegador.
    mock.task.markNotified.mutate.mockResolvedValue({ first: false });

    renderBoard();

    await waitFor(() => {
      expect(mock.task.markNotified.mutate).toHaveBeenCalled();
    });
    expect(Notification).not.toHaveBeenCalled();
  });

  it("sem permissão, marca do mesmo jeito", async () => {
    mock.task.board.query.mockResolvedValue(board([card({ notice: "pronta para mesclar" })]));
    mock.task.markNotified.mutate.mockResolvedValue({ first: true });
    vi.stubGlobal(
      "Notification",
      Object.assign(vi.fn(), { permission: "denied", requestPermission: vi.fn() }),
    );

    renderBoard();

    /*
     * O que `notified_at` marca é *"você já teve como saber"*, e a frase do topo
     * — que não depende de permissão nenhuma — já contou. Marcar só com
     * permissão faria o contador repetir para sempre em quem disse não.
     */
    await waitFor(() => {
      expect(mock.task.markNotified.mutate).toHaveBeenCalled();
    });
    expect(Notification).not.toHaveBeenCalled();
  });
});

describe("assumir o volante (Q59)", () => {
  function boardWith(patch: Partial<BoardCard>) {
    return [
      { status: "backlog", cards: [] },
      { status: "open", cards: [] },
      { status: "in_progress", cards: [card(patch)] },
      { status: "review", cards: [] },
      { status: "testing", cards: [] },
      { status: "ready_to_merge", cards: [] },
      { status: "done", cards: [] },
    ];
  }

  it("abrir um cartão que a esteira está tocando desliga a autonomia dele", async () => {
    mock.task.board.query.mockResolvedValue(
      boardWith({ seal: { kind: "working", role: "implementador", since: new Date().toISOString() } }),
    );
    const onOpen = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Board workspaceId="w1" onOpen={onOpen} />
      </QueryClientProvider>,
    );

    (await screen.findByText("o /orders devolve 500")).click();

    await waitFor(() => {
      expect(mock.task.setAutonomy.mutate).toHaveBeenCalledWith({ id: "t1", autonomy: "off" });
    });
    // E abre a conversa do mesmo jeito: assumir é **um** gesto, não dois.
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("abrir um cartão parado é ler, e não desliga nada", async () => {
    mock.task.board.query.mockResolvedValue(boardWith({ seal: { kind: "manual" } }));
    const onOpen = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Board workspaceId="w1" onOpen={onOpen} />
      </QueryClientProvider>,
    );

    (await screen.findByText("o /orders devolve 500")).click();

    /*
     * Sem esta distinção, olhar três cartões desligaria a autonomia dos três
     * **em silêncio**, e o produto ficaria sem esteira com o motivo em lugar
     * nenhum.
     */
    expect(mock.task.setAutonomy.mutate).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("um cartão já assumido não é desligado de novo", async () => {
    mock.task.board.query.mockResolvedValue(
      boardWith({
        autonomy: "off",
        seal: { kind: "working", role: "implementador", since: new Date().toISOString() },
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Board workspaceId="w1" onOpen={vi.fn()} />
      </QueryClientProvider>,
    );

    (await screen.findByText("o /orders devolve 500")).click();

    // Uma escrita que não muda nada é uma invalidação de query que repinta o
    // quadro inteiro por nada.
    expect(mock.task.setAutonomy.mutate).not.toHaveBeenCalled();
  });
});
