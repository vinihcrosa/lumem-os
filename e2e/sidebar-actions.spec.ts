import { expect, test } from "@playwright/test";

import { E2E_FIXTURE_REPO } from "./support/fixtures.js";
import { ensureProject, ensureWorkspace } from "./support/app.js";

/**
 * As duas ações da árvore, pelo caminho que o PRD §5 pede.
 *
 * O resto da suíte já atravessa os dois diálogos — o `ensureProject` acrescenta
 * projeto pelo `+` do cabeçalho, e dez specs cortam worktree pelo `+` da linha.
 * O que só existe aqui são as duas afirmações que nenhuma delas faria de
 * passagem: que o `+` de um projeto **fechado** funciona sem abri-lo primeiro, e
 * que o foco volta para ele.
 */

const WORKTREE = "da-arvore";

test("corta worktree de um projeto fechado, e cai dentro dela", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);

  const tree = page.getByLabel("árvore de projetos");
  const projeto = tree.getByRole("button", { name: "fixture", exact: true });
  await expect(projeto).toBeVisible();

  // Fecha o projeto, se ele estiver aberto: o caso que interessa é o `+` de uma
  // linha que não mostra nada abaixo de si.
  const recolher = tree.getByRole("button", { name: "recolher fixture" });
  if (await recolher.isVisible().catch(() => false)) await recolher.click();
  // A prova de que está fechado é a própria seta: ela diz `expandir`, e é o que
  // um leitor de tela ouviria. Contar linhas filhas não serve aqui — a árvore é
  // markup plano, e outros projetos do mesmo workspace têm um `local` cada.
  await expect(tree.getByRole("button", { name: "expandir fixture" })).toBeVisible();

  await tree.getByRole("button", { name: "nova worktree em fixture" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();

  // F1.5: expandiu o projeto e selecionou a worktree nova — o mesmo destino que
  // o caminho antigo, dentro do painel do `local`, entregava.
  await expect(tree.getByRole("button", { name: WORKTREE, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible();
});

test("Esc fecha o diálogo e devolve o foco ao + que o abriu", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO);

  const tree = page.getByLabel("árvore de projetos");
  const mais = tree.getByRole("button", { name: "nova worktree em fixture" });
  await mais.click();

  await expect(page.getByRole("dialog", { name: "Nova worktree" })).toBeVisible();
  // O foco entra no campo, e não no `✕` que vem antes dele no documento.
  await expect(page.getByLabel("Nome da worktree")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Nova worktree" })).toBeHidden();
  // Sem isto, quem navega por teclado recomeça do topo da página a cada
  // diálogo cancelado.
  await expect(mais).toBeFocused();
});
