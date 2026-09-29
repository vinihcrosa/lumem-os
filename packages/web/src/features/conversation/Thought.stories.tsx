import type { Meta, StoryObj } from "@storybook/react-vite";

import { Thought, TurnFrame } from "./Message.js";

/**
 * O pensamento do agente nos três momentos que a `036-reasoning` desenha: sendo
 * escrito (aberto, com o brilho), terminado com a duração, e terminado de um
 * chunk só, sem número.
 *
 * O brilho é CSS, e o jsdom não o desenha — é aqui que ele se vê.
 */

const TEXT =
  "O parser está embutido no loader. Separar primeiro deixa o conserto do frontmatter vazio " +
  "num lugar só, e o teste que falha fica pequeno.";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sg__pane">
      <div className="conv">
        <div className="conv__scroll">
          <TurnFrame role="agent">{children}</TurnFrame>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof Thought> = {
  title: "Conversa/Pensamento",
  component: Thought,
};

export default meta;

type Story = StoryObj<typeof Thought>;

export const Pensando: Story = {
  name: "Pensando",
  render: () => (
    <Frame>
      <Thought text={TEXT} open onToggle={() => undefined} streaming />
    </Frame>
  ),
};

export const Pensou: Story = {
  name: "Pensou, com duração",
  render: () => (
    <Frame>
      <Thought text={TEXT} open={false} onToggle={() => undefined} elapsedMs={12_300} />
    </Frame>
  ),
};

export const PensouSemDuracao: Story = {
  name: "Pensou, um chunk só",
  render: () => (
    <Frame>
      <Thought text={TEXT} open={false} onToggle={() => undefined} elapsedMs={0} />
    </Frame>
  ),
};
