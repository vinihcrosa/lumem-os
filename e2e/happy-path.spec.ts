import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_AGENT, E2E_FIXTURE_REPO } from "./support/fixtures.js";
import { createAgentConfig, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * The PRD's acceptance list, §9, as one run.
 *
 * Everything here is real: a real git repository, a real `git worktree add`, a
 * real PTY. The only stand-in is the agent, which is a fixture command rather
 * than `claude` — otherwise the suite would depend on authentication, quota and
 * the network.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const WORKTREE = "teste-prd";
const AGENT = "eco";

function terminalText(page: Page) {
  return page.locator(".xterm-rows");
}

async function typeLine(page: Page, line: string): Promise<void> {
  await page.locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

/** Launches an agent through the menu the launcher became. */
async function launchAgent(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /novo agente/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
}

function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("the whole flow, from an empty install to a removed worktree", async ({ page, request }) => {
  await createAgentConfig(request, DAEMON, { name: AGENT, command: E2E_FIXTURE_AGENT });

  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);
  await expect(page.getByRole("button", { name: "fixture", exact: true })).toBeVisible();
  await openProject(page);
  await expect(page.getByText(E2E_FIXTURE_REPO)).toBeVisible();

  // --- worktree ------------------------------------------------------------
  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  const worktreePath = (await page.getByText(/\.lumem.*worktrees/).first().innerText()).trim();
  // On disk and known to git, not merely a row in the daemon's database.
  expect(existsSync(join(worktreePath, "README.md"))).toBe(true);
  expect(gitIn(E2E_FIXTURE_REPO, "worktree", "list")).toContain(WORKTREE);

  // --- shell in the worktree -----------------------------------------------
  await page.getByRole("button", { name: "novo shell" }).click();
  await expect(page.getByTestId("terminal")).toBeVisible();
  await typeLine(page, "git status");
  // The branch is the proof that the cwd really is the worktree.
  await expect(terminalText(page)).toContainText(WORKTREE, { timeout: 20_000 });

  // --- a second shell, in the project this time ----------------------------
  await openProject(page);
  await page.getByRole("button", { name: "novo shell" }).click();
  await expect(page.getByTestId("terminal")).toBeVisible();
  await typeLine(page, "echo shell-do-projeto");
  await expect(terminalText(page)).toContainText("shell-do-projeto", { timeout: 20_000 });

  // Both alive at once — F5.4. Opening the second one navigated to its
  // terminal, so this steps back to the project, which counts every session
  // beneath it: its own and its worktrees'.
  await openProject(page);
  await expect(page.getByText(/[2-9]\d* sessões rodando/)).toBeVisible({ timeout: 20_000 });

  // --- an agent in the worktree --------------------------------------------
  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await launchAgent(page, AGENT);
  await expect(terminalText(page)).toContainText("fake-agent pronto", { timeout: 20_000 });
  await expect(terminalText(page)).toContainText(WORKTREE, { timeout: 20_000 });

  // --- an agent in the project itself, with no worktree (WS-Q15) -----------
  await openProject(page);
  await launchAgent(page, AGENT);
  await expect(terminalText(page)).toContainText("fake-agent pronto", { timeout: 20_000 });

  // --- navigate away and back ----------------------------------------------
  await typeLine(page, "marca-antes-de-sair");
  await expect(terminalText(page)).toContainText("marca-antes-de-sair", { timeout: 20_000 });
  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible();
  await openProject(page);
  // The session in the sidebar, not the "novo <agente>" button beside it —
  // clicking that would start a second agent and assert nothing.
  await page
    .locator('aside [data-kind="agent"][data-scope="project"] > .row .row__main')
    .last()
    .click();

  // F5.6 and F5.7: it never stopped, and the buffer came back with it.
  await expect(terminalText(page)).toContainText("marca-antes-de-sair", { timeout: 20_000 });

  // --- close everything and remove the worktree ----------------------------
  await closeEverySession(page);

  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await page.getByRole("button", { name: "remover worktree" }).click();

  await expect(page.getByRole("heading", { name: WORKTREE })).toBeHidden({ timeout: 20_000 });
  expect(existsSync(worktreePath)).toBe(false);
  expect(gitIn(E2E_FIXTURE_REPO, "worktree", "list")).not.toContain(WORKTREE);
  // F4.7: the branch outlives the checkout.
  expect(gitIn(E2E_FIXTURE_REPO, "branch", "--list", WORKTREE)).toContain(WORKTREE);
});

/**
 * Closes every session the run opened.
 *
 * F4.9 blocks the removal until they are gone, which is the point — this is the
 * user doing what the daemon told them to.
 */
async function closeEverySession(page: Page): Promise<void> {
  const running = page.locator('[data-state="running"] > .row .row__main');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const before = await running.count();
    if (before === 0) return;

    await running.first().click();
    // Waiting for the button rather than probing it once: `isVisible` answers
    // for the instant it is asked, and the detail pane renders a beat after the
    // row is clicked — losing that race skipped the close and left the count
    // exactly where it was, which is what the poll below then timed out on.
    //
    // A session can also end on its own between being listed and being clicked,
    // and the button is simply never there for one that already stopped. That
    // is the case the catch covers.
    await page
      .getByRole("button", { name: "encerrar sessão" })
      .click({ timeout: 5_000 })
      .catch(() => undefined);

    // Counting down rather than waiting on one element: the list re-renders on
    // every event, and a handle to a row from before the render is stale.
    await expect.poll(() => running.count(), { timeout: 20_000 }).toBeLessThan(before);
  }

  throw new Error("as sessões não pararam de aparecer");
}
