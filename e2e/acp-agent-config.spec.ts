import { expect, test, type Page } from "@playwright/test";

import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * The `curl` this phase exists to delete.
 *
 * Every other spec creates its agent configuration through the API, which is fair —
 * the configuration is their setup, not their subject. Here it *is* the subject: an ACP
 * configuration needs a transport and a pinned adapter version, and until this screen
 * existed neither could be written without an HTTP call by hand.
 *
 * So this one touches the API for nothing. Workspace, project, agent, session: all of
 * it through the screen.
 *
 * The way in changed with the login panel: the footer's action is now "conectar um
 * agente", and this five-field form is the drawer behind "outro agente ACP…" — the
 * one path that still needs it, for an adapter the daemon neither installs nor can
 * name. Which is exactly what this spec's agent is.
 */

const AGENT = "acp-pela-tela";
const WORKTREE = "agente-pela-tela";

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

/**
 * The agents panel in the sidebar footer.
 *
 * Everything about the panel is scoped through it: its submit button says
 * "adicionar", the footer action next to it says "adicionar projeto", and an unscoped
 * name match takes both. Same rule `testing.md` already records — a locator by
 * accessible name is anchored or scoped, never bare.
 */
function agents(page: Page) {
  return page.locator(".agents");
}

test("creates the ACP agent from the screen, then talks to it", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");

  // The agent, from the sidebar footer. This is the whole point of the spec.
  await page.getByRole("button", { name: /conectar um agente|^claude/ }).first().click();
  await page.getByRole("button", { name: /outro agente ACP/ }).click();
  await agents(page).getByLabel("Nome").fill(AGENT);
  await agents(page).getByLabel("Comando").fill(process.execPath);
  // Space-separated, the way a command line is written. No path here has a space in
  // it, which is the one case this field cannot express.
  await agents(page).getByLabel("Argumentos (opcional)").fill(E2E_FAKE_ACP_AGENT);
  await agents(page).getByLabel("Versão do adaptador").fill("0.0.0-fake");
  await agents(page).getByRole("button", { name: "adicionar" }).click();

  // Listed, and listed as a conversation: the chip is the transport the form just
  // wrote, read back from the daemon.
  const row = agents(page).locator(".agents__row", { hasText: AGENT });
  await expect(row).toBeVisible();
  await expect(row.getByText("conversa")).toBeVisible();
  await expect(row.getByText("fora do PATH")).toHaveCount(0);

  await agents(page).getByRole("button", { name: "fechar" }).click();

  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  // And it launches. Without the two fields the form wrote, this session would be a
  // terminal — or would not exist at all.
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });
  // Attached, not merely visible: the composer only accepts a message once the
  // `attached` frame lands, and CI on Linux is where that window shows up.
  await expect(conversation(page).getByText("sessão aberta, nada pedido ainda")).toBeVisible({
    timeout: 20_000,
  });

  await conversation(page).getByLabel("mensagem para o agente").fill("arruma o frontmatter vazio");
  await conversation(page).getByRole("button", { name: /enviar/ }).click();
  await expect(conversation(page)).toContainText("Vou separar", { timeout: 20_000 });
});
