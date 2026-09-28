import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { SpendList, type SpendRow } from "./SpendList.js";

/**
 * O consumo do workspace, aberto por agente e por conta (`034` T16).
 *
 * A pergunta que esta story existe para responder é de alinhamento: a `021`
 * achou 37px de diferença entre a coluna de token de uma linha e a de outra
 * quando o texto de custo mudava de largura. Aqui há três níveis — projeto,
 * agente, conta — e custos de larguras diferentes (`sem custo reportado`
 * contra `US$ 12,4071`) na mesma coluna. Os números têm que continuar um
 * debaixo do outro.
 */

const ROWS: SpendRow[] = [
  {
    id: "p1",
    name: "lorebase",
    kind: "project",
    tokens: 1_400_000,
    cost: 12.4071,
    currency: "USD",
    turns: 86,
    agents: [
      {
        id: "a1",
        name: "claude",
        tokens: 994_000,
        cost: 12.4071,
        currency: "USD",
        turns: 61,
        accounts: [
          { id: "acct_casa", label: "casa", tokens: 600_000, cost: 8, currency: "USD", turns: 40 },
          { id: "acct_trabalho", label: "trabalho", tokens: 394_000, cost: 4.4071, currency: "USD", turns: 21 },
        ],
      },
      { id: "a2", name: "codex", tokens: 406_000, cost: null, currency: null, turns: 25 },
    ],
  },
  {
    id: "p2",
    name: "lumem-os",
    kind: "project",
    tokens: 402_000,
    cost: null,
    currency: null,
    turns: 30,
    agents: [{ id: "a2", name: "codex", tokens: 402_000, cost: null, currency: null, turns: 30 }],
  },
];

const meta: Meta<typeof SpendList> = {
  title: "Workspace/Consumo",
  component: SpendList,
};

export default meta;

type Story = StoryObj<typeof SpendList>;

/** Aberta por agente e, no Claude do `lorebase`, por conta. */
export const DuasContas: Story = {
  name: "Por agente e por conta",
  render: () => (
    <div className="wsp">
      <SpendList rows={ROWS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const twist of await canvas.findAllByRole("button", { name: /abrir a divisão por agente/ })) {
      await userEvent.click(twist);
    }
  },
};
