import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO_FILES } from "./support/fixtures.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * The right panel's own sentence, end to end.
 *
 * With a session running in the middle, the column on the right follows what
 * is on disk: walk into a directory, open a file beside the terminal, write
 * from that same terminal and watch the diff notice.
 */

const PROJECT = "repo-files";

function visiblePanel(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden])");
}

async function typeLine(page: Page, line: string): Promise<void> {
  await visiblePanel(page).locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

async function openColumn(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "arquivos", exact: true });
  if ((await page.getByLabel("arquivos do checkout").count()) === 0) await toggle.click();
  await expect(page.getByLabel("arquivos do checkout")).toBeVisible();
}

/**
 * A row of the column's own tree, so it never matches the sidebar's.
 *
 * Anchored at the start rather than exact: a file's row also carries its size
 * and, once it changes, its status marker.
 */
function treeRow(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .getByRole("tree", { name: "arquivos" })
    .getByRole("button", { name: new RegExp(`^${escaped}\\b`) });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_FILES, PROJECT);
  await openProject(page, PROJECT);
  await openColumn(page);
});

test("walks the tree and reads a file beside the session", async ({ page }) => {
  // One level at a time: `loader.ts` is two directories down and neither was
  // read until it was opened.
  await expect(treeRow(page, "loader.ts")).toHaveCount(0);
  await treeRow(page, "src").click();
  await treeRow(page, "lore").click();
  await treeRow(page, "loader.ts").click();

  // Read in the tab's split, with the checkout's own tab still on screen —
  // the column navigates, the split reads.
  await expect(page.getByText('export const CARIMBO = "lido pela coluna";')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("tree", { name: "arquivos" })).toBeVisible();
  await expect(page.getByRole("separator", { name: "largura do arquivo aberto" })).toBeVisible();

  await page.getByRole("button", { name: "✕ fechar" }).click();
  await expect(page.getByText('export const CARIMBO = "lido pela coluna";')).toHaveCount(0);
});

test("the diff notices what the terminal wrote, in the view that owns it", async ({ page }) => {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: /^shell/ }).click();
  await expect(visiblePanel(page).locator(".xterm-rows")).toBeVisible({ timeout: 20_000 });

  await typeLine(page, "printf 'escrito pelo terminal\\n' >> README.md");
  await expect(visiblePanel(page).locator(".xterm-rows")).toContainText("README.md", {
    timeout: 20_000,
  });

  await page.getByRole("tab", { name: /Mudanças/ }).click();
  await page.getByRole("button", { name: "recarregar" }).click();

  const list = page.getByLabel("arquivos do checkout");
  await expect(list.getByText("README.md")).toBeVisible({ timeout: 20_000 });

  // The patch opens in the same split a file does — and the assertion has to
  // be scoped to it: the same line is on screen twice, because the terminal
  // that wrote it is right there.
  await list.getByText("README.md").click();
  await expect(
    page.locator(".viewer").getByText("escrito pelo terminal"),
  ).toBeVisible({ timeout: 15_000 });

  // Committing empties the uncommitted view and fills the other one: the two
  // views answer different questions about the same checkout.
  await typeLine(page, "git add -A && git commit -q -m 'do terminal' && echo COMITADO");
  await expect(visiblePanel(page).locator(".xterm-rows")).toContainText("COMITADO", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "recarregar" }).click();
  await expect(list.getByText("nada por commitar")).toBeVisible({ timeout: 20_000 });
});

test("collapsing the column leaves the terminal with a size it can use", async ({ page }) => {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: /^shell/ }).click();
  const rows = visiblePanel(page).locator(".xterm-rows");
  await expect(rows).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "arquivos", exact: true }).click();
  await expect(page.getByLabel("arquivos do checkout")).toHaveCount(0);

  // The box changed with the window standing still. A terminal that did not
  // refit keeps reporting the old width, and the proof is that it still echoes
  // a line at the new one.
  await typeLine(page, "echo depois-de-colapsar");
  await expect(rows).toContainText("depois-de-colapsar", { timeout: 20_000 });
});
