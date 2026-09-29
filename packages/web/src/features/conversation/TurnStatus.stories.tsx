import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { replayConversation } from "./conversation-model.js";
import { TurnStatus, type TurnStatusProps } from "./TurnStatus.js";

/**
 * A linha de estado do turno (`037` S3), acima de um composer parado.
 *
 * O relógio é fixo em cada história: o decorrido é parte do que se revisa, e um
 * relógio de verdade mudaria o desenho entre duas olhadas.
 */

const STARTED = 1_700_000_000_000;

function turn(...events: AcpEvent[]): TurnStatusProps["conversation"] {
  const entries: AcpTranscriptEntry[] = [
    { at: STARTED, event: { type: "message", messageId: "u-1", role: "user", text: "roda o gate" } },
    ...events.map((event, index) => ({ at: STARTED + (index + 1) * 1000, event })),
  ];
  return replayConversation(entries);
}

function Frame(props: TurnStatusProps) {
  return (
    <div className="sg__pane">
      <div className="conv">
        <TurnStatus {...props} />
        <div className="composer">
          <div className="composer__box">
            <textarea className="composer__in composer__in--empty" aria-label="mensagem para o agente" />
          </div>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof TurnStatus> = {
  title: "Conversa/TurnStatus",
  component: TurnStatus,
  render: (args) => <Frame {...args} />,
};

export default meta;

type Story = StoryObj<typeof TurnStatus>;

/** O pedido saiu e o agente ainda não mandou nada. */
export const Comecando: Story = {
  args: { conversation: turn(), readOnly: false, clock: () => STARTED + 4000 },
};

export const Pensando: Story = {
  args: {
    conversation: turn({ type: "thought", messageId: "t-1", text: "hmm" }),
    readOnly: false,
    clock: () => STARTED + 72_000,
  },
};

/** O título da ferramenta é o que a linha diz; comprido, ele encurta e o tempo fica. */
export const Rodando: Story = {
  args: {
    conversation: turn({
      type: "tool_call",
      toolCallId: "tc-1",
      title: "Bash pnpm --filter @lumem/web exec vitest run src/features/conversation/",
      kind: "execute",
      status: "running",
      locations: [],
    }),
    readOnly: false,
    clock: () => STARTED + 11_100_000,
  },
};
