import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import {
  createAgentConfig,
  createWorktree,
  ensureProject,
  ensureWorkspace,
  openConfiguredAgent,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * O painel do ícone da barra numa aba comum (`038`, C60).
 *
 * O app de desktop só carrega `<origem>/menubar` numa janela; uma aba faz o mesmo, e é
 * por isso que o painel é testável sem Electron. O que só o navegador responde: que o
 * daemon (aqui, o do vite) entrega a página, que os cinco blocos leem o daemon de
 * verdade e que os **números** chegam — os componentes provam o texto contra um mock, e
 * nenhum mock prova que o `ps` desta máquina virou megabytes na tela.
 *
 * O turno em voo é o do fake ACP, que pede permissão e espera: enquanto ninguém responde,
 * ele **é** um turno em voo, sem `sleep` e sem gastar um token.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-falso";
const WORKTREE = "painel-barra";
// A memória como o painel a escreve: `180 MB`, ou `1,2 GB` passando de um giga. O
// tamanho da máquina decide qual dos dois aparece — um agente num runner chega a 1,2 GB —,
// e a prova é que há um número com unidade, não qual unidade.
const MEMORY = /\d+(?:,\d)? (?:MB|GB)/;

test.beforeEach(async ({ request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    adapterVersion: "0.0.0-fake",
  });
});

async function startTurn(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, WORKTREE, "repo-acp");
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  await openConfiguredAgent(page, DAEMON, AGENT);
  const conv = page.locator("[role=tabpanel]:not([hidden]) .conv");
  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("confere o painel da barra");
  await page.keyboard.press("ControlOrMeta+Enter");
}

test("o painel abre numa aba e mostra os três blocos", async ({ page, context }) => {
  // A CPU só existe da segunda amostra, e o daemon amostra de 5 em 5 s: o teste gasta ~19 s
  // numa máquina parada, e os 30 s do padrão não sobram quando a suíte inteira carrega o
  // daemon. Cada espera abaixo já tem o seu prazo; o que falta é o total caber neles.
  test.setTimeout(120_000);
  await startTurn(page);
  const conv = page.locator("[role=tabpanel]:not([hidden]) .conv");
  // O turno pede permissão e fica esperando: está em voo até alguém responder.
  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 20_000 });

  const panel = await context.newPage();
  const failures: string[] = [];
  panel.on("pageerror", (error) => failures.push(error.message));
  await panel.goto("/menubar");
  await expect(panel.getByRole("main", { name: "Painel do Lumem" })).toBeVisible();

  // A página inteira, sem o shell do workspace.
  await expect(panel.getByRole("heading", { name: "Lumem-OS", level: 1 })).toHaveCount(0);

  // A manchete: quota se o agente a relata, senão o custo do dia — nas duas, um número.
  const headline = panel.getByRole("region", { name: "Consumo" });
  await expect(headline).toContainText(/\d+%|US\$ \d+,\d{2}|tokens/, { timeout: 20_000 });

  // A lista de sessões: o turno em voo, com o agente e o checkout dele.
  const turns = panel.getByRole("region", { name: "Turnos em voo" });
  await expect(turns.getByText(`Acp-falso · repo-acp/${WORKTREE}`)).toBeVisible({ timeout: 20_000 });

  // Os recursos, com número: a memória do daemon e a dos agentes — o adaptador
  // falso é um `node` filho do daemon, e o painel o atribui pelo pid — vêm do
  // `ps` (macOS) ou do `/proc` (Linux) desta máquina.
  const resources = panel.getByRole("region", { name: "Recursos" });
  await expect(resources.getByText("Daemon")).toBeVisible();
  const agents = resources.locator(".menubar__group", { hasText: "Agentes" });
  await expect(agents).toContainText(MEMORY, { timeout: 20_000 });
  await expect(resources.locator(".menubar__group", { hasText: "Daemon" })).toContainText(MEMORY);
  // A CPU só existe da segunda amostra em diante: o painel pergunta a cada 3 s, e o
  // daemon amostra (de 5 em 5 s) enquanto alguém pergunta.
  await expect(resources.locator(".menubar__group", { hasText: "Daemon" })).toContainText(/\d+,\d%/, {
    timeout: 20_000,
  });
  expect(failures).toEqual([]);

  // Deixa o daemon como achou: o turno termina, e a próxima leitura já não o lista.
  await permission.getByRole("button", { name: /permitir uma vez/ }).click();
  await expect(turns.getByText("nenhuma sessão rodando")).toBeVisible({ timeout: 30_000 });
});
