import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { DAEMON_SETTINGS_KEY } from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { DEFAULT_DAEMON_SETTINGS } from "../../test/trpc-mock.js";
import { UpdateSettings } from "./UpdateSettings.js";

/**
 * `/settings` → Atualizações (`038`, Parte 2): o interruptor de procurar versão
 * nova, ligado e desligado à força pelo ambiente do daemon.
 */

function Stage({ settings }: { settings: typeof DEFAULT_DAEMON_SETTINGS }) {
  return (
    <QueryClientProvider client={seededQueryClient([[DAEMON_SETTINGS_KEY, settings]])}>
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
