import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_AGENT, E2E_FIXTURE_REPO, E2E_FIXTURE_REPO_ALT } from "./support/fixtures.js";
import { createAgentConfig, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query, startDaemon } from "./support/daemon.js";
import { E2E_RESTART_PORT, E2E_SERVER_PORT } from "../ports.js";

/**
 * The degraded states of PRD §8.
 *
 * Every line here is something that happens in the first week of real use, and
 * the requirement in each case is the same: refuse clearly, say which of the
 * possible reasons it is, and leave nothing half-done.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "eco";
const BROKEN_AGENT = "agente-fantasma";

function terminalText(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .xterm-rows");
}

async function openFixtureProject(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);
  await openProject(page);
}

test("adding a directory that is not a git repository is refused", async ({ page }) => {
  await openFixtureProject(page);
  const notARepo = mkdtempSync(join(tmpdir(), "lumem-nao-repo-"));

  await page.getByRole("button", { name: "adicionar projeto" }).click();
  await page.getByLabel("Caminho ou URL").fill(notARepo);
  await page.getByRole("button", { name: "adicionar" }).click();

  // F2.2: which check failed, not "invalid path".
  await expect(page.getByRole("alert")).toContainText("não é um repositório git");
  await expect(page.getByRole("button", { name: "adicionar" })).toBeVisible();
  rmSync(notARepo, { recursive: true, force: true });
});

test("creating a worktree on an existing branch is refused", async ({ page }) => {
  await openFixtureProject(page);

  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill("main");
  await page.getByRole("button", { name: "criar" }).click();

  await expect(page.getByRole("alert")).toContainText("escolha outro nome");
});

test("a worktree with a live session cannot be removed", async ({ page }) => {
  await openFixtureProject(page);
  const name = "erro-sessao-viva";

  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(name);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: /^shell/ }).click();
  await expect(page.locator("[role=tabpanel]:not([hidden])").getByTestId("terminal")).toBeVisible();

  // A ação destrutiva mora na aba do checkout, e a sessão está na frente:
  // voltar para a aba dela é parte do gesto agora.
  await page.getByRole("tab", { name }).click();
  await page.getByRole("button", { name: "remover worktree" }).click();

  // F4.9, and PRD §5: the message names the session, not the dirt.
  await expect(page.getByRole("alert")).toContainText("sessão(ões) rodando");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Closing them is what unblocks it, which is the whole point of the refusal.
  // The tab is where a session lives now, and closing it is what ends the
  // process — the tab going away is the proof that it did.
  const closeTab = page.getByRole("button", { name: /^fechar / }).first();
  await closeTab.click();
  await expect(page.getByRole("button", { name: /^fechar / })).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "remover worktree" }).click();
  await expect(page.getByRole("heading", { name })).toBeHidden({ timeout: 20_000 });
});

test("a dirty worktree is refused, and forcing it works", async ({ page }) => {
  await openFixtureProject(page);
  const name = "erro-suja";

  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(name);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

  const path = (
    await page
      .getByRole("tabpanel", { name })
      .getByText(/\.lumem.*worktrees/)
      .first()
      .innerText()
  ).trim();
  writeFileSync(join(path, "trabalho-nao-commitado.txt"), "conteúdo\n");

  await page.getByRole("button", { name: "remover worktree" }).click();

  // F4.8: the count, so the user can weigh what they are about to lose.
  await expect(page.getByRole("alert")).toContainText("arquivo(s) modificado(s)");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "remover mesmo assim" }).click();

  await expect(page.getByRole("heading", { name })).toBeHidden({ timeout: 20_000 });
});

test("an agent whose command is missing is shown unavailable and cannot be launched", async ({
  page,
  request,
}) => {
  await createAgentConfig(request, DAEMON, { name: AGENT, command: E2E_FIXTURE_AGENT });
  await createAgentConfig(request, DAEMON, {
    name: BROKEN_AGENT,
    command: "definitely-not-a-real-binary-xyz",
  });

  await openFixtureProject(page);

  // F6.5: shown rather than hidden, disabled rather than launchable.
  await page.getByRole("button", { name: /nova sessão/ }).click();
  const broken = page.getByRole("menuitem", { name: new RegExp(BROKEN_AGENT) });
  await expect(broken).toBeDisabled();
  // The reason, not just the refusal — "indisponível" leaves nothing to fix.
  await expect(broken).toContainText("fora do PATH");

  // The one that *is* installed still works, so this is about availability
  // rather than agents being broken in general.
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(terminalText(page)).toContainText("fake-agent pronto", { timeout: 20_000 });
  await page.getByRole("button", { name: /^fechar / }).first().click();
});

test("a worktree deleted from outside becomes missing after a restart", async () => {
  // F7.4, and the one case that cannot be checked against the daemon playwright
  // manages: it owns that process and will not restart it. So this drives a
  // daemon of its own through the API — which PRD §7 requires to be able to do
  // everything the client can.
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-restart-"));
  let daemon = await startDaemon({ port: E2E_RESTART_PORT, stateDir });

  try {
    const workspace = (await call(daemon.url, "workspace.create", { name: "restart" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };
    const worktree = (await call(daemon.url, "worktree.create", {
      projectId: project.id,
      name: "sumiu",
    })) as { id: string; path: string };

    // `rm -rf`, the way it actually happens.
    rmSync(worktree.path, { recursive: true, force: true });

    await daemon.stop();
    daemon = await startDaemon({ port: E2E_RESTART_PORT, stateDir });

    const listed = (await query(daemon.url, "worktree.listByProject", {
      projectId: project.id,
    })) as { id: string; state: string }[];

    // Registered and marked, not quietly gone: the branch still exists and the
    // decision about it is the user's.
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: worktree.id, state: "missing" });
  } finally {
    await daemon.stop();
    rmSync(stateDir, { recursive: true, force: true });
  }
});
