import { expect, test } from "@playwright/test";

import { E2E_FIXTURE_REPO } from "./support/fixtures.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * As duas ações da árvore, no navegador — `sidebar-actions` §5.
 *
 * O que só aqui se prova: **foco**. Devolver o foco ao `+` que abriu o modal e
 * prender o `Tab` dentro dele são coisas que o jsdom simula e o navegador
 * decide — e são metade do contrato da seção 8 do protótipo.
 *
 * E o resto é sobre o que **não** acontece: clicar num `+` não navega, não
 * dobra e não muda a seleção. Um teste que só verifica o que a ação faz passa
 * de olhos fechados por um botão que também faz outra coisa.
 */

const PROJECT = "fixture";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, PROJECT);
});

test("cria worktree pelo + da linha, com o projeto fechado", async ({ page }) => {
  const name = `da-linha-${Date.now().toString(36)}`;
  const tree = page.getByLabel("árvore de projetos");

  // Fechado de propósito: é o caso que a feature existe para resolver — hoje
  // custaria abrir o projeto, achar o `local` e o diálogo lá dentro.
  const twist = tree.getByRole("button", { name: `recolher ${PROJECT}` });
  if (await twist.isVisible().catch(() => false)) await twist.click();
  await expect(tree.getByRole("button", { name: `expandir ${PROJECT}` })).toBeVisible();

  await page.getByRole("button", { name: `nova worktree em ${PROJECT}` }).click();
  await page.getByLabel("Nome da worktree").fill(name);
  await page.getByRole("button", { name: "criar" }).click();

  // F1.5: o mesmo destino que o caminho de hoje entregava — o projeto abre e a
  // worktree nova é a selecionada.
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  await expect(tree.getByRole("button", { name: `recolher ${PROJECT}` })).toBeVisible();
  await expect(tree.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("o + não navega: não dobra o projeto e não muda a seleção ao cancelar", async ({ page }) => {
  await openProject(page, PROJECT);
  const tree = page.getByLabel("árvore de projetos");
  /*
   * Ancorado no caminho do repositório, e não na linha `local`.
   *
   * O workspace do e2e é compartilhado e tem um `local` por projeto, então
   * `/^local/` casa com vários. O que identifica **qual** checkout está na tela
   * é o caminho dele — a mesma âncora que o `happy-path` usa.
   */
  const aberto = page.getByRole("tabpanel", { name: "local" }).getByText(E2E_FIXTURE_REPO);
  await expect(aberto).toBeVisible();

  const twist = tree.getByRole("button", { name: `recolher ${PROJECT}` });
  if (await twist.isVisible().catch(() => false)) await twist.click();
  const folded = tree.getByRole("button", { name: `expandir ${PROJECT}` });
  await expect(folded).toBeVisible();

  await page.getByRole("button", { name: `nova worktree em ${PROJECT}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // F1.4: clicar nele é uma ação, não uma navegação. O projeto continua fechado
  // por trás do véu.
  await expect(folded).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "cancelar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(folded).toHaveAttribute("aria-expanded", "false");
  // E a seleção continua exatamente onde estava (§5 do PRD).
  await expect(aberto).toBeVisible();
});

test("Esc devolve o foco ao + que abriu o modal", async ({ page }) => {
  const plus = page.getByRole("button", { name: `nova worktree em ${PROJECT}` });
  await plus.click();

  // O foco entra no primeiro campo, pronto para digitar.
  const campo = page.getByLabel("Nome da worktree");
  await expect(campo).toBeFocused();

  // Com nome, porque `criar` fica desabilitado sem um — e botão desabilitado
  // sai do anel do `Tab`.
  await campo.fill("anel-de-foco");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "criar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "fechar" })).toBeFocused();

  /*
   * E ele fecha o círculo, em vez de sair para a sidebar atrás do véu.
   *
   * **O anel cresceu**, e a volta não é mais o campo: desde a
   * `026-worktree-from` o corpo deste diálogo começa por um trilho de origem, e
   * o primeiro focável passou a ser a aba `default`. O contrato que a seção 8 do
   * protótipo escreve continua de pé — o `Tab` circula **dentro** do diálogo, e
   * o `✕` é o último —, e o que mudou é quantas paradas ele tem.
   *
   * O foco de **abertura** não mudou por causa disso, e não foi de graça: ele
   * cai no campo porque o `Modal` passou a preferir `[data-modal-focus]` ao
   * primeiro focável. Sem isso, abrir o diálogo poria o cursor numa aba.
   */
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "default", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  // Deixar o foco num botão que não existe mais manda o próximo `Tab` para o
  // topo do documento.
  await expect(plus).toBeFocused();
});

test("o mesmo contrato de foco vale para o + do cabeçalho", async ({ page }) => {
  const plus = page.getByRole("button", { name: "adicionar projeto" });
  await plus.click();

  await expect(page.getByRole("dialog")).toHaveAccessibleName("Adicionar projeto");
  await expect(page.getByLabel("Caminho ou URL")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(plus).toBeFocused();
});

test("há exatamente um caminho para acrescentar projeto, e ele está na árvore", async ({
  page,
}) => {
  // Q3 e F1.6. O caso de zero projetos é do teste de componente — o e2e roda
  // num workspace compartilhado e não tem como esvaziá-lo sem apagar o que os
  // outros specs criaram. O que este prova é o outro lado da mesma regra: o
  // rodapé perdeu a cópia, e o que sobrou está preso ao cabeçalho da lista.
  const adicionar = page.getByRole("button", { name: "adicionar projeto" });
  await expect(adicionar).toHaveCount(1);
  await expect(page.getByLabel("árvore de projetos").getByRole("button", { name: "adicionar projeto" })).toHaveCount(1);
  await expect(page.locator(".sidebar__foot").getByText("adicionar projeto")).toHaveCount(0);

  // E o cabeçalho continua no topo da lista, não no fim dela: ele não anda
  // quando a lista cresce. Escopado na árvore, porque a tela do workspace ao
  // lado também conta projetos e diz a palavra três vezes.
  await expect(
    page.getByLabel("árvore de projetos").getByText("Projetos", { exact: true }),
  ).toBeVisible();
});
