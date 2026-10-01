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

async function openConversation(page: Page, agent: string, worktreeName: string): Promise<void> {
  await openConfiguredAgent(page, DAEMON, agent, worktreeName);
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
  await expect(page.getByLabel("árvore de projetos").getByRole("button", { name: WORKTREE, exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await openConversation(page, CLAUDE, WORKTREE);
  // O cabeçalho da conversa que está na frente nomeia o agente dela — e é aqui
  // que a F4 reprovou antes de a correção existir.
  await expect(conversation(page).getByText(CLAUDE)).toBeVisible();

  await openConversation(page, CODEX, WORKTREE);
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
  await expect(page.getByLabel("árvore de projetos").getByRole("button", { name: `${WORKTREE}-consumo`, exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await openConversation(page, CODEX, `${WORKTREE}-consumo`);
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

test("conecta o segundo agente em /settings, ao lado do primeiro", async ({ page }) => {
  /*
   * O caminho da T13, de ponta a ponta e **sem rede**, agora na tela de
   * configurações (`039`): o rodapé da sidebar perdeu o agente.
   *
   * O painel só instala quando o pré-voo não acha o binário, e o `codex-acp` do
   * `E2E_FIXTURE_BIN` está no PATH do daemon — então este teste percorre
   * conectar → handshake → configuração criada sem que um `npm install` de 300 MB
   * aconteça. O que ele prova é o que só o navegador responde: que `/settings` é o
   * caminho, e que o Codex ganha uma conta ao lado do Claude em vez de substituí-lo.
   */
  await page.goto("/");
  await ensureWorkspace(page);
  await page.getByRole("button", { name: /^Configurações/ }).click();

  const codex = page.getByRole("group", { name: "agente Codex" });
  await expect(codex).toBeVisible({ timeout: 20_000 });

  // Specs share one daemon. On a full run the adapter may already have been
  // connected by onboarding; then there is an account row instead of the button.
  // `^conta `, ancorado: o grupo "nenhuma conta do Codex" também contém "conta" e
  // já está na tela antes de qualquer clique.
  const connect = codex.getByRole("button", { name: "conectar Codex" });
  const account = codex.getByRole("group", { name: /^conta / });
  await expect(connect.or(account.first())).toBeVisible({ timeout: 30_000 });
  /*
   * O clique é o caminho, mas não a prova: numa suíte que divide um daemon, a conta
   * `principal` do Codex pode aparecer por outra via entre o `isVisible` e o clique
   * (foi o que o CI mostrou), e o botão desanexa. Nesse caso não há o que clicar, e a
   * asserção abaixo — a conta na tela — continua sendo o que decide.
   */
  if (await connect.isVisible()) await connect.click({ timeout: 5_000 }).catch(() => undefined);

  await expect(account.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("group", { name: "agente Claude Code" })).toBeVisible();
});

test("o consumo do workspace abre por agente quando há dois", async ({ page }) => {
  /*
   * A F5 de ponta a ponta, e é o único lugar onde a corrente inteira aparece:
   * dois turnos de dois agentes → `session_usage` com `agent_config_id` →
   * `usage.byProjectAndAgent` → a sub-linha na tela. Cada peça tem teste de
   * unidade; a corrente não tinha.
   *
   * Os dois turnos são do mesmo fake, então continua a token zero.
   */
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, `${WORKTREE}-conta`, "repo-acp");
  await expect(page.getByLabel("árvore de projetos").getByRole("button", { name: `${WORKTREE}-conta`, exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Um turno de cada agente: é o que faz `session_usage` ter duas linhas com
  // agentes diferentes no mesmo projeto.
  for (const agent of [CLAUDE, CODEX]) {
    await openConversation(page, agent, `${WORKTREE}-conta`);
    const conv = conversation(page);
    await conv.getByLabel("mensagem para o agente").click();
    await page.keyboard.type(`gasto do ${agent}`);
    await page.keyboard.press("ControlOrMeta+Enter");
    const permission = conv.getByRole("group", { name: "pedido de permissão" });
    await expect(permission).toBeVisible({ timeout: 30_000 });
    await permission.getByRole("button", { name: /permitir uma vez/ }).click();
    await expect(conv.locator(".usage")).toBeVisible({ timeout: 30_000 });
  }

  // A tela do workspace: sem worktree selecionada, que é onde ela mora.
  await page.reload();
  const panel = page.locator(".wsp");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // Com dois agentes a linha do projeto abre — e é ela que responde "quanto cada
  // um custou".
  const twist = panel.getByRole("button", { name: /divisão por agente de repo-acp/ });
  await expect(twist).toBeVisible({ timeout: 20_000 });
  await twist.click();

  await expect(panel.getByText(CLAUDE, { exact: true })).toBeVisible();
  await expect(panel.getByText(CODEX, { exact: true })).toBeVisible();
});
