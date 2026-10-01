import { expect, test, type Page } from "@playwright/test";

import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_FILES } from "./support/fixtures.js";
import {
  createAgentConfig,
  createWorktree,
  dockTerminal,
  ensureProject,
  ensureWorkspace,
  openConfiguredAgent,
  openProject,
  openTerminal,
  showTerminalTab,
} from "./support/app.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * A coluna do meio, de ponta a ponta: caminho → abas → conteúdo.
 *
 * O que era cabeçalho fixo virou a primeira aba, e o interruptor da coluna de
 * arquivos desceu da topbar para a faixa de abas do checkout. Os testes de
 * componente provam as duas coisas separadas; o que só um navegador de verdade
 * pode provar é a terceira: que abrir e fechar a coluna **remede o terminal**,
 * porque jsdom não tem layout e um refit perdido não levanta erro nenhum — a
 * saída simplesmente quebra numa coluna que não existe.
 */

const PROJECT = "repo-files";
const WORKTREE = "primeira-aba";
// Sem o nome da worktree dentro: `getByRole("tab", { name: WORKTREE })` casa por substring.
const AGENT = "eco-checkout";
const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

async function typeLine(page: Page, line: string): Promise<void> {
  // O terminal é o do rodapé (LUM-62): shell não é mais aba da faixa do meio.
  await dockTerminal(page).locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

/**
 * Uma palavra que o shell imprime e o teclado nunca digitou.
 *
 * O mesmo motivo do `right-panel.spec.ts`: o xterm ecoa cada caractere, então
 * esperar por uma palavra que está na linha digitada é esperar pela tecla, não
 * pelo efeito.
 */
function announcing(command: string, word: string): string {
  return `${command} && printf '${word.slice(0, -1)}%s\\n' ${word.slice(-1)}`;
}

/**
 * Uma worktree só desta spec, e não o checkout do projeto.
 *
 * As specs compartilham um daemon, e as que rodam antes desta deixam sessões
 * abertas no `repo-files` de propósito. Aba pertence ao escopo que está na tela,
 * então "a última sessão fecha" só quer dizer algo num escopo próprio. Mesma
 * razão registrada no `session-record.spec.ts`.
 *
 * Idempotente, como o `ensureProject`: a primeira que rodar cria.
 */
async function openOwnWorktree(page: Page): Promise<void> {
  const row = page.getByLabel("árvore de projetos").getByRole("button", {
    name: new RegExp(`^${WORKTREE}`),
  });

  /*
   * Esperada, e não apenas contada.
   *
   * `count()` responde sobre **este** quadro, e a lista de worktrees chega uma
   * volta depois da sidebar. Ler cedo responde "não existe" para uma worktree
   * que existe, e a duplicata que vem em seguida é recusada pelo daemon — uma
   * falha que parece bug de produto e não é. Mesma armadilha que o
   * `ensureProject` documenta, e ela custou uma rodada do gate.
   */
  const present = await row
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (present) await row.first().click();
  else {
    await createWorktree(page, WORKTREE, PROJECT);
  }

  await expect(page.getByRole("tab", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });
}

/**
 * Abre uma conversa de agente **e traz a aba dela para a frente**.
 *
 * Era uma shell até a LUM-62; a shell agora mora no rodapé e não é aba, e o que
 * este spec precisa é de uma aba de sessão para fechar. O `openConfiguredAgent`
 * cria a sessão pela API e só devolve com a aba na frente e a conversa montada —
 * o clique na aba que a shell exigia aqui (uma corrida entre a seleção e o estado
 * que o daemon empurra, no backlog) é feito por ele.
 */
async function openAgentTab(page: Page): Promise<void> {
  await openConfiguredAgent(page, DAEMON, AGENT, WORKTREE);
}

test.beforeEach(async ({ page, request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    adapterVersion: "0.0.0-fake",
  });
  // `git worktree add` num repositório de verdade, mais o primeiro acesso: os
  // 30s padrão são o orçamento da asserção, não o da criação.
  test.setTimeout(90_000);
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_FILES, PROJECT);
  await openProject(page, PROJECT);
});

test("entra no checkout e cai na aba dele, com o que era cabeçalho dentro", async ({ page }) => {
  // A aba do projeto é a primeira, e é a que está aberta ao chegar.
  const local = page.getByRole("tab", { name: "local" });
  await expect(local).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "local" })).toContainText("repo-files");

  await openOwnWorktree(page);

  const tab = page.getByRole("tab", { name: WORKTREE });
  await expect(tab).toHaveAttribute("aria-selected", "true");

  // Acima da faixa fica só o caminho. Tudo o mais que era cabeçalho está na aba.
  const panel = page.getByRole("tabpanel", { name: WORKTREE });
  await expect(panel.getByText(/\.lumem.*worktrees/)).toBeVisible();
  await expect(panel.getByRole("heading", { name: WORKTREE })).toBeVisible();
  await expect(panel.getByRole("button", { name: /remover worktree/ })).toBeVisible();

  // A única aba sem `✕`: fechar a worktree dentro dela não quer dizer nada.
  await expect(page.getByRole("button", { name: `fechar ${WORKTREE}` })).toHaveCount(0);
});

test("a seleção volta para a aba do checkout quando a última sessão fecha", async ({ page }) => {
  await openOwnWorktree(page);
  await openAgentTab(page);
  await expect(page.getByRole("tab", { name: WORKTREE })).toHaveAttribute(
    "aria-selected",
    "false",
  );

  await page.getByRole("button", { name: `fechar ${AGENT}` }).click();

  await expect(page.getByRole("tab", { name: WORKTREE })).toHaveAttribute(
    "aria-selected",
    "true",
    { timeout: 20_000 },
  );
});

test("o interruptor da faixa abre e fecha a coluna, e o terminal remede", async ({ page }) => {
  await openOwnWorktree(page);

  // O botão vive na faixa de abas do checkout, e não na topbar.
  const strip = page.getByRole("tablist", { name: /sessões/ });
  await strip.getByRole("button", { name: "abrir a coluna de arquivos" }).click();
  await expect(page.getByLabel("arquivos do checkout")).toBeVisible({ timeout: 15_000 });

  // O terminal mora no rodapé da coluna (LUM-62), então é a coluna aberta que o
  // monta — já com a caixa que ela tem.
  const terminal = await openTerminal(page);
  const rows = terminal.locator(".xterm-rows");

  // A caixa mudou com a janela parada. A prova é uma linha que o *shell*
  // imprimiu na largura nova; o eco do que foi digitado voltaria de qualquer
  // jeito.
  await typeLine(page, announcing("true", "ABERTA"));
  await expect(rows).toContainText("ABERTA", { timeout: 20_000 });

  // E fechando: com a coluna fora da tela o `✕` dela também saiu, então este
  // botão é o único caminho de volta — e ele continua aqui. O terminal sai da
  // tela junto com a coluna; a shell continua de pé.
  await strip.getByRole("button", { name: "fechar a coluna de arquivos" }).click();
  await expect(page.getByLabel("arquivos do checkout")).toHaveCount(0);
  await expect(strip.getByRole("button", { name: "abrir a coluna de arquivos" })).toBeVisible();

  // Reabrir monta a mesma sessão numa caixa medida de novo.
  await strip.getByRole("button", { name: "abrir a coluna de arquivos" }).click();
  await showTerminalTab(page);
  await expect(rows).toContainText("ABERTA", { timeout: 20_000 });
  await typeLine(page, announcing("true", "REABERTA"));
  await expect(rows).toContainText("REABERTA", { timeout: 20_000 });
});
