import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { memoryCoreKey, memoryListKey, memoryProposalsKey } from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { MemoryPanel } from "./MemoryPanel.js";

/**
 * O workspace sem acervo — um dos cinco estados caros que o
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)
 * promete e a galeria não tinha (`032-web-architecture` T33).
 *
 * O `QueryClient` chega com o cache já preenchido — `entries: []`, o núcleo
 * vazio e nenhuma proposta pendente —, pelo mesmo mecanismo de
 * `seededQueryClient` (ver o comentário lá): sem isso `useMemoryList` e
 * `useMemoryCore` chamariam `trpc.memory.*.query` de verdade, batendo numa
 * `/trpc` que a galeria não serve.
 */

const WORKSPACE_ID = "ws-galeria";

const queryClient = seededQueryClient([
  [memoryListKey(WORKSPACE_ID, null), { entries: [], shadowed: [] }],
  [memoryCoreKey(WORKSPACE_ID, null), { chars: 0, recentChars: 0, entries: [] }],
  [memoryProposalsKey("pending"), []],
]);

const meta: Meta<typeof MemoryPanel> = {
  title: "Memória/MemoryPanel",
  component: MemoryPanel,
};

export default meta;

type Story = StoryObj<typeof MemoryPanel>;

export const SemAcervo: Story = {
  name: "Workspace sem acervo",
  render: () => (
    <QueryClientProvider client={queryClient}>
      <div className="sg__panel">
        <MemoryPanel workspaceId={WORKSPACE_ID} projectId={null} />
      </div>
    </QueryClientProvider>
  ),
};
