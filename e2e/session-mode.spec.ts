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
 * A frase que a `session-mode` existe para tornar verdadeira: **um agente que
 * não relata modos não produz um composer mudo.**
 *
 * O que só o navegador responde é o acoplamento inteiro, de ponta a ponta: o
 * daemon derivando a autoria do handshake, a pílula aparecendo por causa disso,
 * a troca chegando no daemon, a política respondendo a um `request_permission`
 * de verdade, e o veredito voltando assinado. Cada peça tem teste de unidade; a
 * corrente não.
 *
 * O adaptador é o fake com `LUMEM_FAKE_NO_MODES=1`, então a suíte não gasta
 * token nenhum.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-sem-modos";

/** Uma worktree por teste: elas dividem daemon e diretório de estado. */
const WORKTREES = {
  pill: "modo-pilula",
  auto: "modo-automatico",
  gate: "modo-portao",
} as const;

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function openConversation(page: Page): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });
  await expect(conversation(page).getByText("sessão aberta, nada pedido ainda")).toBeVisible({
    timeout: 20_000,
  });
}

async function arrive(page: Page, worktree: string): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  // Desde a `sidebar-actions`, a worktree nasce do `+` da linha do projeto.
  await createWorktree(page, worktree, "repo-acp");
  await expect(page.getByRole("heading", { name: worktree })).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
    // O que faz este adaptador responder `session/new` sem `modes` — o caso
    // inteiro da feature, e o único em que a política do Lumem vale (A1).
    env: { LUMEM_FAKE_NO_MODES: "1" },
  });
});

test("um agente sem modos ganha a pílula do Lumem, e não uma barra vazia", async ({ page }) => {
  await arrive(page, WORKTREES.pill);
  await openConversation(page);

  const pill = conversation(page).getByRole("button", { name: /regra do Lumem/i });
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/Perguntar tudo/);

  // Uma pílula de modo, e só uma (A1): nenhum seletor do agente ao lado dela.
  await expect(conversation(page).getByRole("button", { name: /^Mode:/ })).toHaveCount(0);

  // O menu diz de quem é a regra. Sem isso o glifo `◈` é charada.
  await pill.click();
  await expect(conversation(page).getByText(/não relatou modos/i)).toBeVisible();
});

test("em automático, a leitura dentro do checkout passa sozinha e fica registrada", async ({
  page,
}) => {
  await arrive(page, WORKTREES.auto);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByRole("button", { name: /regra do Lumem/i }).click();
  await conv.getByRole("menuitemradio", { name: /Automático/ }).click();
  await expect(conv.getByRole("button", { name: /regra do Lumem/i })).toHaveText(/Automático/);

  const box = conv.getByLabel("mensagem para o agente");
  await box.click();
  await page.keyboard.type("arruma o frontmatter vazio");
  await page.keyboard.press("ControlOrMeta+Enter");

  /*
   * O cartão da leitura, **assinado pelo Lumem**, e sem ninguém ter clicado em
   * nada. É a F1.6 inteira: o que passa sozinho aparece, e aparece dizendo quem
   * assinou e com base em quê.
   */
  await expect(conv.getByText(/o Lumem aprovou/)).toBeVisible({ timeout: 20_000 });
  await expect(conv.getByText(/leitura de arquivo, caminho dentro do checkout/)).toBeVisible();

  /*
   * E o pedido de comando **ainda para**. Se o `automático` engolisse este
   * também, a feature teria virado o `liberado` sem passar pelo portão.
   */
  await expect(conv.getByText("Permissão")).toBeVisible({ timeout: 20_000 });
  await expect(conv.getByText(/só leitura de arquivo/)).toBeVisible();

  await conv.getByRole("button", { name: /permitir uma vez/ }).click();

  // O fecho do turno conta as duas coisas, para "o que rodou sem eu ver" ter
  // resposta curta.
  await expect(conv.getByText(/aprovado pelo Lumem/)).toBeVisible({ timeout: 20_000 });
});

test("liberado só vale depois do portão, e o portão diz o caminho em disco", async ({ page }) => {
  await arrive(page, WORKTREES.gate);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByRole("button", { name: /regra do Lumem/i }).click();
  await conv.getByRole("menuitemradio", { name: /Liberado/ }).click();

  // Nada mudou ainda: o clique abriu o portão, não trocou o modo (Q4).
  await expect(conv.getByRole("button", { name: /regra do Lumem/i })).toHaveText(/Perguntar tudo/);
  await expect(conv.getByRole("dialog", { name: /liberar esta sessão/ })).toBeVisible();
  // O escopo é caminho em disco, e não "a worktree": é o caminho que diz o
  // tamanho do estrago.
  await expect(conv.getByText(new RegExp(WORKTREES.gate))).toBeVisible();
  await expect(conv.getByRole("checkbox")).toHaveCount(0);

  await conv.getByRole("button", { name: /^liberar esta sessão$/ }).click();

  await expect(conv.getByRole("button", { name: /regra do Lumem/i })).toHaveText(/Liberado/);
});
