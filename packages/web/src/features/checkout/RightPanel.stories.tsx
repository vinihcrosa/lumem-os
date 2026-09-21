import type { Meta, StoryObj } from "@storybook/react-vite";

import { TabToggle } from "../../ui/index.js";
import { RightPanel } from "./RightPanel.js";

/**
 * A coluna de arquivos — o quinto dos estados caros que o
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)
 * promete e a galeria não tinha (`032-web-architecture` T33).
 *
 * Voltou para cá depois de sair de `ui/Primitives.stories.tsx` na T3: `RightPanel`
 * é uma tela (mora em `features/checkout/`), e uma primitiva não conhece tela.
 * `RightPanel` não tem hook nem `trpc` — "owns no data", como o próprio comentário
 * do componente diz —, então a story não mocka nada.
 */

const meta: Meta<typeof RightPanel> = {
  title: "Checkout/RightPanel",
  component: RightPanel,
};

export default meta;

type Story = StoryObj<typeof RightPanel>;

export const ColunaDeArquivos: Story = {
  name: "Coluna de arquivos",
  render: () => (
    <>
      <p className="sg__note">
        A coluna nasce fechada, e o interruptor dela mora na faixa de abas do checkout — o único
        lugar que existe em todas as abas de um escopo e em nenhum lugar fora dele. Desligado à
        esquerda, ligado à direita. Aqui a coluna aparece nas duas pontas da largura que o arrasto
        permite.
      </p>
      <div className="sg__inline">
        <TabToggle label="a coluna de arquivos" pressed={false} onToggle={() => undefined}>
          ▤
        </TabToggle>
        <TabToggle label="a coluna de arquivos" pressed onToggle={() => undefined}>
          ▤
        </TabToggle>
      </div>
      <div className="sg__columns">
        <div className="sg__column" style={{ width: "var(--size-panel-right-min)" }}>
          <RightPanel
            tab="files"
            onSelectTab={() => {}}
            changeCount={null}
            onReload={() => {}}
            onClose={() => {}}
            onResize={() => {}}
            footLeft="lido há 12 s"
            footRight="21 entradas"
          >
            <div className="rp__scroll">
              <p className="detail__hint">a mínima ainda cabe um caminho de três níveis</p>
            </div>
          </RightPanel>
        </div>
        <div className="sg__column" style={{ width: "var(--size-panel-right-max)" }}>
          <RightPanel
            tab="changes"
            onSelectTab={() => {}}
            changeCount={6}
            onReload={() => {}}
            onClose={() => {}}
            onResize={() => {}}
            footLeft="lido há 8 s"
            footRight="árvore de trabalho vs HEAD"
          >
            <div className="rp__scroll">
              <p className="detail__hint">a máxima, com a contagem na aba</p>
            </div>
          </RightPanel>
        </div>
      </div>
    </>
  ),
};
