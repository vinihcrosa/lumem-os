import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";
import { userEvent, within } from "storybook/test";

import type { AcpClientMessage, AcpServerMessage, AcpTranscriptEntry } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";
import { AwaitingPermissionProvider } from "../../hooks/useAwaitingPermission.js";
import { agentAccountsKey, sessionDetailKey } from "../../lib/queryKeys.js";
import { accountView } from "../../test/agent-account-fixtures.js";
import { seededQueryClient } from "../../test/query-seed.js";
import type { AcpConnect, AcpSocket } from "./acp-socket.js";
import { Conversation, type ConversationProps } from "./Conversation.js";

/**
 * O cabeçalho com a conta e *continuar em outra conta* (`034` T15).
 *
 * O cabeçalho só diz a conta quando o agente tem mais de uma; o gesto aparece
 * com duas contas conectadas no total; as linhas de vínculo levam à outra aba
 * quando ela é deste escopo. Cache semeado e socket falso: nada sai da galeria.
 */

const SESSION = "s-conta";
const PESSOAL = accountView();
const TRABALHO = accountView({ id: "acct_trabalho", label: "trabalho", isDefault: false, bare: false });
const CODEX = accountView({ id: "acct_codex", adapterId: "codex", label: "chatgpt" });

const SAID: AcpTranscriptEntry[] = [
  { at: Date.parse("2026-09-26T12:00:00Z"), event: { type: "message", messageId: "u-1", role: "user", text: "corrige o login no Safari" } },
  { at: Date.parse("2026-09-26T12:00:05Z"), event: { type: "message", messageId: "m-1", role: "agent", text: "Corrigido: o cookie estava sem `SameSite`." } },
];

const LINKED: AcpTranscriptEntry[] = [
  {
    at: Date.parse("2026-09-26T12:10:00Z"),
    event: { type: "continued_from", sessionId: "origem", label: "claude · pessoal", messages: 12, approxTokens: 3400 },
  },
  ...SAID,
  { at: Date.parse("2026-09-26T12:20:00Z"), event: { type: "continued_in", sessionId: "longe", label: "codex · chatgpt" } },
];

function attached(transcript: AcpTranscriptEntry[]): AcpServerMessage {
  return {
    type: "attached",
    modeOwner: "agent",
    cwd: "/repos/lorebase",
    lumemMode: "ask",
    lumemModeDefault: "ask",
    sessionId: SESSION,
    state: "running",
    acpSessionId: "d81b05ee-d361",
    model: "opus[1m]",
    mode: "auto",
    configOptions: [],
    transcript,
  };
}

function fakeConnect(transcript: AcpTranscriptEntry[]): AcpConnect {
  return (_sessionId, handlers) => {
    handlers.onMessage(attached(transcript));
    const socket: AcpSocket = { send: (_message: AcpClientMessage) => undefined, close: () => undefined };
    return socket;
  };
}

function Stage({
  accounts,
  transcript = SAID,
  ...props
}: { accounts: readonly AgentAccountView[]; transcript?: AcpTranscriptEntry[] } & Partial<ConversationProps>) {
  const client = seededQueryClient([
    [agentAccountsKey(), accounts],
    [sessionDetailKey(SESSION), { id: SESSION, pendingPrompt: null, pendingReason: null, pendingDetail: null }],
  ]);
  return (
    <QueryClientProvider client={client}>
      <AwaitingPermissionProvider>
        <div className="sg__body">
          <Conversation
            sessionId={SESSION}
            agentName="claude"
            connect={fakeConnect(transcript)}
            continueIn={{ currentAccountId: PESSOAL.id, onContinue: () => undefined, pending: false }}
            {...props}
          />
        </div>
      </AwaitingPermissionProvider>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof Conversation> = {
  title: "Conversa/Continuar em outra conta",
  component: Conversation,
};

export default meta;

type Story = StoryObj<typeof Conversation>;

/** Uma conta só: o cabeçalho de antes, e nenhum gesto. */
export const UmaConta: Story = {
  name: "Cabeçalho com uma conta",
  render: () => <Stage accounts={[PESSOAL]} />,
};

/** Duas contas: o cabeçalho diz qual, e o gesto aparece. */
export const DuasContas: Story = {
  name: "Cabeçalho com duas contas",
  render: () => <Stage accounts={[PESSOAL, TRABALHO, CODEX]} accountLabel="pessoal" />,
};

/** O menu aberto: as outras contas conectadas, com o agente de cada uma. */
export const MenuAberto: Story = {
  name: "Menu de continuar aberto",
  render: () => <Stage accounts={[PESSOAL, TRABALHO, CODEX]} accountLabel="pessoal" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /continuar em outra conta/ }));
  },
};

/** As duas linhas de vínculo: a da origem leva à aba dela; a de outro escopo fica texto. */
export const LinhasDeVinculo: Story = {
  name: "Linhas de vínculo",
  render: () => (
    <Stage
      accounts={[PESSOAL, TRABALHO, CODEX]}
      accountLabel="trabalho"
      transcript={LINKED}
      sessionLink={(id) => (id === "origem" ? () => undefined : null)}
    />
  ),
};
