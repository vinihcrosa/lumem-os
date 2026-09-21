import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AcpClientMessage, AcpServerMessage, AcpTranscriptEntry } from "@lumem/shared";

import { AwaitingPermissionProvider } from "../../hooks/useAwaitingPermission.js";
import type { AcpConnect, AcpSocket } from "./acp-socket.js";
import { Conversation } from "./Conversation.js";

/**
 * A permissão pendente — um dos cinco estados caros que o
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)
 * promete e a galeria não tinha (`032-web-architecture` T33).
 *
 * O `connect` é o mesmo tipo de duplo (`FakeSocket` + `AcpConnect`) que
 * `conversation.test.tsx` usa (`mount()`, linha ~35): sem daemon, sem WebSocket,
 * a `useConversationSession` recebe a função injetável e a story entrega a
 * mensagem `attached` direto de dentro dela, no `useEffect` que a chama.
 */

const ENTRY: AcpTranscriptEntry = {
  at: Date.parse("2026-09-21T12:00:00Z"),
  event: {
    type: "permission_request",
    policyReason: null,
    requestId: "rq-galeria",
    toolCallId: "tc-galeria",
    title: "Bash rm -rf .vite",
    command: "rm -rf node_modules/.vite",
    cwd: "/repos/lorebase",
    options: [
      { optionId: "allow", name: "permitir uma vez", kind: "allow_once" },
      { optionId: "no", name: "não", kind: "reject_once" },
    ],
  },
};

const ATTACHED: AcpServerMessage = {
  type: "attached",
  modeOwner: "agent",
  cwd: "/repos/lorebase",
  lumemMode: "ask",
  lumemModeDefault: "ask",
  sessionId: "s-galeria",
  state: "running",
  acpSessionId: "d81b05ee-d361",
  model: "opus[1m]",
  mode: "auto",
  configOptions: [],
  transcript: [ENTRY],
};

/** Nunca envia nada de verdade — só guarda quem quer ouvir. */
function fakeConnect(): AcpConnect {
  return (_sessionId, handlers) => {
    handlers.onMessage(ATTACHED);
    const socket: AcpSocket = {
      send: (_message: AcpClientMessage) => undefined,
      close: () => undefined,
    };
    return socket;
  };
}

const meta: Meta<typeof Conversation> = {
  title: "Conversa/Conversation",
  component: Conversation,
};

export default meta;

type Story = StoryObj<typeof Conversation>;

export const PermissaoPendente: Story = {
  name: "Permissão pendente",
  render: () => (
    <AwaitingPermissionProvider>
      <div className="sg__body">
        <Conversation sessionId="s-galeria" connect={fakeConnect()} />
      </div>
    </AwaitingPermissionProvider>
  ),
};
