import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO } from "./support/fixtures.js";
import {
  createWorktree,
  dockTerminal,
  endEveryTerminal,
  ensureProject,
  ensureWorkspace,
  openProject,
  openTerminal,
} from "./support/app.js";

/**
 * What a shell leaves behind when it ends — issue #14, as of LUM-62.
 *
 * The issue was a tab that kept showing a terminal nothing could be typed into:
 * "ver registro" brought a dead shell back as a read-only tab, and the only way
 * forward was "nova sessão igual". LUM-62 took the shell out of the tab strip —
 * a terminal lives only in the run dock — so that tab no longer exists, and
 * neither does the verb that reopened it. What still holds, and what this spec
 * is about: a shell that exited **leaves the dock** instead of lingering as a
 * frozen terminal, it is not drawn as a tab, the checkout still lists it as
 * history (it happened), and the way back to working is a new terminal.
 *
 * The record of a dead *agent* conversation (`reabrir`) is covered by
 * `acp-resume.spec.ts`; it never depended on this spec.
 */

/**
 * Its own worktree, and not the project's checkout.
 *
 * The specs share one daemon, and the ones before this leave sessions open in
 * the project on purpose. The dock lists the shells of the scope on screen, so a
 * scope of this spec's own is what makes "no terminal is left" mean anything.
 */
const WORKTREE = "registro";

async function typeLine(page: Page, line: string): Promise<void> {
  // xterm reads the keyboard through a hidden textarea; clicking the rows hits
  // the screen overlay instead and never focuses anything.
  await dockTerminal(page).locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

test("a shell that exited leaves the dock, is no tab, and a new terminal is the way back", async ({
  page,
}) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);
  await openProject(page);

  await createWorktree(page, WORKTREE);
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  const terminal = await openTerminal(page);
  // Announced rather than echoed: waiting for a word that is in the command
  // line is satisfied by the keystrokes, before the shell has run anything.
  await typeLine(page, "printf 'MARC%s\\n' A");
  await expect(terminal.locator(".xterm-rows")).toContainText("MARCA", {
    timeout: 20_000,
  });

  // The session ends on its own, which is exactly the case the issue is about.
  await typeLine(page, "exit");

  // D1: only live work is drawn. The polling that notices the exit takes a
  // tick, so this is the wait, not an assertion of speed. What is on screen
  // afterwards is the empty dock, not a read-only terminal.
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("Nenhum terminal aberto neste checkout.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(dockTerminal(page)).toHaveCount(0);
  await expect(dock.getByRole("group", { name: "terminais do checkout" })).toHaveCount(0);

  // No tab, and no verb that would bring one back: a shell has no tab to reopen
  // (LUM-62), so neither "ver registro" nor "nova sessão igual" is offered.
  await expect(page.getByRole("tab", { name: /shell/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /ver registro/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /nova sessão igual/ })).toHaveCount(0);

  // It happened, so the checkout's own list still says so — as history, with
  // nothing to press. The row is found by its name: the first agent session that
  // `createWorktree` closed is listed there too, and is not what this is about.
  const checkout = page.getByRole("tabpanel", { name: WORKTREE, exact: true });
  const row = checkout
    .locator(".item")
    .filter({ has: page.locator(".item__name", { hasText: /^shell$/ }) });
  await expect(row.getByText(/exited \(/)).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);

  // The way back to working: a new terminal, which starts live — not the dead
  // one, which cannot be resumed.
  await dock.getByRole("button", { name: /abrir terminal/ }).click();
  const live = dockTerminal(page);
  await expect(live).toBeVisible({ timeout: 20_000 });
  await expect(live).not.toHaveAttribute("data-readonly", "true");
  await typeLine(page, "printf 'VIV%s\\n' O");
  await expect(live.locator(".xterm-rows")).toContainText("VIVO", { timeout: 20_000 });

  // Leaves the project as it found it: the live shell has no tab to close, so
  // it ends the way a shell ends.
  await endEveryTerminal(page);
});
