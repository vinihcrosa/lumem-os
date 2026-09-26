import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { adapterCatalogKey, agentAccountsKey, workspaceSlotsKey } from "../../lib/queryKeys.js";
import { CLAUDE_VIEW, CODEX_VIEW } from "../../test/adapter-catalog-fixtures.js";
import { accountView } from "../../test/agent-account-fixtures.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { ConveyorSlots } from "./ConveyorSlots.js";

/**
 * Os encaixes da esteira em `/settings` (`034` T16, Q5): o trio que cada um
 * resolve no workspace, com a herança já aplicada, e os seletores para trocar
 * só aquele encaixe.
 */

const WORKSPACE = "ws-galeria";
const PESSOAL = accountView({ defaultModel: "opus[1m]", defaultEffort: "xhigh" });
const TRABALHO = accountView({ id: "acct_trabalho", label: "trabalho", isDefault: false, bare: false });
const CODEX = accountView({ id: "acct_codex", adapterId: "codex", label: "chatgpt", defaultModel: "gpt-5.5" });

function Stage({ revisorNoCodex }: { revisorNoCodex: boolean }) {
  const client = seededQueryClient([
    [agentAccountsKey(), [PESSOAL, TRABALHO, CODEX]],
    [
      adapterCatalogKey(null),
      [
        { ...CLAUDE_VIEW, accountId: PESSOAL.id },
        { ...CLAUDE_VIEW, accountId: TRABALHO.id },
        { ...CODEX_VIEW, accountId: CODEX.id },
      ],
    ],
    [
      workspaceSlotsKey(WORKSPACE),
      [
        { role: "implementador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
        revisorNoCodex
          ? { role: "revisor", from: "workspace", adapter: "codex", accountId: CODEX.id, accountLabel: "chatgpt", model: "gpt-6-astra", effort: null }
          : { role: "revisor", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
        { role: "testador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
      ],
    ],
  ]);
  return (
    <QueryClientProvider client={client}>
      <div className="set">
        <div className="set__rows">
          <ConveyorSlots workspaceId={WORKSPACE} />
        </div>
      </div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof ConveyorSlots> = {
  title: "Configurações/Encaixes da esteira",
  component: ConveyorSlots,
};

export default meta;

type Story = StoryObj<typeof ConveyorSlots>;

/** Ninguém configurou nada: os três no default, herdando a conta padrão do Claude. */
export const Padrao: Story = {
  name: "Os três no padrão",
  render: () => <Stage revisorNoCodex={false} />,
};

/** Trocar só o revisor (UC4): ele vem do workspace, no Codex; os outros continuam. */
export const RevisorNoCodex: Story = {
  name: "Revisor noutra conta",
  render: () => <Stage revisorNoCodex />,
};
