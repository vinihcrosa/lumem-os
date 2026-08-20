import { expect, test, type Page } from "@playwright/test";

import {
  createAgentConfig,
  ensureProject,
  ensureWorkspace,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * The sentence phase 3 exists to make true: a task runs end to end, without a
 * terminal.
 *
 * Against the fake ACP agent, never the real `claude` — the suite spends
 * nothing. What only a browser can answer lives here too: jsdom does no layout,
 * so the one measurement the component tests cannot make is the one the
 * prototype got wrong.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-falso";

/**
 * One worktree per test, rather than one shared.
 *
 * The specs share a daemon and a state directory, so a name reused across tests
 * is state carried between them: the second test finds the worktree already
 * there, its idempotency check races the sidebar's render, and it tries to create
 * a duplicate. Unique names make each test start from nothing without any
 * cleanup.
 */
const WORKTREES = {
  fullTurn: "conversa-turno",
  replay: "conversa-replay",
  width: "conversa-largura",
  composer: "conversa-composer",
  parity: "conversa-paridade",
  switch: "conversa-troca",
  terminal: "conversa-terminal",
} as const;

/** The conversation of the tab that is open. */
function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function openConversation(page: Page): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });
  // Atada, e não só visível. O painel renderiza enquanto o socket conecta, e o
  // composer só aceita mensagem depois do `attached` — CI no Linux é onde essa
  // janela aparece, e onde ela custou um turno perdido.
  await expect(conversation(page).getByText("sessão aberta, nada pedido ainda")).toBeVisible({
    timeout: 20_000,
  });
}

async function createWorktree(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(name);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
}

/** Everything up to an open, empty worktree of this test's own. */
async function arrive(page: Page, worktree: string): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, worktree);
}

test.beforeEach(async ({ request }) => {
  // `node` runs the script: the configuration carries the command and its args,
  // which is exactly how a real adapter is pointed at too.
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });
});

test("a real task runs from start to finish, with no terminal", async ({ page }) => {
  await arrive(page, WORKTREES.fullTurn);
  await openConversation(page);
  const conv = conversation(page);

  // No terminal anywhere in this tab. The claim of the whole phase.
  await expect(page.locator("[role=tabpanel]:not([hidden]) .xterm")).toHaveCount(0);

  // A brand new session says what it already cost, rather than showing nothing.
  await expect(conv.getByText("sessão aberta, nada pedido ainda")).toBeVisible();

  const box = conv.getByLabel("mensagem para o agente");
  await box.click();
  await page.keyboard.type("arruma o frontmatter vazio");
  await page.keyboard.press("ControlOrMeta+Enter");

  // The message the user sent is in the conversation, not only in the box they
  // typed it into.
  await expect(conv.getByText("arruma o frontmatter vazio")).toBeVisible();

  // Reasoning arrives collapsed (A3).
  await expect(conv.getByRole("button", { name: /pens/ })).toBeVisible();
  await expect(conv.locator(".thought__text")).toHaveCount(0);

  // Streamed, and assembled into one message rather than one per chunk.
  await expect(conv.getByText("Vou separar o parser antes de consertar.")).toBeVisible({
    timeout: 20_000,
  });

  // A card that finished on its own.
  const readCard = conv.locator(".tc", { hasText: "Read" });
  await expect(readCard).toHaveClass(/tc--ok/, { timeout: 20_000 });

  // The write's diff, painted by the right panel's own renderer (A4).
  const writeCard = conv.locator(".tc", { hasText: "Write" });
  await expect(writeCard).toHaveClass(/tc--ok/);
  await writeCard.getByRole("button", { name: /mostrar o resultado/ }).click();
  await expect(writeCard.locator(".dl--add")).toContainText("parseFrontmatter");
  await expect(writeCard.locator(".dl--del")).toContainText("const FENCE");

  // And the one that stops everything until a person answers.
  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 20_000 });
  await expect(permission.getByText("rm -rf node_modules/.vite")).toBeVisible();
  // The composer says why it cannot be used.
  await expect(box).toBeDisabled();

  await permission.getByRole("button", { name: /permitir uma vez/ }).click();

  // The answered ask becomes the verdict on the card, and stops being a block.
  const bashCard = conv.locator(".tc", { hasText: "Bash" });
  await expect(bashCard.locator(".verdict--allowed")).toBeVisible({ timeout: 20_000 });
  await expect(conv.getByRole("group", { name: "pedido de permissão" })).toHaveCount(0);

  // The turn closes: the interrupt button goes away and the composer comes back.
  await expect(conv.getByText("Pronto. Você pediu: arruma o frontmatter vazio")).toBeVisible({
    timeout: 20_000,
  });
  await expect(box).not.toBeDisabled();
  await expect(conv.getByRole("button", { name: /interromper/ })).toHaveCount(0);
});

