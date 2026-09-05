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

/**
 * The buffer of the tab that is open.
 *
 * Every tab's terminal stays mounted so switching does not cost a reconnect and
 * a repaint — which means `.xterm-rows` matches one per open session, and only
 * the visible panel is the one being asked about.
 */
function terminalText(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .xterm-rows");
}

async function typeLine(page: Page, line: string): Promise<void> {
  await page.locator("[role=tabpanel]:not([hidden]) textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

/**
 * A word the shell prints and the keyboard never typed.
 *
 * The xterm echoes every character of the command, so waiting for a word that
 * appears in the line being typed is satisfied at the instant of the keystroke
 * — before the command has started, let alone finished. `printf 'FEIT%s\n' O`
 * puts `FEITO` on the screen without `FEITO` ever being on the command line, so
 * the wait is for the effect. Registered in `docs/project/testing.md`, and the
 * copy of `right-panel.spec.ts` is deliberate: helpers here live per spec.
 */
function announcing(command: string, word: string): string {
  const head = word.slice(0, -1);
  const tail = word.slice(-1);
  return `${command} && printf '${head}%s\\n' ${tail}`;
}

/** Opens a session through the strip's own menu, where both kinds now live. */
async function newSession(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  // The hint carries the command, so the name is anchored at the start only.
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
}

/**
 * Ends every session open in the current worktree, through its tab.
 *
 * F4.9 blocks removal until they are gone, which is the point — this is the
 * user doing what the daemon told them to. A tab going away is the proof the
 * process actually stopped: the client refuses to merely hide a live one.
 */
async function closeEveryTab(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const closers = page.getByRole("button", { name: /^fechar / });
    const before = await closers.count();
    if (before === 0) return;

    await closers.first().click();
    await expect.poll(() => closers.count(), { timeout: 20_000 }).toBeLessThan(before);
  }

  throw new Error("as abas não pararam de aparecer");
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
  // Scoped to the checkout's own tab: the path also appears in a session tab's
  // own header, as the cwd it was launched in. The tab is named after the
  // checkout now — `local` for the project's own one.
  await expect(
    page.getByRole("tabpanel", { name: "local" }).getByText(E2E_FIXTURE_REPO),
  ).toBeVisible();

  // --- worktree ------------------------------------------------------------
  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  const worktreePath = (
    await page
      .getByRole("tabpanel", { name: WORKTREE })
      .getByText(/\.lumem.*worktrees/)
      .first()
      .innerText()
  ).trim();
  // On disk and known to git, not merely a row in the daemon's database.
  expect(existsSync(join(worktreePath, "README.md"))).toBe(true);
  expect(gitIn(E2E_FIXTURE_REPO, "worktree", "list")).toContain(WORKTREE);

  // --- shell in the worktree -----------------------------------------------
  await newSession(page, "shell");
  await expect(page.locator("[role=tabpanel]:not([hidden])").getByTestId("terminal")).toBeVisible();
  await typeLine(page, "git status");
  // The branch is the proof that the cwd really is the worktree.
  await expect(terminalText(page)).toContainText(WORKTREE, { timeout: 20_000 });

  // --- a second shell, in the project this time ----------------------------
  await openProject(page);
  await newSession(page, "shell");
  await expect(page.locator("[role=tabpanel]:not([hidden])").getByTestId("terminal")).toBeVisible();
  // Announced rather than echoed: waiting for "shell-do-projeto" was satisfied
  // by the keystrokes that typed the command, so the shell in the project was
  // never proved to have run anything.
  await typeLine(page, announcing("echo shell-do-projeto", "RODOU"));
  await expect(terminalText(page)).toContainText("RODOU", { timeout: 20_000 });

  // Both alive at once — F5.4. The count lives on the sidebar row now, and the
  // worktree still reporting one is the proof that opening a session in the
  // project did not take its shell down.
  await openProject(page);
  await expect(
    page.getByRole("button", { name: new RegExp(`^${WORKTREE} \\d+ sess`) }),
  ).toBeVisible({ timeout: 20_000 });

  // --- an agent in the worktree --------------------------------------------
  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await newSession(page, AGENT);
  await expect(terminalText(page)).toContainText("fake-agent pronto", { timeout: 20_000 });
  await expect(terminalText(page)).toContainText(WORKTREE, { timeout: 20_000 });

  // --- an agent in the project itself, with no worktree (WS-Q15) -----------
  await openProject(page);
  await newSession(page, AGENT);
  await expect(terminalText(page)).toContainText("fake-agent pronto", { timeout: 20_000 });

  // --- navigate away and back ----------------------------------------------
  await typeLine(page, "marca-antes-de-sair");
  await expect(terminalText(page)).toContainText("marca-antes-de-sair", { timeout: 20_000 });
  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible();
  await openProject(page);
  // The session in the sidebar, not the "novo <agente>" button beside it —
  // clicking that would start a second agent and assert nothing.
  await page.getByRole("tab", { name: new RegExp(`^${AGENT}`) }).last().click();

  // F5.6 and F5.7: it never stopped, and the buffer came back with it.
  await expect(terminalText(page)).toContainText("marca-antes-de-sair", { timeout: 20_000 });

  // --- close everything and remove the worktree ----------------------------
  // Tabs belong to the scope that is open, so the worktree has to be selected
  // before its own are closed. F4.9 only blocks on the worktree's sessions —
  // the ones in the project are somebody else's problem.
  await page.getByRole("button", { name: new RegExp(`^${WORKTREE}`) }).first().click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible();
  await closeEveryTab(page);

  await page.getByRole("button", { name: "remover worktree" }).click();

  await expect(page.getByRole("heading", { name: WORKTREE })).toBeHidden({ timeout: 20_000 });
  expect(existsSync(worktreePath)).toBe(false);
  expect(gitIn(E2E_FIXTURE_REPO, "worktree", "list")).not.toContain(WORKTREE);
  // F4.7: the branch outlives the checkout.
  expect(gitIn(E2E_FIXTURE_REPO, "branch", "--list", WORKTREE)).toContain(WORKTREE);
});
