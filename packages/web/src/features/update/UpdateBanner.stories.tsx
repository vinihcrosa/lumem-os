import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import { UPDATE_STATUS_KEY } from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { NO_UPDATE } from "../../test/trpc-mock.js";
import { UpdateBanner } from "./UpdateBanner.js";

/**
 * O aviso de versão nova da topbar (`038`, Parte 2). O cache chega semeado: a
 * `queryFn` nunca roda, e nenhuma chamada sai para `/trpc`.
 */

const NEWER = {
  ...NO_UPDATE,
  current: "0.6.1",
  latest: "0.7.0",
  checkedAt: "2026-09-29T12:00:00.000Z",
  updateAvailable: true,
  supervised: true,
};

function Stage({ status }: { status: typeof NEWER }) {
  return (
    <QueryClientProvider client={seededQueryClient([[UPDATE_STATUS_KEY, status]])}>
      <UpdateBanner />
    </QueryClientProvider>
  );
}

const meta: Meta<typeof UpdateBanner> = {
  title: "Atualização/Aviso da topbar",
  component: UpdateBanner,
};

export default meta;

type Story = StoryObj<typeof UpdateBanner>;

/** Sob launchd ou systemd: o botão é o gesto, e a página volta sozinha. */
export const Supervisionado: Story = {
  name: "Versão nova, com supervisor",
  render: () => <Stage status={NEWER} />,
};

/** Em primeiro plano (`lumem run`): sair com 0 não faria ninguém subir a versão nova. */
export const SemSupervisor: Story = {
  name: "Versão nova, sem supervisor",
  render: () => <Stage status={{ ...NEWER, supervised: false }} />,
};

/** A instalação que o clique pediu e que falhou: o motivo fica à vista, e o botão volta. */
export const Falhou: Story = {
  name: "A instalação falhou",
  render: () => <Stage status={{ ...NEWER, lastError: "o npm saiu com 243" }} />,
};
