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

/**
 * A word the shell prints and the keyboard never typed.
 *
 * The xterm echoes every character of the command, so waiting for a word that
 * appears in the line being typed is satisfied at the instant of the keystroke
 * — before the command has started, let alone finished. Proved here rather than
 * argued: `printf 'x\n' >> README.md` sends all its output to the file and
 * prints nothing, and the wait for "README.md" passed anyway.
 *
 * `printf 'FEIT%s\n' O` puts `FEITO` on the screen without `FEITO` ever being
 * on the command line, so the wait is for the effect. Registered in
 * `docs/project/testing.md`.
 */
function announcing(command: string, word: string): string {
  const head = word.slice(0, -1);
  const tail = word.slice(-1);
  return `${command} && printf '${head}%s\\n' ${tail}`;
}

async function openColumn(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "abrir a coluna de arquivos" });
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

  await typeLine(page, announcing("printf 'escrito pelo terminal\\n' >> README.md", "ESCREVEU"));
  await expect(visiblePanel(page).locator(".xterm-rows")).toContainText("ESCREVEU", {
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
  // The wait that mattered most: with the old `echo COMITADO`, the click below
  // raced a `git commit` that might not have run yet — and it passed almost
  // always, which is the worst way for a test to be wrong.
  await typeLine(page, announcing("git add -A && git commit -q -m 'do terminal'", "COMITADO"));
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

  // O interruptor diz o verbo, e aqui a coluna já está aberta pelo `beforeEach`:
  // é `fechar`. Um botão cujo nome não muda com o estado seria um que se lê como
  // fazendo uma coisa só.
  await page.getByRole("button", { name: "fechar a coluna de arquivos" }).click();
  await expect(page.getByLabel("arquivos do checkout")).toHaveCount(0);

  // The box changed with the window standing still. A terminal that did not
  // refit keeps reporting the old width, and the proof is a line the *shell*
  // printed at the new one — the echo of what was typed would come back
  // whether or not anything on the other end was still listening.
  await typeLine(page, announcing("true", "COLAPSADO"));
  await expect(rows).toContainText("COLAPSADO", { timeout: 20_000 });
});
