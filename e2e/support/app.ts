import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Gets past the first-run screen, PRD §5.
 *
 * Idempotent: the e2e state directory is wiped once per run, not per spec, so
 * the first spec creates the workspace and the rest find it already there.
 */
export async function ensureWorkspace(page: Page, name = "e2e"): Promise<void> {
  // `exact`, because getByLabel matches case-insensitive substrings by
  // default — "Workspace" would also match "Nome do workspace".
  const firstRunField = page.getByLabel("Nome do workspace", { exact: true });
  const selector = page.getByLabel("Workspace", { exact: true });

  // The app shows "conectando ao daemon…" until the workspace list arrives.
  // Checking visibility before that resolves reads as "no first-run screen"
  // and then waits forever for a selector that will never appear.
  await expect(firstRunField.or(selector).first()).toBeVisible({ timeout: 15_000 });

  if (await firstRunField.isVisible()) {
    await firstRunField.fill(name);
    await page.getByRole("button", { name: "criar workspace" }).click();
  }

  await expect(selector).toBeVisible({ timeout: 15_000 });
}

/**
 * Registers the fixture repository, if it is not registered yet.
 *
 * Idempotent for the same reason `ensureWorkspace` is: the state directory is
 * wiped once per run and the specs share what the first one created.
 */
export async function ensureProject(page: Page, path: string, name = "fixture"): Promise<void> {
  // `exact`, because the agent buttons in the main area say "novo <config>"
  // and a substring match would find those too.
  const entry = page.getByRole("button", { name, exact: true });

  // Waited for, not merely asked about. `isVisible` answers immediately, and
  // immediately after `ensureWorkspace` the project list is still in flight —
  // so a project that *is* registered reads as absent, gets added a second
  // time, and the duplicate error stays on screen poisoning the next assertion
  // in the spec. Measured: that is how a second test in the same file starts
  // failing on a `role=alert` it never created.
  const alreadyThere = await entry
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (alreadyThere) return;

  await page.getByRole("button", { name: "adicionar projeto" }).click();
  await page.getByLabel("Caminho ou URL").fill(path);
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "adicionar" }).click();
  await expect(entry).toBeVisible({ timeout: 15_000 });
}

/** Selects a project in the sidebar. */
export async function openProject(page: Page, name = "fixture"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

/**
 * Creates an agent configuration through the daemon's own API.
 *
 * There is no UI for this in the walking skeleton, and PRD §7 requires the API
 * to be able to do everything the client can — so driving it here is using the
 * contract, not going around it.
 */
export async function createAgentConfig(
  request: APIRequestContext,
  daemonUrl: string,
  input: { name: string; command: string; args?: string[] },
): Promise<void> {
  const response = await request.post(`${daemonUrl}/trpc/agentConfig.create`, {
    data: { name: input.name, command: input.command, args: input.args ?? [] },
  });
  // A duplicate is fine: specs share one daemon and the first one to run wins.
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`não deu para criar a config de agente: ${await response.text()}`);
  }
}
