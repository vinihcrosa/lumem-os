import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_STATE_DIR } from "../ports.js";
import { createWorktree, ensureWorkspace } from "./support/app.js";
import { E2E_FIXTURE_REPO_EMPTY, E2E_FIXTURE_REPO_ORIGIN } from "./support/fixtures.js";

/**
 * The acceptance criteria of the PRD, end to end, with no network.
 *
 * The remote is a local repository over `file://` — D11, and the same code path
 * the product runs for any other address. What this spec is for is the part no
 * unit test can reach: that the refusals happen on the screen before anything
 * is spawned, and that removing a clone really takes the bytes with it.
 */

const WORKSPACE = "e2e";

/** Where the daemon puts what it manages, for this run. */
function projectHome(name: string): string {
  return join(E2E_STATE_DIR, "workspaces", WORKSPACE, name);
}

async function openDialog(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page, WORKSPACE);
  await page.getByRole("button", { name: "adicionar projeto" }).click();
}

async function cloneFrom(page: Page, source: string, name: string): Promise<void> {
  await openDialog(page);
  await page.getByLabel("Caminho ou URL").fill(source);
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "clonar" }).click();
}

test("clona por file://, e o projeto corta worktree como qualquer outro", async ({ page }) => {
  await cloneFrom(page, `file://${E2E_FIXTURE_REPO_ORIGIN}`, "clonado");

  // Aparece na sidebar sem recarregar, no lugar onde o clone estava.
  const entrada = page.getByRole("button", { name: "clonado", exact: true });
  await expect(entrada).toBeVisible({ timeout: 30_000 });

  // Critério 10: um projeto clonado não é de segunda classe.
  await entrada.click();
  await createWorktree(page, "do-clone", "clonado");

  await expect(page.getByRole("button", { name: "do-clone", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(existsSync(join(projectHome("clonado"), "worktrees", "do-clone", "README.md"))).toBe(true);
  expect(existsSync(join(projectHome("clonado"), "repo", "README.md"))).toBe(true);
});

test("recusa ext:: e git:// na tela, antes de qualquer processo", async ({ page }) => {
  await openDialog(page);

  // A linha `↳` é `status` e não `alert`: ela chega enquanto a pessoa digita,
  // e não em resposta a um clique.
  await page.getByLabel("Caminho ou URL").fill("ext::sh -c id");
  await expect(page.getByText(/o transporte "ext" não está na lista/)).toBeVisible();
  await expect(page.getByRole("button", { name: "adicionar", exact: true })).toBeDisabled();

  await page.getByLabel("Caminho ou URL").fill("git://host/repo.git");
  await expect(page.getByText(/não autentica nem verifica integridade/)).toBeVisible();
  await expect(page.getByRole("button", { name: "adicionar", exact: true })).toBeDisabled();
});

test("clona um repositório vazio, e a tela explica por que ele ainda não corta worktree", async ({
  page,
}) => {
  // Q19: dá para começar no Lumem no dia 0. F6.13: sem commit não há de onde
  // cortar, e "invalid reference" não explica isso a ninguém.
  await cloneFrom(page, `file://${E2E_FIXTURE_REPO_EMPTY}`, "dia-zero");

  const entrada = page.getByRole("button", { name: "dia-zero", exact: true });
  await expect(entrada).toBeVisible({ timeout: 30_000 });
  await entrada.click();

  // O `+` continua clicável, e quem explica é o diálogo: um `+` de 24px cinza
  // numa linha de árvore é um botão sem motivo à vista (sidebar-actions §3).
  await page.getByLabel("árvore de projetos")
    .getByRole("button", { name: "nova worktree em dia-zero", exact: true })
    .click();
  await expect(page.getByText(/ainda não tem nenhum commit/)).toBeVisible();
  await expect(page.getByRole("button", { name: "criar", exact: true })).toBeDisabled();
});

test("remover o projeto clonado apaga o diretório", async ({ page }) => {
  // Critério 11, e o §2.1: isto reverte o F2.5 do walking-skeleton para a
  // classe de projeto cujos bytes o daemon escreveu.
  await cloneFrom(page, `file://${E2E_FIXTURE_REPO_ORIGIN}`, "some-do-disco");
  const entrada = page.getByRole("button", { name: "some-do-disco", exact: true });
  await expect(entrada).toBeVisible({ timeout: 30_000 });
  expect(existsSync(join(projectHome("some-do-disco"), "repo"))).toBe(true);

  await entrada.click();
  await page.getByRole("button", { name: "remover projeto" }).click();

  const confirmacao = page.getByRole("alertdialog");
  await expect(confirmacao).toContainText("apaga o diretório");
  await expect(confirmacao).toContainText(join(projectHome("some-do-disco"), "repo"));
  await confirmacao.getByRole("button", { name: "apagar" }).click();

  await expect(entrada).toBeHidden({ timeout: 15_000 });
  expect(existsSync(join(projectHome("some-do-disco"), "repo"))).toBe(false);
});

test("remover um projeto registrado por caminho não apaga o repositório dele", async ({ page }) => {
  // Critério 12: a metade da regra que **não** mudou.
  await openDialog(page);
  await page.getByLabel("Caminho ou URL").fill(E2E_FIXTURE_REPO_ORIGIN);
  await page.getByLabel("Nome").fill("apontado");
  await page.getByRole("button", { name: "adicionar", exact: true }).click();

  const entrada = page.getByRole("button", { name: "apontado", exact: true });
  await expect(entrada).toBeVisible({ timeout: 15_000 });
  await entrada.click();
  await page.getByRole("button", { name: "remover projeto" }).click();

  const confirmacao = page.getByRole("alertdialog");
  await expect(confirmacao).toContainText("fica exatamente onde está");
  await confirmacao.getByRole("button", { name: "remover" }).click();

  await expect(entrada).toBeHidden({ timeout: 15_000 });
  expect(existsSync(join(E2E_FIXTURE_REPO_ORIGIN, "README.md"))).toBe(true);
});

test("não deixa temporário para trás", async ({ page }) => {
  await cloneFrom(page, `file://${E2E_FIXTURE_REPO_ORIGIN}`, "sem-lixo");
  await expect(page.getByRole("button", { name: "sem-lixo", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  expect(readdirSync(projectHome("sem-lixo"))).toEqual(["repo"]);
});
