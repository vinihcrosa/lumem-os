import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* O mock antes do componente, pela mesma razão do `board-notice.test.tsx`. */
import { installTrpcDefaults, trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", () => ({ trpc: trpcMock }));

import { Board } from "./Board.js";
import type { BoardCard } from "../lib/board.js";

/**
 * O arrasto sob o filtro (`028` §4.3).
 *
 * **A posição é a prioridade**, e o daemon renumera a coluna inteira a partir do
 * `index` que a tela manda. O que está sob teste aqui é a única coisa que a tela
 * decide nesse gesto: **qual número ela manda** — e ele sai da coluna inteira,
 * não da lista que o filtro deixou na frente.
 *
 * Não havia teste nenhum de arrasto antes deste arquivo, o que é o que fez o
 * defeito caber nas colunas da máquina sem ninguém ver: em `open` e
 * `ready_to_merge` o filtro não esconde nada, e os dois índices coincidem.
 */

const mock = trpcMock;
const NOW = new Date("2026-09-14T12:00:00Z").getTime();
const agesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function card(patch: Partial<BoardCard> & { id: string }): BoardCard {
  return {
    title: patch.id,
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
    ...patch,
  };
}

/**
 * Três cartões em `in_progress`, e **o primeiro some sob o filtro**.
 *
 * `escondido` está em `in_progress` há um instante, sem bloqueio: o `needsYou`
 * não o pega. Os outros dois ficam — um bloqueado, um encalhado —, e é a
 * distância entre `[bloqueado, encalhado]` e `[escondido, bloqueado, encalhado]`
 * que o gesto tem que atravessar.
 */
function scene() {
  return [
    { status: "backlog", cards: [] },
    { status: "open", cards: [card({ id: "arrastado" })] },
    {
      status: "in_progress",
      cards: [
        card({ id: "escondido" }),
        card({ id: "bloqueado", seal: { kind: "blocked", reason: "o teste falhou" } }),
        card({ id: "encalhado", statusChangedAt: agesAgo(180) }),
      ],
    },
    { status: "review", cards: [] },
    { status: "testing", cards: [] },
    { status: "ready_to_merge", cards: [] },
    { status: "done", cards: [] },
  ];
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Board workspaceId="w1" onOpen={vi.fn()} now={NOW} />
    </QueryClientProvider>,
  );
}

/** O `dataTransfer` que o jsdom não monta sozinho. */
const transfer = () => ({ dataTransfer: { setData: vi.fn(), effectAllowed: "" } });

function cardAt(title: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(title) });
}

/** A `div` que recebe o `drop`: o cartão é um `<button>` dentro dela. */
function slotOf(title: string): HTMLElement {
  return cardAt(title).parentElement!;
}

async function dragOnto(source: string, target: string) {
  fireEvent.dragStart(cardAt(source), transfer());
  fireEvent.drop(slotOf(target), transfer());
  await waitFor(() => {
    expect(mock.task.move.mutate).toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  mock.task.board.query.mockResolvedValue(scene());
  mock.task.move.mutate.mockResolvedValue({});
});

describe("o índice do arrasto é da coluna, não da tela", () => {
  it("com `precisa de mim` ligado, soltar sobre um cartão manda a posição real", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /precisa de mim/ }));
    // O filtro escondeu o primeiro: o que a tela mostra é `[bloqueado, encalhado]`.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /escondido/ })).toBeNull();
    });

    await dragOnto("arrastado", "encalhado");

    /*
     * `2`, e não `1`. O daemon não sabe que existe filtro — ele lê o índice como
     * posição na coluna e renumera a coluna toda, e posição é prioridade. Mandar
     * o índice da lista filtrada grava a prioridade errada, e ela persiste.
     */
    expect(mock.task.move.mutate).toHaveBeenCalledWith({
      id: "arrastado",
      status: "in_progress",
      index: 2,
    });
  });

  it("soltar no corpo da coluna é o fim da coluna inteira", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /precisa de mim/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /escondido/ })).toBeNull();
    });

    fireEvent.dragStart(cardAt("arrastado"), transfer());
    fireEvent.drop(slotOf("encalhado").parentElement!, transfer());

    // Três, que é o tamanho da coluna — e não dois, que é o da lista visível.
    // Inserir no meio quando o gesto disse *no fim* é a mesma prioridade errada.
    await waitFor(() => {
      expect(mock.task.move.mutate).toHaveBeenCalledWith({
        id: "arrastado",
        status: "in_progress",
        index: 3,
      });
    });
  });

  it("com o filtro desligado o número é o mesmo de sempre", async () => {
    // A tradução não é regra nova: sem filtro, os dois índices coincidem, e este
    // caso é o que impede o conserto de virar uma mudança de comportamento.
    renderBoard();
    await screen.findByRole("button", { name: /encalhado/ });

    await dragOnto("arrastado", "encalhado");

    expect(mock.task.move.mutate).toHaveBeenCalledWith({
      id: "arrastado",
      status: "in_progress",
      index: 2,
    });
  });
});
