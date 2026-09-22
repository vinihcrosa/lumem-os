import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AcpConfigOption } from "@lumem/shared";

import { ConfigPills } from "./ConfigPills.js";

/**
 * Vinte modelos no seletor — um dos cinco estados caros que o
 * [ADR de 2026-09-20](../../../../docs/adr/2026-09-20-2246-design-lives-in-the-code.md)
 * promete e a galeria não tinha (`032-web-architecture` T33).
 *
 * `ConfigPills` é presentacional — recebe `options` por prop, sem hook nem
 * `trpc` —, então a story não precisa mockar nada. A lista é a mesma que
 * `e2e/support/fake-acp-agent.mjs` usa sob `LUMEM_FAKE_MANY_MODELS`
 * (`composer-menus`): dezenove `modelo-NN` mais `modelo-do-fundo`, o último —
 * é o adaptador que fez o recorte de `.composer__box` aparecer, sob um menu
 * que rolava por trás da caixa em vez de dentro dela.
 */

const LONG_MODEL_LIST: AcpConfigOption["choices"] = Array.from({ length: 20 }, (_, index) =>
  index === 19
    ? { value: "modelo-do-fundo", name: "modelo-do-fundo", description: "o último da lista" }
    : {
        value: `modelo-${String(index + 1).padStart(2, "0")}`,
        name: `modelo-${String(index + 1).padStart(2, "0")}`,
        description: `descrição do modelo ${String(index + 1)}`,
      },
);

const OPTIONS: readonly AcpConfigOption[] = [
  {
    id: "mode",
    name: "Modo",
    category: "mode",
    currentValue: "auto",
    choices: [
      { value: "auto", name: "Auto", description: "Use a model classifier" },
      { value: "plan", name: "Plan", description: "Planeja sem executar" },
      { value: "bypassPermissions", name: "Bypass", description: "Não pergunta nada" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    currentValue: "modelo-01",
    choices: LONG_MODEL_LIST,
  },
];

const meta: Meta<typeof ConfigPills> = {
  title: "Conversa/ConfigPills",
  component: ConfigPills,
};

export default meta;

type Story = StoryObj<typeof ConfigPills>;

export const VinteModelos: Story = {
  name: "Vinte modelos",
  render: () => (
    <>
      <p className="sg__note">o mesmo composer__box — clique na pílula Model para abrir</p>
      <div className="composer">
        <div className="composer__box">
          <div className="composer__bar">
            <ConfigPills mode="auto" options={OPTIONS} onSwitch={() => undefined} />
          </div>
        </div>
      </div>
    </>
  ),
};
