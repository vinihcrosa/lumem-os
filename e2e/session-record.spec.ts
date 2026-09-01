import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO } from "./support/fixtures.js";
import { createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * What a session leaves behind when it ends — issue #14.
 *
 * D1 says a tab is live work and F5.9 says the buffer of a dead session stays
 * readable; the two together produce a tab that shows a terminal nothing can
 * be typed into. This spec is about that tab saying so: it comes back through
 * "ver registro", it announces itself as read-only, and the only thing on
 * offer is a new session — because resuming the dead one is not something the
 * daemon can do.
 */

/**
 * Its own worktree, and not the project's checkout.
 *
 * The specs share one daemon, and the ones before this leave sessions open in
 * the project on purpose. Tabs belong to the scope on screen, so a scope of
 * this spec's own is what makes "no tab is left" mean anything here.
 */
const WORKTREE = "registro";

function openPanel(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden])");
}

async function typeLine(page: Page, line: string): Promise<void> {
  // xterm reads the keyboard through a hidden textarea; clicking the rows hits
  // the screen overlay instead and never focuses anything.
  await openPanel(page).locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

async function newShell(page: Page): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: /^shell/ }).click();
  await expect(openPanel(page).getByTestId("terminal")).toBeVisible();
}

/**
 * Dismisses every tab in the scope on screen.
 *
 * A record's ✕ only discards the view; a live session's ends the process and
 * the tab follows on the next poll. Both are covered by waiting for the count
 * to drop rather than for a single element.
 */
async function closeEveryTab(page: Page): Promise<void> {
  const closers = page.getByRole("button", { name: /^fechar / });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const before = await closers.count();
    if (before === 0) return;

    await closers.first().click();
    await expect.poll(() => closers.count(), { timeout: 20_000 }).toBeLessThan(before);
  }

  throw new Error("as abas não pararam de aparecer");
}

test("a session that exited comes back as a record, and says it is one", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);
  await openProject(page);

  await createWorktree(page, WORKTREE);
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  await newShell(page);
  // Announced rather than echoed: waiting for a word that is in the command
  // line is satisfied by the keystrokes, before the shell has run anything.
  await typeLine(page, "printf 'MARC%s\\n' A");
  await expect(openPanel(page).locator(".xterm-rows")).toContainText("MARCA", {
    timeout: 20_000,
  });

  // The session ends on its own, which is exactly the case the issue is about.
  await typeLine(page, "exit");

  // D1: the tab goes away with the process. The polling that notices it takes
  // a tick, so this is the wait, not an assertion of speed.
  await expect(page.getByRole("button", { name: /^fechar shell/ })).toBeHidden({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /ver registro/ }).click();

  // The tab says what it is, and so does the panel.
  await expect(page.getByRole("tab", { name: /registro/ })).toBeVisible();
  const record = page.getByRole("tabpanel", { name: /registro de shell/ });
  await expect(record.getByText(/somente leitura/)).toBeVisible();
  // F5.9: what the session printed is still there — that is the whole point of
  // keeping it around.
  await expect(record.locator(".xterm-rows")).toContainText("MARCA");
  await expect(record.getByTestId("terminal")).toHaveAttribute("data-readonly", "true");

  // And typing really does go nowhere: the buffer is what it was.
  await record.locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type("nao-entra");
  await page.keyboard.press("Enter");
  await expect(record.locator(".xterm-rows")).not.toContainText("nao-entra");

  // The way back to working, which the record is the only place to offer.
  await page.getByRole("button", { name: /nova sessão igual/ }).click();
  const live = openPanel(page);
  await expect(live.getByTestId("terminal")).not.toHaveAttribute("data-readonly", "true");
  await typeLine(page, "printf 'VIV%s\\n' O");
  await expect(live.locator(".xterm-rows")).toContainText("VIVO", { timeout: 20_000 });

  // Leaves the project as it found it. Two tabs are open by now — the record,
  // which only has to be dismissed, and the live session, whose tab goes away
  // by the process actually ending.
  await closeEveryTab(page);
});
