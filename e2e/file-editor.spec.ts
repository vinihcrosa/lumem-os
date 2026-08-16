import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_FIXTURE_AGENT, E2E_FIXTURE_REPO_EDITOR } from "./support/fixtures.js";
import { createAgentConfig, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * The sentence the whole feature exists for, end to end.
 *
 * *With an agent running in the tab, you fix one line of the file open beside
 * it, and the correction shows up in `Mudanças` without you having touched
 * another tool.* Everything here is real — a real repository, a real PTY, a
 * real daemon writing to a real disk — and every claim about what landed is
 * checked **outside the browser**, with `readFileSync`. The screen saying
 * "salvo há 1 s" is the client's opinion; the file is the fact.
 *
 * The one stand-in is the agent, a fixture command rather than `claude`, for
 * the reason the whole suite uses it: otherwise this would depend on
 * authentication, quota and the network.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const PROJECT = "repo-editor";
const AGENT = "eco";

const NOTES = "src/notes.ts";
const WRONG = 'export const RESPOSTA = "quarenta e um";';
const FIXED = 'export const RESPOSTA = "quarenta e dois";';
/** Carried in with the correction: one extra line is what makes the two counts differ. */
const WHY = "// conferido no editor";

function visiblePanel(page: Page): Locator {
  return page.locator("[role=tabpanel]:not([hidden])");
}

/** The editor of the tab that is in front; every other tab stays mounted. */
function editor(page: Page): Locator {
  return visiblePanel(page).locator(".cm-content");
}

/** Where autosave says everything it says about itself (F2.3). */
function footer(page: Page): Locator {
  return visiblePanel(page).locator(".viewer__foot");
}

function onDisk(relative: string): string {
  return join(E2E_FIXTURE_REPO_EDITOR, relative);
}

function diskText(relative: string): string {
  return readFileSync(onDisk(relative), "utf8");
}

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: E2E_FIXTURE_REPO_EDITOR });
}

async function typeLine(page: Page, line: string): Promise<void> {
  await visiblePanel(page).locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

async function newSession(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
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
function treeRow(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .getByRole("tree", { name: "arquivos" })
    .getByRole("button", { name: new RegExp(`^${escaped}\\b`) });
}

/** One directory at a time, which is how the tree is read (D2 of right-panel). */
async function openFile(page: Page, path: string): Promise<void> {
  for (const part of path.split("/")) await treeRow(page, part).click();
}

/**
 * The `⋯` of a row, which does not exist until the pointer is on the line.
 *
 * `right-panel.css` keeps it at `display: none` and reveals it with
 * `.frow-wrap:hover` — and playwright decides an element is invisible *before*
 * it moves the mouse, so clicking it straight away times out on something that
 * would have appeared. The root's `＋` has no such problem: it lives in the
 * column's bar, in the flow.
 */
async function openRowMenu(page: Page, path: string): Promise<void> {
  const name = path.slice(path.lastIndexOf("/") + 1);
  await treeRow(page, name).hover();
  await page.getByRole("button", { name: `ações de ${path}`, exact: true }).click();
}

/** One whole line replaced, which is the gesture the PRD's sentence is about. */
async function rewriteLine(page: Page, index: number, text: string): Promise<void> {
  await editor(page).locator(".cm-line").nth(index).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page, request }) => {
  // Back to the seed commit before every test, with whatever the last one
  // created removed. `.lumem-e2e-fixtures` is rebuilt once per *run*, and this
  // is the first spec whose tests each leave the checkout different from how
  // they found it — "a correção aparece em Mudanças" would otherwise be reading
  // the previous test's dirt.
  git("reset", "--hard", "--quiet");
  git("clean", "-fdq");

  await createAgentConfig(request, DAEMON, { name: AGENT, command: E2E_FIXTURE_AGENT });
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_EDITOR, PROJECT);
  await openProject(page, PROJECT);
  await openColumn(page);
});

