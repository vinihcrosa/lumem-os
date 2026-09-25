import { createRequire } from "node:module";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT, E2E_STATE_DIR } from "../ports.js";
import {
  ensureProject,
  ensureWorkspace,
  openNewAgent,
  openProject,
} from "./support/app.js";
import { call, query } from "./support/daemon.js";
import {
  E2E_FIXTURE_REPO_FAILING_SETUP,
  E2E_FIXTURE_REPO_SLOW_SETUP,
  E2E_FIXTURE_REPO,
} from "./support/fixtures.js";

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
interface SqliteDatabase {
  prepare(sql: string): { run(...values: unknown[]): unknown };
  close(): void;
}
const Database = createRequire(new URL("../packages/server/package.json", import.meta.url))(
  "better-sqlite3",
) as new (path: string) => SqliteDatabase;

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function openComposer(page: Page, project: string): Promise<void> {
  await page.getByRole("button", { name: `nova worktree em ${project}` }).click();
  await expect(page.getByRole("dialog", { name: "Nova worktree" })).toBeVisible();
}

async function idsForProject(projectName: string): Promise<{ projectId: string; workspaceId: string }> {
  const workspaces = (await query(DAEMON, "workspace.list", undefined)) as {
    id: string;
    name: string;
  }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  if (!workspace) throw new Error("workspace e2e não encontrado");
  const projects = (await query(DAEMON, "project.listByWorkspace", {
    workspaceId: workspace.id,
  })) as { id: string; name: string }[];
  const project = projects.find((row) => row.name === projectName);
  if (!project) throw new Error(`projeto ${projectName} não encontrado`);
  return { projectId: project.id, workspaceId: workspace.id };
}

async function sessionCount(scopeId: string): Promise<number> {
  const rows = (await query(DAEMON, "session.listByScope", {
    scopeType: "worktree",
    scopeId,
  })) as unknown[];
  return rows.length;
}

test("a worktree espera o setup e envia o prompt no modelo escolhido", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = "repo-slow-setup";
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_SLOW_SETUP, project);
  await openProject(page, project);
  await openComposer(page, project);

  const dialog = page.getByRole("dialog", { name: "Nova worktree" });
  await dialog.getByLabel("No que você quer trabalhar?").fill("corrigir o setup lento");
  await dialog.getByRole("button", { name: /^agente e modelo:/ }).click();
  const sonnet = dialog
    .getByRole("group", { name: "Claude Code" })
    .getByRole("menuitemradio", { name: /sonnet/ });
  const hitTarget = await sonnet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return hit !== null && element.contains(hit);
  });
  expect(hitTarget).toBe(true);
  await sonnet.click();
  await expect(dialog.getByRole("button", { name: /^agente e modelo:/ })).toContainText("sonnet");
  await dialog.getByRole("button", { name: /^Create/ }).click();

  const conv = conversation(page);
  await expect(conv.getByText("preparando worktree…")).toBeVisible({ timeout: 15_000 });
  await expect(conv.getByText("corrigir o setup lento")).toBeVisible();
  await expect(conv.getByRole("button", { name: /^Model:/ })).toContainText("sonnet");
  await expect(conv.getByRole("button", { name: /permitir uma vez/ })).toBeVisible({ timeout: 20_000 });
  await conv.getByRole("button", { name: /permitir uma vez/ }).click();
  await expect(conv).toContainText("Vou separar o parser antes de consertar.", { timeout: 20_000 });
});

test("setup com falha segura o prompt até a pessoa mandar mesmo assim", async ({ page }) => {
  const project = "repo-failing-setup";
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_FAILING_SETUP, project);
  await openProject(page, project);
  await openComposer(page, project);

  const dialog = page.getByRole("dialog", { name: "Nova worktree" });
  await dialog.getByLabel("No que você quer trabalhar?").fill("corrigir depois do setup");
  await dialog.getByRole("button", { name: /^Create/ }).click();

  const conv = conversation(page);
  await expect(conv.getByRole("alert")).toContainText("o setup saiu com 1", { timeout: 15_000 });
  await expect(conv.getByText("corrigir depois do setup")).toBeVisible();
  await expect(conv.getByText("Vou separar o parser antes de consertar.")).toHaveCount(0);
  await conv.getByRole("button", { name: "mandar assim mesmo" }).click();
  await expect(conv.getByRole("button", { name: /permitir uma vez/ })).toBeVisible({ timeout: 20_000 });
  await conv.getByRole("button", { name: /permitir uma vez/ }).click();
  await expect(conv).toContainText("Vou separar o parser antes de consertar.", { timeout: 20_000 });
});

