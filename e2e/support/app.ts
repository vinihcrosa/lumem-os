import { expect, type Page } from "@playwright/test";

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