test("reloading replays the conversation instead of losing it", async ({ page }) => {
  await arrive(page, WORKTREES.replay);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("primeira pergunta");
  await page.keyboard.press("ControlOrMeta+Enter");

  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 20_000 });
  await permission.getByRole("button", { name: /permitir uma vez/ }).click();
  await expect(conv.getByText(/Pronto\. Você pediu: primeira pergunta/)).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await ensureWorkspace(page);
  await openProject(page, "repo-acp");

  // The tree does not remember its expansion across a reload, so the worktree
  // has to be uncovered before it can be clicked.
  const expand = page.getByRole("button", { name: `expandir repo-acp` });
  if (await expand.isVisible().catch(() => false)) await expand.click();

  /*
   * Scoped to the sidebar, and anchored rather than exact.
   *
   * Anchored because a worktree with a live session carries the count's own
   * announcement in its accessible name — "conversa-replay 1 sessão rodando" —
   * which is the sr-only text doing its job. Scoped because the project's own
   * context tab lists the same worktree with its path, so the name matches twice.
   */
  const worktree = page
    .getByRole("complementary", { name: "navegação" })
    .getByRole("button", { name: new RegExp(`^${WORKTREES.replay}\\b`) });
  await expect(worktree).toBeVisible({ timeout: 20_000 });
  await worktree.click();

  // A reload lands on the context tab, not on the session — which is the existing
  // tab behaviour and not this feature's to change. So the test does what the user
  // does: it opens the tab again.
  await page.getByRole("tab", { name: new RegExp(`^${AGENT}\\b`) }).click();

  const after = conversation(page);
  await expect(after).toBeVisible({ timeout: 20_000 });

  // Everything is back — the question, the answer, the cards and the verdict —
  // and each of them once, not twice.
  //
  // `exact`, because the agent's reply quotes the question back: a substring match
  // finds two elements and the count assertion turns into a false alarm about
  // duplication.
  await expect(after.getByText("primeira pergunta", { exact: true })).toHaveCount(1);
  await expect(after.getByText(/Pronto\. Você pediu: primeira pergunta/)).toHaveCount(1);
  await expect(after.locator(".tc", { hasText: "Bash" }).locator(".verdict--allowed")).toBeVisible();
  await expect(after.getByRole("group", { name: "pedido de permissão" })).toHaveCount(0);
});

test("the file name survives the width the column actually has", async ({ page }) => {
  /*
   * The measurement jsdom cannot make.
   *
   * The prototype passed this at full width and overran the status chip at
   * 360px, which is the width of the column the conversation sits beside. Every
   * width in jsdom is zero, so a component test would assert it and mean
   * nothing — only a real browser has an answer.
   *
   * What is checked is the property, not a pixel: the file name's box must end
   * before the status chip's begins. The directory is allowed to disappear
   * entirely; the name is what answers "where did the agent touch".
   */
  await page.setViewportSize({ width: 900, height: 800 });
  await arrive(page, WORKTREES.width);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("mexe no arquivo de nome comprido");
  await page.keyboard.press("ControlOrMeta+Enter");

  const card = conv.locator(".tc", { hasText: "Write" });
  await expect(card).toBeVisible({ timeout: 20_000 });

  const name = card.locator(".tc__name");
  const status = card.locator(".tc__st");
  const nameBox = await name.boundingBox();
  const statusBox = await status.boundingBox();

  expect(nameBox, "o nome do arquivo tem que estar visível").not.toBeNull();
  expect(statusBox, "o chip de estado tem que estar visível").not.toBeNull();
  expect(
    nameBox!.x + nameBox!.width,
    "o nome do arquivo invadiu o chip de estado",
  ).toBeLessThanOrEqual(statusBox!.x + 1);

  // And the name is still readable, not shrunk to an ellipsis: the directory is
  // what gives way.
  expect(await name.innerText()).toContain("file-tree-keyboard");
});

test("the composer fits the card it lives in", async ({ page }) => {
  /*
   * The other measurement jsdom cannot make, and this one shipped broken.
   *
   * The prototype drew the input as a `div`; the app renders a `textarea`, which
   * brings three things a div does not — an intrinsic width from `cols`,
   * `content-box` sizing that adds padding on top of 100%, and a resize handle.
   * The result was a box wider than the card, with its right border off screen.
   *
   * Asserted as a property rather than a pixel: the composer's box must end
   * before its card does, at a narrow width where the difference shows.
   */
  await page.setViewportSize({ width: 900, height: 800 });
  await arrive(page, WORKTREES.composer);
  await openConversation(page);
  const conv = conversation(page);

  const box = conv.getByLabel("mensagem para o agente");
  await expect(box).toBeVisible();

  const inner = await box.boundingBox();
  const card = await conv.locator(".composer__box").boundingBox();
  const column = await conv.boundingBox();

  expect(inner, "o campo tem que estar visível").not.toBeNull();
  expect(card, "a caixa do composer tem que estar visível").not.toBeNull();
  expect(column, "a coluna da conversa tem que estar visível").not.toBeNull();

  /*
   * It fills the card, and that is the bug that shipped.
   *
   * A `textarea` with no width is as wide as its `cols` attribute — about 340px —
   * so the field sat inside a card twice its width with dead space to the right
   * of it. Asserting "fits" would have passed on the broken version.
   */
  expect(inner!.width, "o campo não ocupa a largura da caixa").toBeGreaterThan(
    card!.width - 4,
  );
  expect(
    inner!.x + inner!.width,
    "o campo passou da direita da caixa do composer",
  ).toBeLessThanOrEqual(card!.x + card!.width + 1);
  expect(
    card!.x + card!.width,
    "a caixa do composer passou da direita da coluna",
  ).toBeLessThanOrEqual(column!.x + column!.width + 1);

  // And it does not carry a drag handle: a box the user can pull past its own
  // card is a box that can be pulled past its own card.
  expect(await box.evaluate((node) => getComputedStyle(node).resize)).toBe("none");
});

