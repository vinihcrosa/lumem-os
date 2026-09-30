import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";

import {
  AGENT_RATE_LIMITS_KEY,
  RECENT_WORKSPACES_KEY,
  SYSTEM_LIVE_KEY,
  SYSTEM_RESOURCES_KEY,
  UPDATE_STATUS_KEY,
  usageTotalKey,
} from "../../lib/queryKeys.js";
import { seededQueryClient } from "../../test/query-seed.js";
import { NO_RESOURCES, NO_UPDATE, NO_USAGE_TOTAL, NOTHING_LIVE } from "../../test/trpc-mock.js";
import { MenubarScreen } from "./MenubarScreen.js";

/**
 * O painel do ícone da barra (`038`, Parte 3). O cache chega semeado: a `queryFn`
 * nunca roda na primeira pintura, e nenhuma chamada sai para `/trpc`. A hora é fixa,
 * para *"há 5 min"* e *"reseta em 2 h"* não mudarem com o dia em que se abre a galeria.
 */

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const MB = 1024 * 1024;

const BUSY_RESOURCES = {
  groups: {
    daemon: { cpuPercent: 1.5, rssBytes: 180 * MB },
    agents: { cpuPercent: 22.4, rssBytes: 900 * MB },
    terminals: { cpuPercent: 0.3, rssBytes: 40 * MB },
  },
  top: [
    { label: "Claude · lumem-os/bandung", pid: 200, cpuPercent: 20.1, rssBytes: 512 * MB },
    { label: "Terminal · lumem-os/bandung", pid: 400, cpuPercent: 0.3, rssBytes: 30 * MB },
    { label: "node", pid: 100, cpuPercent: 1.5, rssBytes: 180 * MB },
  ],
  sampledAt: "2026-09-29T12:00:00.000Z",
};

const WORKSPACES = [
  { id: "w1", name: "pessoal" },
  { id: "w2", name: "trabalho" },
  { id: "w3", name: "estudos" },
];

type Seed = ReadonlyArray<readonly [key: readonly unknown[], data: unknown]>;

function Stage({ seed }: { seed: Seed }) {
  return (
    <QueryClientProvider client={seededQueryClient(seed)}>
      <MenubarScreen now={NOW} />
    </QueryClientProvider>
  );
}

const meta: Meta<typeof MenubarScreen> = {
  title: "Painel da barra/Tela",
  component: MenubarScreen,
};

export default meta;

type Story = StoryObj<typeof MenubarScreen>;

/** Trabalhando, com cota relatada e versão nova: o aviso de terminais está ao lado do botão. */
export const Trabalhando: Story = {
  name: "Trabalhando, com versão nova",
  render: () => (
    <Stage
      seed={[
        [
          AGENT_RATE_LIMITS_KEY,
          [
            { accountId: "a", adapterId: "claude", kind: "five_hour", utilization: 0.42, resetsAt: NOW / 1000 + 600 },
            { accountId: "b", adapterId: "codex", kind: "seven_day", utilization: 0.87, resetsAt: NOW / 1000 + 7800 },
          ],
        ],
        [usageTotalKey("1d"), { tokens: 48_200, cost: 1.75, currency: "USD", turns: 12 }],
        [
          SYSTEM_LIVE_KEY,
          {
            turns: [
              { sessionId: "s1", label: "Claude · lumem-os/bandung", startedAt: "2026-09-29T11:55:00.000Z" },
              { sessionId: "s2", label: "Codex · api/login", startedAt: "2026-09-29T11:59:30.000Z" },
            ],
            openTerminals: 2,
          },
        ],
        [SYSTEM_RESOURCES_KEY, BUSY_RESOURCES],
        [
          UPDATE_STATUS_KEY,
          {
            ...NO_UPDATE,
            current: "0.6.1",
            latest: "0.7.0",
            checkedAt: "2026-09-29T11:57:00.000Z",
            updateAvailable: true,
            supervised: true,
          },
        ],
        [RECENT_WORKSPACES_KEY, WORKSPACES],
      ]}
    />
  ),
};

/** Ninguém relatou cota: a manchete é o custo do dia, e a lista diz que nada roda. */
export const Ocioso: Story = {
  name: "Ocioso, com o custo do dia",
  render: () => (
    <Stage
      seed={[
        [AGENT_RATE_LIMITS_KEY, []],
        [usageTotalKey("1d"), { tokens: 48_200, cost: 1.75, currency: "USD", turns: 12 }],
        [SYSTEM_LIVE_KEY, NOTHING_LIVE],
        [SYSTEM_RESOURCES_KEY, { ...NO_RESOURCES, groups: BUSY_RESOURCES.groups }],
        [
          UPDATE_STATUS_KEY,
          { ...NO_UPDATE, current: "0.7.0", latest: "0.7.0", checkedAt: "2026-09-29T11:57:00.000Z" },
        ],
        [RECENT_WORKSPACES_KEY, WORKSPACES],
      ]}
    />
  ),
};

/** O agente não relata dinheiro: os tokens do dia, e nunca um `US$ 0,00`. */
export const SemCusto: Story = {
  name: "Sem custo relatado",
  render: () => (
    <Stage
      seed={[
        [AGENT_RATE_LIMITS_KEY, []],
        [usageTotalKey("1d"), { ...NO_USAGE_TOTAL, tokens: 48_200, turns: 12 }],
        [SYSTEM_LIVE_KEY, NOTHING_LIVE],
        [SYSTEM_RESOURCES_KEY, NO_RESOURCES],
        [UPDATE_STATUS_KEY, NO_UPDATE],
        [RECENT_WORKSPACES_KEY, []],
      ]}
    />
  ),
};
