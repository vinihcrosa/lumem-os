import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO, E2E_FIXTURE_REPO_ALT } from "./support/fixtures.js";
import {
  createWorktree,
  endEveryTerminal,
  ensureProject,
  ensureWorkspace,
  openProject,
  openTerminal,
} from "./support/app.js";
import { call, query, startDaemon } from "./support/daemon.js";
import { E2E_RESTART_PORT } from "../ports.js";

/**
 * The degraded states of PRD §8.
 *
 * Every line here is something that happens in the first week of real use, and
 * the requirement in each case is the same: refuse clearly, say which of the
 * possible reasons it is, and leave nothing half-done.
 */

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

  // Escopado: o `+` que abriu o diálogo continua na tela atrás do véu, e o
  // nome dele contém `adicionar`.
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Caminho ou URL").fill(notARepo);
  await dialog.getByRole("button", { name: "adicionar" }).click();

  // F2.2: which check failed, not "invalid path".
  await expect(page.getByRole("alert")).toContainText("não é um repositório git");
  await expect(dialog.getByRole("button", { name: "adicionar" })).toBeVisible();
  rmSync(notARepo, { recursive: true, force: true });
});

test("creating a worktree on an existing branch is refused", async ({ page }) => {
  await openFixtureProject(page);

  await createWorktree(page, "main");

  await expect(page.getByRole("alert")).toContainText("escolha outro nome");
});

test("a worktree with a live session cannot be removed", async ({ page }) => {
  await openFixtureProject(page);
  const name = "erro-sessao-viva";

  await createWorktree(page, name);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

  // A sessão viva é um terminal no rodapé (LUM-62): shell não é mais aba.
  await openTerminal(page);

  // A ação destrutiva mora na aba do checkout, que continua na frente: o
  // terminal vive na coluna, e não na faixa de abas.
  await page.getByRole("button", { name: "remover worktree" }).click();

  // F4.9, and PRD §5: the message names the session, not the dirt.
  await expect(page.getByRole("alert")).toContainText("sessão(ões) rodando");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Ending them is what unblocks it, which is the whole point of the refusal.
  // The dock's terminal has no ✕, so the shell ends the way a shell ends — and
  // the terminal going away from the dock is the proof that the process did.
  await endEveryTerminal(page);

  await page.getByRole("button", { name: "remover worktree" }).click();
  await expect(page.getByRole("heading", { name })).toBeHidden({ timeout: 20_000 });
});

test("a dirty worktree is refused, and forcing it works", async ({ page }) => {
  await openFixtureProject(page);
  const name = "erro-suja";

  await createWorktree(page, name);
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

test("a new agent is a direct button, and the tab strip offers no terminal", async ({ page }) => {
  await openFixtureProject(page);

  // LUM-62: the `＋ nova sessão` menu had two items, a new agent and a terminal.
  // The terminal lives only in the run dock now, and a menu of one item is a
  // click for nothing — so `novo agente` is the button itself. Configurations
  // still do not appear as session-launch rows: the adapter and the model are
  // chosen inside the draft.
  const strip = page.locator(".tabs-bar");
  await expect(strip.getByRole("button", { name: /^novo agente$/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /nova sessão/ })).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Pressing it opens the draft directly, with no menu in between.
  await strip.getByRole("button", { name: /^novo agente$/ }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "terminal" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "rascunho" })).toBeVisible();

  // And no terminal is offered by the strip — neither as an item nor as a tab.
  await expect(strip.getByRole("button", { name: /^terminal$/ })).toHaveCount(0);
  await expect(strip.getByRole("tab", { name: /^(terminal|shell)/ })).toHaveCount(0);
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