test("rascunho não sobe processo ao trocar de ACP; a sessão nasce no primeiro envio", async ({ page }) => {
  const project = "fixture";
  const worktreeName = `rascunho-${Date.now().toString(36)}`;
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, project);

  const { projectId } = await idsForProject(project);
  const worktree = (await call(DAEMON, "worktree.create", {
    projectId,
    name: worktreeName,
  })) as { id: string };

  await openProject(page, project);
  await page.getByLabel("árvore de projetos").getByRole("button", { name: worktreeName, exact: true }).click();
  await expect(page.getByRole("tablist", { name: new RegExp(worktreeName) })).toBeVisible();
  expect(await sessionCount(worktree.id)).toBe(0);

  await openNewAgent(page);
  const draft = page.getByRole("tabpanel", { name: "rascunho" });
  await expect(draft.getByText(`Nova conversa em /${worktreeName}`)).toBeVisible();
  await draft.getByRole("button", { name: /^agente e modelo:/ }).click();
  const codex = draft.getByRole("group", { name: "Codex" });
  await expect(codex.getByRole("menuitemradio").first()).toBeEnabled({ timeout: 20_000 });
  await codex.getByRole("menuitemradio").first().click();
  await expect(draft.getByRole("button", { name: /^agente e modelo:/ })).toContainText("Codex");
  expect(await sessionCount(worktree.id)).toBe(0);

  await draft.getByLabel("mensagem para o agente").fill("arruma o frontmatter vazio");
  await draft.getByRole("button", { name: /enviar/ }).click();
  await expect(page.getByRole("tab", { name: "codex", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await sessionCount(worktree.id)).toBe(1);
  await expect(conversation(page).getByRole("button", { name: /permitir uma vez/ })).toBeVisible({ timeout: 20_000 });
});

test("sessão legada de agente PTY aparece no histórico sem ações", async ({ page }) => {
  const project = "fixture";
  const worktreeName = `legado-pty-${Date.now().toString(36)}`;
  const legacyId = `legacy-config-${Date.now().toString(36)}`;
  const sessionId = `legacy-session-${Date.now().toString(36)}`;
  const legacyName = `claude-terminal-legado-${Date.now().toString(36)}`;
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, project);
  const { projectId } = await idsForProject(project);
  const worktree = (await call(DAEMON, "worktree.create", {
    projectId,
    name: worktreeName,
  })) as { id: string; path: string };

  const db = new Database(join(E2E_STATE_DIR, "lumem.db"));
  try {
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_config (id, name, command, args, env, adapter_version, retired_at, created_at, updated_at)
       VALUES (?, ?, ?, '[]', '{}', NULL, ?, ?, ?)`,
    ).run(legacyId, legacyName, "claude", now, now, now);
    db.prepare(
      `INSERT INTO session (id, kind, agent_config_id, scope_type, scope_id, cwd, command, state,
                            exit_code, transport, acp_session_id, created_at, updated_at)
       VALUES (?, 'agent', ?, 'worktree', ?, ?, 'claude', 'exited', 0, 'pty', NULL, ?, ?)`,
    ).run(sessionId, legacyId, worktree.id, worktree.path, now, now);
  } finally {
    db.close();
  }

  await page.reload();
  await openProject(page, project);
  await page.getByLabel("árvore de projetos").getByRole("button", { name: worktreeName, exact: true }).click();
  const legacyRow = page.locator(".item").filter({ hasText: legacyName });
  await expect(legacyRow).toContainText("exited (0)");
  await expect(legacyRow.getByRole("button")).toHaveCount(0);
  await expect(legacyRow).not.toContainText("reabrir");
  await expect(legacyRow).not.toContainText("ver registro");
});