test("everything phase 4 added is on the screen in one turn", async ({ page }) => {
  await arrive(page, WORKTREES.parity);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("faz o trabalho todo");
  await page.keyboard.press("ControlOrMeta+Enter");

  // The plan arrives and then advances. One card, rewritten — two would mean the
  // conversation is accumulating near-identical copies.
  await expect(conv.locator(".plan")).toHaveCount(1, { timeout: 20_000 });
  await expect(conv.getByText("0 de 2")).toBeVisible();

  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 20_000 });
  await permission.getByRole("button", { name: /permitir uma vez/ }).click();

  await expect(conv.getByText("1 de 2")).toBeVisible({ timeout: 20_000 });
  await expect(conv.locator(".plan")).toHaveCount(1);

  // What the turn cost, and the subscription's own limit — the block that made
  // `/usage` unnecessary.
  const usage = conv.locator(".usage");
  await expect(usage).toBeVisible({ timeout: 20_000 });
  await expect(usage).toContainText("39,2k / 1M");
  await expect(usage).toContainText("US$ 0,2354");
  await expect(usage).toContainText("31%");
  // Below the agent's own threshold, so the meter stays quiet and there is no band.
  await expect(conv.locator(".u--warn")).toHaveCount(0);
  await expect(conv.locator(".overage")).toHaveCount(0);

  // The meter actually fills, which is the regression the prototype shipped.
  const fill = await usage.locator(".meter").first().getAttribute("data-fill");
  expect(fill).toBe("3.92%");

  // The agent's own commands, offered by `/` and inserted rather than sent.
  const box = conv.getByLabel("mensagem para o agente");
  await box.click();
  await page.keyboard.type("/");
  await expect(conv.getByRole("option", { name: /gate/ })).toBeVisible();

  /*
   * Chosen with the keyboard, which is the primary path for a command palette and
   * the deterministic one here. Selection happens on mouse *down* — the textarea
   * loses focus otherwise — so Playwright's click sees the element replaced between
   * down and up and retries until the test times out. The behaviour is right; the
   * gesture is what a real user rarely uses.
   */
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("/gate");
});

test("the model switch survives a reload", async ({ page }) => {
  await arrive(page, WORKTREES.switch);
  await openConversation(page);
  const conv = conversation(page);

  // Seeded by the attach frame, not by waiting for the agent to mention something.
  const pill = conv.getByRole("button", { name: /^Model:/ });
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await expect(pill).toHaveAccessibleName("Model: opus[1m]");

  await pill.click();
  await conv.getByRole("menuitemradio", { name: /sonnet/ }).click();

  // The pill follows the agent's answer rather than the click.
  await expect(conv.getByRole("button", { name: "Model: sonnet" })).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await ensureWorkspace(page);
  await openProject(page, "repo-acp");
  const expand = page.getByRole("button", { name: "expandir repo-acp" });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  await page
    .getByRole("complementary", { name: "navegação" })
    .getByRole("button", { name: new RegExp(`^${WORKTREES.switch}\\b`) })
    .click();
  await page.getByRole("tab", { name: new RegExp(`^${AGENT}\\b`) }).click();

  // D9: the row keeps the choice, so the tab reopens on `sonnet` and not on the
  // configuration's default.
  await expect(
    conversation(page).getByRole("button", { name: "Model: sonnet" }),
  ).toBeVisible({ timeout: 20_000 });
});

test("the terminal the agent asks for lives inside its card", async ({ page }) => {
  await arrive(page, WORKTREES.terminal);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("roda um comando");
  await page.keyboard.press("ControlOrMeta+Enter");

  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 20_000 });
  await permission.getByRole("button", { name: /permitir uma vez/ }).click();

  // The card that asked for a terminal, opened.
  const card = conv.locator(".tc", { hasText: "echo do-agente" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: /mostrar o resultado/ }).click();

  // D7 and F3.2: the app's own `Terminal`, attached to the PTY the daemon opened —
  // and printing, which proves the socket found a real session rather than an id.
  await expect(card.locator(".xterm")).toBeVisible({ timeout: 20_000 });
  await expect(card.locator(".xterm-rows")).toContainText("saida-do-terminal", {
    timeout: 20_000,
  });

  // Inside the card, never as a tab of its own: the user did not start it and
  // cannot close it, so a tab would offer a close button that fights the agent.
  await expect(page.getByRole("tab", { name: /^sh\b/ })).toHaveCount(0);
});
