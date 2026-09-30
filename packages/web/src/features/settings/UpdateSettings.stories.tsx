import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { DAEMON_SETTINGS_KEY, UPDATE_STATUS_KEY } from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { DEFAULT_DAEMON_SETTINGS, NO_UPDATE } from "../../test/trpc-mock.js";
import { UpdateSettings } from "./UpdateSettings.js";

/**
 * `/settings` → Atualizações (`038`, Partes 2 e 5): o interruptor de procurar versão
 * nova, ligado e desligado à força pelo ambiente do daemon, e o de atualizar sozinho,
 * que só existe com o Lumem rodando como serviço.
 */

function Stage({
  settings,
  supervised = false,
}: {
  settings: { updateCheck: boolean; autoUpdate: "off" | "idle"; updateCheckForcedOff: boolean };
  supervised?: boolean;
}) {
  return (
    <QueryClientProvider
      client={seededQueryClient([
        [DAEMON_SETTINGS_KEY, settings],
        [UPDATE_STATUS_KEY, { ...NO_UPDATE, supervised }],
      ])}
    >
      <div className="set">
        <UpdateSettings />
      </div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof UpdateSettings> = {
  title: "Configurações/Atualizações",
  component: UpdateSettings,
};

export default meta;

type Story = StoryObj<typeof UpdateSettings>;

export const Ligado: Story = {
  name: "Procurando versão nova",
  render: () => <Stage settings={DEFAULT_DAEMON_SETTINGS} />,
};

export const DesligadoPeloAmbiente: Story = {
  name: "Desligado por LUMEM_NO_UPDATE_CHECK",
  render: () => <Stage settings={{ ...DEFAULT_DAEMON_SETTINGS, updateCheckForcedOff: true }} />,
};

export const AtualizarSozinho: Story = {
  name: "Atualizar sozinho, ligado sob um serviço",
  render: () => <Stage settings={{ ...DEFAULT_DAEMON_SETTINGS, autoUpdate: "idle" }} supervised />,
};

export const AtualizarSozinhoSemServico: Story = {
  name: "Atualizar sozinho, sem serviço",
  render: () => <Stage settings={DEFAULT_DAEMON_SETTINGS} />,
};
