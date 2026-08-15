import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO } from "./support/fixtures.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * The criterion the whole architecture exists for: close the browser with an
 * agent working, reopen it, and the work continued.
 *
 * If this goes red, the PTY architecture is wrong. Nothing downstream is worth
 * fixing until it is green again — every later feature stands on it.
 */

/** How long the browser stays away while the session keeps producing output. */
const ABSENCE_MS = 6_000;

/** Ticks the shell prints, one per second. Longer than the absence, by a lot. */
const TICKS = 40;

const WORKTREE = "sobrevivencia";

function terminalText(page: Page) {
  // xterm renders rows into the DOM; this is what the user actually sees.
  return page.locator(".xterm-rows");
}

/** The largest tick already printed, or 0 if none is on screen. */
function highestTick(text: string): number {
  const numbers = [...text.matchAll(/tick-(\d+)/g)].map((match) => Number(match[1]));
  return numbers.length === 0 ? 0 : Math.max(...numbers);
}

async function typeLine(page: Page, line: string): Promise<void> {
  // xterm reads the keyboard through a hidden textarea; clicking the rows hits
  // the screen overlay instead and never focuses anything.
  await page.locator("textarea.xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

test("a session outlives the client that started it", async ({ browser }) => {
  const firstVisit = await browser.newContext();
  const page = await firstVisit.newPage();
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);
  await openProject(page);

  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "novo shell" }).click();
  await expect(page.getByTestId("terminal")).toBeVisible();

  // A command that keeps writing on its own, so the test can prove output was
  // produced with nobody watching — not merely that the buffer survived.
  await typeLine(page, `for i in $(seq 1 ${TICKS}); do echo tick-$i; sleep 1; done`);
  await expect(terminalText(page)).toContainText("tick-1", { timeout: 15_000 });
  await expect(terminalText(page)).toContainText("tick-2", { timeout: 15_000 });

  // The target is derived from what was on screen at the moment of leaving,
  // not hardcoded: on a slow machine a fixed tick number could already have
  // been printed before the browser closed, and the test would pass while
  // proving nothing.
  const lastSeenBefore = highestTick(await terminalText(page).innerText());
  const producedWhileAway = lastSeenBefore + 3;
  expect(producedWhileAway).toBeLessThan(TICKS);

  // Not page.close(): the whole context goes, so every socket the browser held
  // is gone. This is the user quitting, not switching tabs.
  await firstVisit.close();
  await new Promise((resolve) => setTimeout(resolve, ABSENCE_MS));

  const secondVisit = await browser.newContext();
  const reopened = await secondVisit.newPage();
  await reopened.goto("/");
  await ensureWorkspace(reopened);
  await openProject(reopened);

  // The daemon still lists it; the session was never tied to the connection.
  await reopened.getByRole("button", { name: new RegExp(WORKTREE) }).first().click();
  await reopened.getByRole("button", { name: /shell/ }).first().click();
  await expect(reopened.getByTestId("terminal")).toBeVisible();

  // The heart of it: a tick that could only have been printed while no browser
  // was attached is in the buffer the daemon replayed.
  await expect(terminalText(reopened)).toContainText(`tick-${producedWhileAway}`, {
    timeout: 15_000,
  });

  // And it is still a live process, not a recording.
  await typeLine(reopened, "echo still-accepting-input");
  await expect(terminalText(reopened)).toContainText("still-accepting-input", {
    timeout: 15_000,
  });

  await secondVisit.close();
});
