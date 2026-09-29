import { expect, test, type Page } from "@playwright/test";

import {
  createAgentConfig,
  createWorktree,
  ensureProject,
  ensureWorkspace,
  openConfiguredAgent,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * O plano do plan mode, de ponta a ponta (`035`).
 *
 * Contra o roteiro de plan mode do agente falso (*"planeje antes"*), que manda o
 * que o `claude-agent-acp@0.75.1` manda: o modo `plan`, o tool call
 * `switch_mode` com o plano no próprio `tool_call`, e o pedido com as quatro
 * opções verbatim. O que só o navegador responde é a corrente inteira: o plano
 * atravessando tradutor, transcript e WebSocket até o cartão, e o registro
 * voltando do disco depois de recarregar.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-plano";

const BANNER = "modo plano — o agente não altera arquivos até você aprovar o plano";
/** A primeira e a última linha do plano do roteiro. */
const FIRST_LINE = "Separar o parser do loader";
const LAST_LINE = "Última linha do plano: nada é escrito antes da aprovação.";

/** Uma worktree por teste: elas dividem daemon e diretório de estado. */
const WORKTREES = {
  banner: "plano-faixa",
  approve: "plano-aprovar",
  reload: "plano-recarregar",
  reject: "plano-recusar",
  cancel: "plano-cancelar",
} as const;

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function arrive(page: Page, worktree: string): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, worktree, "repo-acp");
  await expect(page.getByRole("heading", { name: worktree })).toBeVisible({ timeout: 30_000 });
  await openConfiguredAgent(page, DAEMON, AGENT);
}

/** Manda o prompt do roteiro e espera o cartão do plano pendente. */
async function askForPlan(page: Page) {
  const conv = conversation(page);
  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("planeje antes de mexer no loader");
  await page.keyboard.press("ControlOrMeta+Enter");

  const card = conv.getByRole("group", { name: "aprovar o plano" });
  await expect(card.getByRole("button", { name: "Yes, and use auto mode", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  return card;
}

test.beforeEach(async ({ request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    adapterVersion: "0.0.0-fake",
  });
});

test("a faixa aparece em plan mode e some ao aprovar", async ({ page }) => {
  await arrive(page, WORKTREES.banner);
  const conv = conversation(page);
  await expect(conv.getByText(BANNER, { exact: true })).toHaveCount(0);

  const card = await askForPlan(page);
  await expect(conv.getByText(BANNER, { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Yes, and use auto mode", exact: true }).click();

  await expect(conv.getByText("Plano aprovado, seguindo em auto.")).toBeVisible({ timeout: 20_000 });
  await expect(conv.getByText(BANNER, { exact: true })).toHaveCount(0);
});

test("o plano inteiro aparece e aprovar deixa o registro", async ({ page }) => {
  await arrive(page, WORKTREES.approve);
  const card = await askForPlan(page);

  // Inteiro: o começo, que é onde está o objetivo, e o fim, depois do teto de 12.
  await expect(card.getByRole("heading", { name: FIRST_LINE })).toBeVisible();
  await expect(card.getByText(LAST_LINE)).toBeVisible();
  // E nenhum bloco genérico de permissão para o mesmo pedido.
  await expect(conversation(page).getByRole("group", { name: "pedido de permissão" })).toHaveCount(0);

  await card.getByRole("button", { name: "Yes, and use auto mode", exact: true }).click();

  await expect(card.getByText("plano aprovado — Yes, and use auto mode")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: "Yes, and use auto mode", exact: true })).toHaveCount(0);
});

test("o registro sobrevive a recarregar", async ({ page }) => {
  await arrive(page, WORKTREES.reload);
  const card = await askForPlan(page);
  await card.getByRole("button", { name: "Yes, and use auto mode", exact: true }).click();
  await expect(conversation(page).getByText("Plano aprovado, seguindo em auto.")).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await ensureWorkspace(page);
  await openProject(page, "repo-acp");
  const expand = page.getByRole("button", { name: `expandir repo-acp` });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  const worktree = page
    .getByRole("complementary", { name: "navegação" })
    .getByRole("button", { name: new RegExp(`^${WORKTREES.reload}\\b`) });
  await expect(worktree).toBeVisible({ timeout: 20_000 });
  await worktree.click();
  // A recarga cai na aba de contexto, como em toda spec que recarrega.
  await page.getByRole("tab", { name: new RegExp(`^${AGENT}\\b`) }).click();

  const after = conversation(page).getByRole("group", { name: "aprovar o plano" });
  await expect(after.getByText("plano aprovado — Yes, and use auto mode")).toBeVisible({ timeout: 20_000 });
  await expect(after).toHaveCount(1);
  await expect(after.getByRole("button", { name: "Yes, and use auto mode", exact: true })).toHaveCount(0);

  // E o plano relido do disco: recolhido no registro, inteiro ao abrir.
  await expect(after.getByText(LAST_LINE)).toHaveCount(0);
  await after.getByRole("button", { name: "ver o plano" }).click();
  await expect(after.getByRole("heading", { name: FIRST_LINE })).toBeVisible();
  await expect(after.getByText(LAST_LINE)).toBeVisible();
});

test("recusar mantém o plan mode", async ({ page }) => {
  await arrive(page, WORKTREES.reject);
  const conv = conversation(page);
  const card = await askForPlan(page);

  await card.getByRole("button", { name: "No, keep planning", exact: true }).click();

  await expect(card.getByText("você pediu para continuar planejando")).toBeVisible({ timeout: 20_000 });
  // O turno acabou — o composer voltou — e o modo continua `plan`.
  await expect(conv.getByLabel("mensagem para o agente")).not.toBeDisabled({ timeout: 20_000 });
  await expect(conv.getByText(BANNER, { exact: true })).toBeVisible();
});

test("cancelar com o plano pendente deixa pedido cancelado", async ({ page }) => {
  await arrive(page, WORKTREES.cancel);
  const conv = conversation(page);
  const card = await askForPlan(page);

  await conv.getByRole("button", { name: /interromper/ }).click();

  await expect(card.getByText("pedido cancelado")).toBeVisible({ timeout: 20_000 });
  for (const name of ["Yes, clear context (32% used) and use auto mode", "Yes, and use auto mode", "Yes, manually approve edits", "No, keep planning"]) {
    await expect(card.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(conv.getByText("o turno está parado aqui")).toHaveCount(0);
});