test("fixes a line while the agent runs beside it, and the diff notices", async ({ page }) => {
  await newSession(page, AGENT);
  await expect(visiblePanel(page).locator(".xterm-rows")).toContainText("fake-agent pronto", {
    timeout: 20_000,
  });

  await openFile(page, NOTES);
  await expect(editor(page)).toContainText(WRONG, { timeout: 20_000 });

  // One line becoming two, deliberately. A symmetric correction reads +1 −1,
  // and a row that swapped `additions` for `deletions` would print exactly the
  // same thing — the assertion at the end of this test would survive the swap.
  await rewriteLine(page, 0, `${WHY}\n${FIXED}`);
  await expect(footer(page)).toContainText("salvo há", { timeout: 20_000 });

  // The claim, where the browser cannot help: the daemon put the corrected
  // line on the disk, and took the wrong one off it.
  await expect.poll(() => diskText(NOTES), { timeout: 20_000 }).toContain(FIXED);
  expect(diskText(NOTES)).not.toContain(WRONG);
  expect(diskText(NOTES)).toContain(WHY);

  // Still there — the whole argument of §2 is that fixing this line did not
  // cost the context, and the agent leaving the screen would be that cost.
  await expect(visiblePanel(page).locator(".xterm-rows")).toBeVisible();

  await page.getByRole("tab", { name: /Mudanças/ }).click();
  const column = page.getByLabel("arquivos do checkout");
  const row = column.getByRole("button").filter({ hasText: "notes.ts" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // Two lines in, one out, and the two numbers differ: this is what makes the
  // row say which side is which. The diff is the correction and nothing else.
  await expect(row).toContainText("+2");
  await expect(row).toContainText("−1");
});

test("the terminal writes the open file, and overwriting leaves the editor's text", async ({
  page,
}) => {
  const mine = 'export const AUTOR = "eu, no editor";';

  await newSession(page, "shell");
  await expect(visiblePanel(page).locator(".xterm-rows")).toBeVisible({ timeout: 20_000 });

  await openFile(page, NOTES);
  await expect(editor(page)).toContainText(WRONG, { timeout: 20_000 });

  // A first save, so the buffer's base revision is what is on the disk — which
  // is exactly what the terminal is about to move out from under it.
  await rewriteLine(page, 0, FIXED);
  await expect(footer(page)).toContainText("salvo há", { timeout: 20_000 });
  await expect.poll(() => diskText(NOTES), { timeout: 20_000 }).toContain(FIXED);

  // The wait is the disk, never the terminal. `typeLine` types the command and
  // the xterm echoes every character, so waiting for a word that is *in* the
  // command waits for the keystroke and not for the effect — registered in
  // testing.md, and the reason this file asks the filesystem instead.
  await typeLine(page, `printf 'linha do agente\\n' >> ${NOTES}`);
  await expect.poll(() => diskText(NOTES), { timeout: 20_000 }).toContain("linha do agente");

  // Typing now writes against a revision the disk no longer has (F3.2).
  await rewriteLine(page, 1, mine);

  const conflict = page.getByRole("alert").filter({ hasText: "o agente escreveu este arquivo" });
  await expect(conflict).toBeVisible({ timeout: 20_000 });
  await expect(footer(page)).toContainText("mudou no disco");

  const overwrite = conflict.getByRole("button", { name: /sobrescrever/ });
  // The agent's half of the cost comes from a read that is still in the air
  // when the bar first paints, and the button is born without the number.
  // Clicking before it lands is clicking an exit whose price is not on it yet.
  await expect(overwrite).toContainText("(+1", { timeout: 20_000 });
  await overwrite.click();

  await expect(footer(page)).toContainText("salvo há", { timeout: 20_000 });
  await expect.poll(() => diskText(NOTES), { timeout: 20_000 }).toContain(mine);
  // What that exit is *named* after: the agent's line is the thing it loses.
  expect(diskText(NOTES)).not.toContain("linha do agente");
});

test("creates, renames and deletes from the tree, with the disk keeping up", async ({ page }) => {
  const created = "criado-pela-arvore.md";
  const renamed = "renomeado-pela-arvore.md";

  // The root's `＋` is in the column's bar, so creating in the checkout itself
  // does not need a directory expanded first — the root has no row to hang a
  // `⋯` on, which is why the trigger lives out there.
  await page.getByRole("button", { name: "criar na raiz" }).click();
  await page.getByRole("menuitem", { name: /novo arquivo/ }).click();
  await page.getByLabel("novo arquivo").fill(created);
  await page.getByLabel("novo arquivo").press("Enter");

  await expect(treeRow(page, created)).toBeVisible({ timeout: 20_000 });
  expect(existsSync(onDisk(created))).toBe(true);

  await openRowMenu(page, created);
  await page.getByRole("menuitem", { name: "renomear" }).click();
  await page.getByLabel("renomear").fill(renamed);
  await page.getByLabel("renomear").press("Enter");

  await expect(treeRow(page, renamed)).toBeVisible({ timeout: 20_000 });
  await expect(treeRow(page, created)).toHaveCount(0);
  expect(existsSync(onDisk(renamed))).toBe(true);
  expect(existsSync(onDisk(created))).toBe(false);

  await openRowMenu(page, renamed);
  await page.getByRole("menuitem", { name: "apagar" }).click();
  const dialog = page.getByRole("dialog", { name: `apagar ${renamed}` });
  // F4.3, and the file was never committed: the dialog has to say that nothing
  // brings it back, and it cannot say that before `deletePreview` answered.
  await expect(dialog).toContainText("o git não confirmou ter uma cópia disto", {
    timeout: 20_000,
  });
  await dialog.getByRole("button", { name: "apagar", exact: true }).click();

  await expect(treeRow(page, renamed)).toHaveCount(0, { timeout: 20_000 });
  expect(existsSync(onDisk(renamed))).toBe(false);
});

test("renaming the open file from the tree keeps text that was never saved", async ({ page }) => {
  const moved = "src/renomeado.ts";
  const typed = "// SUJO-NO-EDITOR";

  /*
   * A slow disk, on purpose, and this is the only place in the suite that asks
   * for one.
   *
   * Not to make the ordering bug visible: measured with no interception at all,
   * a rename that stops waiting for the flush to land dies here 5 runs out of 5
   * on this machine. What the delay buys is the **precondition**. The assertion
   * below runs before the rename is submitted and claims the disk has never
   * seen the typed text — with a local write finishing in a couple of
   * milliseconds, the 800 ms debounce can land inside that window on a slower
   * machine, and the test would then go green having proved the easy case:
   * renaming a file that was already saved. Held for a second and a half, the
   * write cannot possibly have finished by the time the rename is submitted.
   *
   * The regex matches the batch URL too (`files.write,files.rename`), so a
   * regression that puts the two back in one request is delayed as a whole
   * rather than sliding past this.
   */
  await page.route(/\/trpc\/[^?]*files\.write/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });

  await openFile(page, NOTES);
  await expect(editor(page)).toContainText(WRONG, { timeout: 20_000 });

  // The gesture is opened first and submitted last: what has to be true at the
  // moment of the rename is a buffer the disk has never seen.
  await openRowMenu(page, NOTES);
  await page.getByRole("menuitem", { name: "renomear" }).click();
  const field = page.getByLabel("renomear");
  await field.fill(moved);

  await editor(page).locator(".cm-line").nth(0).click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${typed}`);

  // Asserted rather than assumed. If this ever fails, everything below would be
  // proving the easy case — renaming a file that was already saved — while
  // still going green.
  expect(diskText(NOTES)).not.toContain(typed);
  await field.press("Enter");

  await expect(treeRow(page, "renomeado.ts")).toBeVisible({ timeout: 30_000 });
  await expect(treeRow(page, "notes.ts")).toHaveCount(0);
  // F4.6: the split followed the file instead of sitting on a path that no
  // longer exists, and it is showing the path as the daemon spelled it back.
  await expect(visiblePanel(page).locator(".viewer__head .fpath")).toHaveAttribute("title", moved);

  // The property, measured where the browser has no say: the text that existed
  // only in the buffer is at the new path, and the old path is gone. This is
  // the one place it can be proved — the unit test for it runs against a mock
  // with no transport, and the transport is where it used to break.
  expect(existsSync(onDisk(NOTES))).toBe(false);
  expect(diskText(moved)).toContain(typed);
  expect(diskText(moved)).toContain(WRONG);
});
