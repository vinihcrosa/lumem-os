import { expect, test, type Page } from "@playwright/test";

import {
  createAgentConfig,
  createWorktree,
  ensureProject,
  ensureWorkspace,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * Duas conversas, dois agentes, uma worktree.
 *
 * A F4 da `second-agent` é **conferência**: o `NewSessionMenu` já lista toda
 * `agent_config` e a aba já se chama pelo nome dela, então a pergunta é se a tela
 * continua dizendo quem está falando quando há dois. Ela não continuava — o
 * cabeçalho da conversa dizia `claude`, escrito à mão. Com um agente ninguém
 * notava. Este spec é o que fez notar.
 *
 * A token zero: os dois agentes são o mesmo fake, e o segundo roda com
 * `LUMEM_FAKE_PROFILE=codex`, que é o perfil medido na fase 0 — nome de pacote no
 * `agentInfo`, dois métodos de login sem `type`, e um `usage_update` sem
 * `rateLimit` e sem `cost`.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const CLAUDE = "acp-claude-fake";
const CODEX = "acp-codex-fake";
const WORKTREE = "dois-agentes";

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function openConversation(page: Page, agent: string): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${agent}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });
  await expect(conversation(page).getByText("sessão aberta, nada pedido ainda")).toBeVisible({
    timeout: 20_000,
  });
}

test.beforeEach(async ({ request }) => {
  for (const [name, profile] of [
    [CLAUDE, "claude"],
    [CODEX, "codex"],
  ] as const) {
    await createAgentConfig(request, DAEMON, {
      name,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
      env: { LUMEM_FAKE_PROFILE: profile },
    });
  }
});

test("cada aba diz qual agente está falando nela", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, WORKTREE, "repo-acp");
  await expect(page.getByRole("tab", { name: new RegExp(`^${WORKTREE}`) })).toBeVisible({
    timeout: 30_000,
  });

  await openConversation(page, CLAUDE);
  // O cabeçalho da conversa que está na frente nomeia o agente dela — e é aqui
  // que a F4 reprovou antes de a correção existir.
  await expect(conversation(page).getByText(CLAUDE)).toBeVisible();

  await openConversation(page, CODEX);
  await expect(conversation(page).getByText(CODEX)).toBeVisible();
  // E não o outro: as duas abas ficam **montadas**, então um `getByText` sem
  // escopo acharia as duas e o teste passaria sem provar nada.
  await expect(conversation(page).getByText(CLAUDE)).toHaveCount(0);

  // As duas abas existem lado a lado, cada uma com o seu nome.
  await expect(page.getByRole("tab", { name: new RegExp(`^${CLAUDE}\\b`) })).toBeVisible();
  await expect(page.getByRole("tab", { name: new RegExp(`^${CODEX}\\b`) })).toBeVisible();

  // Voltar para a primeira mostra a primeira, e não a última aberta.
  await page.getByRole("tab", { name: new RegExp(`^${CLAUDE}\\b`) }).click();
  await expect(conversation(page).getByText(CLAUDE)).toBeVisible();
  await expect(conversation(page).getByText(CODEX)).toHaveCount(0);
});

test("o agente que não informa limite não desenha número de limite", async ({ page }) => {
  // C4, de ponta a ponta: o perfil codex manda `used`/`size` e nada mais. O
  // rodapé de consumo mostra a janela e **não** inventa um limite de plano.
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, `${WORKTREE}-consumo`, "repo-acp");
  await expect(page.getByRole("tab", { name: new RegExp(`^${WORKTREE}-consumo`) })).toBeVisible({
    timeout: 30_000,
  });

  await openConversation(page, CODEX);
  const conv = conversation(page);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("quanto custou");
  await page.keyboard.press("ControlOrMeta+Enter");

  // O turno do fake para num pedido de permissão, como o do outro spec: o
  // consumo só chega depois dele.
  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 30_000 });
  await permission.getByRole("button", { name: /permitir uma vez/ }).click();

  // A janela aparece — é o que ele informa.
  await expect(conv.locator(".usage")).toBeVisible({ timeout: 30_000 });
  await expect(conv.locator(".usage")).toContainText("janela");
  // Os números que o perfil manda, e não os do Claude.
  await expect(conv.locator(".usage")).toContainText("22,0k / 258k");
  // O limite do plano não: o bloco `assinatura` só existe quando o agente manda
  // `rateLimit`, e este não manda.
  await expect(conv.locator(".usage")).not.toContainText("assinatura");
  // E o custo do turno é um travessão, nunca um zero: um agente que não informa
  // dinheiro não pode parecer grátis.
  await expect(conv.locator(".usage")).toContainText("—");
});
