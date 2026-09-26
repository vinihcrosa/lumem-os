import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { BOARD_COLUMNS, type BoardCard, type BoardColumn, type BoardStatus } from "@lumem/shared";

import { boardKey } from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { Board } from "./Board.js";

/**
 * O orçamento bloqueado — um dos cinco estados caros que o
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)
 * promete e a galeria não tinha (`032-web-architecture` T33).
 *
 * A frase do cartão bloqueado é a mesma que `budget.ts` produz de verdade
 * (`028-autonomous-orchestration` Parte 3): *"parou no teto do workspace — 60
 * turnos por sessão"*. `notice` fica `null` nos quatro cartões de propósito —
 * um `notice` preenchido dispararia `trpc.task.markNotified.mutate` de
 * verdade dentro de `useBoardNotices` no primeiro `useEffect`, que é
 * exatamente a chamada de rede que a story existe para não fazer.
 */

const WORKSPACE_ID = "ws-galeria";
const NOW = new Date("2026-09-21T12:00:00Z").getTime();

const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function card(overrides: Partial<BoardCard> & Pick<BoardCard, "id" | "title">): BoardCard {
  return {
    projectId: "p1",
    projectName: "lorebase",
    worktreeId: null,
    worktreeName: null,
    branch: null,
    position: 0,
    statusChangedAt: minutesAgo(10),
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

const CARDS: Partial<Record<BoardStatus, BoardCard[]>> = {
  open: [card({ id: "t1", title: "o /orders devolve 500" })],
  in_progress: [
    card({
      id: "t2",
      title: "corrigir o parser de frontmatter vazio",
      seal: { kind: "working", role: "implementador", since: minutesAgo(6) },
    }),
  ],
  review: [
    card({
      id: "t3",
      title: "extrair useConversationSession do componente",
      seal: { kind: "blocked", reason: "parou no teto do workspace — 60 turnos por sessão" },
      attempts: 2,
      tokens: 184_302,
      cost: 3.41,
      currency: "USD",
      turns: 60,
    }),
  ],
  ready_to_merge: [card({ id: "t4", title: "renomear .tc para .tool-card", statusChangedAt: minutesAgo(20) })],
};

const COLUMNS: readonly BoardColumn[] = BOARD_COLUMNS.map((status) => ({
  status,
  cards: CARDS[status] ?? [],
}));

const queryClient = seededQueryClient([[boardKey(WORKSPACE_ID, null), COLUMNS]]);

const meta: Meta<typeof Board> = {
  title: "Tarefas/Board",
  component: Board,
};

export default meta;

type Story = StoryObj<typeof Board>;

export const OrcamentoBloqueado: Story = {
  name: "Orçamento bloqueado",
  render: () => (
    <QueryClientProvider client={queryClient}>
      <Board workspaceId={WORKSPACE_ID} onOpen={() => undefined} now={NOW} />
    </QueryClientProvider>
  ),
};
