import { expect, test, type Page } from "@playwright/test";

import {
  createWorktree,
  ensureProject,
  ensureWorkspace,
  openConfiguredAgent,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";
import { E2E_SERVER_PORT } from "../ports.js";

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
const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

/**
 * The agents panel in the sidebar footer.
 *
 * Everything about the panel is scoped through it: its submit button says
 * "adicionar", the tree heading's action says "adicionar projeto", and an unscoped
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

  // Listed with the version the form just wrote. Transport is no longer a
  // configuration field: every agent configuration is ACP.
  const row = agents(page).locator(".agents__row", { hasText: AGENT });
  await expect(row).toBeVisible();
  await expect(row).toContainText("0.0.0-fake");
  await expect(row.getByText("fora do PATH")).toHaveCount(0);

  await agents(page).getByRole("button", { name: "fechar" }).click();

  await createWorktree(page, WORKTREE, "repo-acp");
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  // This spec covers registering and launching the custom ACP configuration;
  // the new-agent menu itself now opens a draft and is covered separately.
  await openConfiguredAgent(page, DAEMON, AGENT, WORKTREE);

  await conversation(page).getByLabel("mensagem para o agente").fill("arruma o frontmatter vazio");
  await conversation(page).getByRole("button", { name: /enviar/ }).click();
  await expect(conversation(page)).toContainText("Vou separar", { timeout: 20_000 });
});
