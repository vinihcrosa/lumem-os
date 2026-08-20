import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO_ONBOARDING } from "./support/fixtures.js";

/**
 * The one test that proves the objective: an empty machine reaches a conversation.
 *
 * **The `00-` prefix is load-bearing.** Playwright runs spec files in path order,
 * and this is the only spec that needs a daemon with no workspace in it — the
 * moment any other spec runs, `ensureWorkspace` has created one and the flow
 * stops appearing. So it runs first, and it is the spec that creates the
 * workspace the rest of the suite shares.
 *
 * Everything here goes through the screen. No `call()`, no fetch, not one line of
 * setup through the API — which is exactly the path this feature exists to make
 * unnecessary, and the reason the rest of the suite is allowed to keep using it.
 */

const WORKSPACE = "e2e";
const WORKTREE = "primeira-tarefa";

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

test("an empty machine reaches the first turn, entirely through the screen", async ({ page }) => {
  await page.goto("/");

  // ---------------------------------------------------------------- boas-vindas
  // The daemon's version is read, not asserted by the screen: this is the first
  // sentence the product says, and it has to be true.
  await expect(page.getByRole("heading", { name: /O daemon já está rodando/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Configurar em 5 passos/ }).click();

  // ------------------------------------------------------------------- máquina
  const checks = page.getByRole("group", { name: /encontrou nesta máquina/ });
  await expect(checks.locator(".ck")).toHaveCount(5, { timeout: 15_000 });
  // git is the one check with a floor, and the suite's machine has to clear it.
  // Anchored on the whole phrase: `worktree` alone also matches the disk line,
  // which mentions what a worktree costs.
  await expect(checks.getByText(/git worktree com --orphan/)).toBeVisible();
  await page.getByRole("button", { name: /^Continuar/ }).click();

  // --------------------------------------------------------------------- agente
  // Found on the daemon's PATH by name, which is what the flow does for real.
  // The shim is in the fixture bin directory; see `playwright.config.ts`.
  await expect(page.getByText("claude-agent-acp").first()).toBeVisible({ timeout: 20_000 });
  const test_ = page.getByRole("button", { name: /Testar conexão/ });
  await expect(test_).toBeEnabled({ timeout: 20_000 });
  await test_.click();

  // ------------------------------------------------------------------ handshake
  // The version comes from the adapter's own `initialize`, and this is where the
  // flow's central promise lives: nobody typed `0.0.0`.
  await expect(page.getByText(/ACP v1 · e2e-fake-agent 0\.0\.0/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Nenhum token consumido/)).toBeVisible();
  await page.getByRole("button", { name: /^Continuar/ }).click();

  // ------------------------------------------------------------------ workspace
  await expect(page.getByRole("heading", { name: "Crie seu primeiro workspace" })).toBeVisible();
  // The paths come from the daemon, so this also proves the throwaway state dir
  // the suite runs against is the one being reported.
  await expect(page.getByText(/lumem\.db/)).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(WORKSPACE);
  await page.getByRole("button", { name: /Criar workspace/ }).click();

  // --------------------------------------------------------------------- projeto
  await expect(page.getByRole("heading", { name: "Adicione o primeiro projeto" })).toBeVisible();
  await page.getByLabel(/Pasta do projeto/).fill(E2E_FIXTURE_REPO_ONBOARDING);
  // Read before it is registered: the fixture has exactly one commit.
  await expect(page.getByText(/1 commit\(s\)/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Adicionar projeto/ }).click();

  // ---------------------------------------------------------------------- tarefa
  await expect(page.getByRole("heading", { name: "Toda tarefa vira uma worktree" })).toBeVisible();
  await page.getByLabel("Nome da tarefa").fill(WORKTREE);
  // The literal command, built where it is executed.
  await expect(page.getByText(new RegExp(`git worktree add -b ${WORKTREE}`))).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Criar e abrir a conversa/ }).click();

  // ---------------------------------------------------------------------- pronto
  await expect(page.getByRole("heading", { name: /Pronto\./ })).toBeVisible({ timeout: 30_000 });
  // The receipt is read back from the daemon, and the pinned version is what the
  // probe reported — the whole point of detecting it instead of asking for it.
  await expect(page.getByText(/claude-agent-acp @0\.0\.0/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(new RegExp(`worktrees/.*${WORKTREE}`))).toBeVisible();
  await page.getByRole("button", { name: /Abrir o workspace/ }).click();

  // ------------------------------------------------------------------ a conversa
  // Out of the flow and into the product, on the tab the flow just created.
  await expect(page.getByLabel("Workspace", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });

  // And it answers. Without every step above, this line has nothing to talk to.
  await conversation(page).getByLabel("mensagem para o agente").fill("arruma o frontmatter vazio");
  await conversation(page).getByRole("button", { name: /enviar/ }).click();
  await expect(conversation(page)).toContainText("Vou separar", { timeout: 20_000 });
});
