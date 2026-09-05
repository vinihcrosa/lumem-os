import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_STATE_DIR } from "../ports.js";
import { createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { E2E_FIXTURE_REPO_SCRIPTS } from "./support/fixtures.js";

/**
 * O rodapé de execução, de ponta a ponta.
 *
 * O que só um navegador responde: que o `[scripts]` commitado no repositório vira
 * um processo de pé com um botão que abre a porta certa — e que a worktree nova
 * chega preparada sem ninguém pedir.
 *
 * O repositório da fixture já traz `setup`, `run` e `teardown` **commitados**, que é
 * a única forma de eles existirem numa worktree recém-criada.
 */

const PROJECT = "repo-scripts";

async function openColumn(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "abrir a coluna de arquivos" });
  if ((await page.getByLabel("arquivos do checkout").count()) === 0) await toggle.click();
  await expect(page.getByLabel("arquivos do checkout")).toBeVisible();
}

async function openDock(page: Page): Promise<void> {
  await openColumn(page);
  const folded = page.getByRole("button", { name: "abrir o rodapé" });
  if ((await folded.count()) > 0) await folded.click();
  await expect(page.getByRole("tablist", { name: "execução do checkout" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_SCRIPTS, PROJECT);
  await openProject(page, PROJECT);
});

test("o run sobe pelo rodapé, e o botão abre a porta que ele anunciou", async ({ page }) => {
  await openDock(page);
  await page.getByRole("tab", { name: /^Run/ }).click();

  await page.getByRole("button", { name: /rodar/ }).click();

  // A saída ao vivo, no terminal de sempre — a mesma primitiva das outras abas.
  const dock = page.getByTestId("run-dock");
  await expect(dock.locator(".xterm-rows")).toContainText("Local: http://127.0.0.1:", {
    timeout: 30_000,
  });

  // E o botão que carrega metade do valor do run, com a porta e a proveniência.
  // O script da fixture lê `LUMEM_RUN_PORT`, então a origem é a variável — o
  // caminho determinístico da S6, e não a regex.
  const open = dock.getByRole("link", { name: /Abrir/ });
  await expect(open).toBeVisible({ timeout: 30_000 });
  await expect(dock.getByText("porta de LUMEM_RUN_PORT")).toBeVisible();

  const href = await open.getAttribute("href");
  expect(href).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  // A porta anunciada na saída é a mesma que o botão abre: se as duas
  // divergissem, o botão abriria a coisa errada — que é pior que não existir.
  await expect(dock.locator(".xterm-rows")).toContainText(
    `http://127.0.0.1:${href!.split(":").at(-1) ?? ""}`,
  );

  // Fora do rodapé, a sidebar diz que tem algo de pé neste checkout — com a
  // porta, que é o que evita rodar de novo em cima de si mesmo.
  await expect(page.getByLabel("árvore de projetos").locator(".runmark")).toContainText(/:\d+/, {
    timeout: 20_000,
  });

  await dock.getByRole("button", { name: /parar/ }).click();
  await expect(dock.getByRole("link", { name: /Abrir/ })).toHaveCount(0, { timeout: 20_000 });
});

test("a aba de testes roda a suíte do projeto e diz como ela terminou", async ({ page }) => {
  await openDock(page);
  await page.getByRole("tab", { name: /^Testes/ }).click();

  const dock = page.getByTestId("run-dock");
  await dock.getByRole("button", { name: /rodar/ }).click();

  await expect(dock.locator(".xterm-rows")).toContainText("tudo verde", { timeout: 30_000 });
  // O que a aba acrescenta ao terminal: o código de saída, guardado.
  await expect(dock.getByText(/saiu 0/)).toBeVisible({ timeout: 30_000 });
});

test("worktree nova nasce preparada: o setup roda sozinho e a aba conta como foi", async ({
  page,
}) => {
  const name = `preparada-${String(Date.now())}`;

  await createWorktree(page, name, PROJECT);

  await page.getByLabel("árvore de projetos").getByRole("button", { name, exact: true }).click();
  await openDock(page);
  await page.getByRole("tab", { name: /^Setup/ }).click();

  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText(/saiu 0/)).toBeVisible({ timeout: 60_000 });
  // E não é só a tela dizendo: o script escreveu no disco da worktree.
  await expect
    .poll(
      () =>
        existsSync(
          join(
            E2E_STATE_DIR,
            "workspaces",
            "e2e",
            PROJECT,
            "worktrees",
            name,
            "preparada.txt",
          ),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
});
