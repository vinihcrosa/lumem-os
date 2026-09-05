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

/**
 * A chegada: o que se vê ao entrar numa worktree sem nunca ter tocado no rodapé.
 *
 * É a `run-dock-open` inteira, e ela é sobre o que **não** acontece: a coluna não
 * salta de largura, nem ao entrar, nem ao mandar rodar. O piso de 640px continua
 * existindo — mas só para quem abre o rodapé de propósito, que é onde ele sempre
 * esteve (`App.tsx`).
 */
test("a chegada numa worktree mostra o run sem clique, e sem alargar a coluna", async ({ page }) => {
  await openColumn(page);

  // Sem `localStorage`, sem clique: a faixa de execução já está aqui.
  await expect(page.getByRole("tablist", { name: "execução do checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "abrir o rodapé" })).toHaveCount(0);

  // A largura com que se chega. Guardada em vez de comparada com um número: o
  // que a feature promete é que ela **não muda**, e o segundo teste prova que
  // abrir de propósito ainda a muda.
  const column = page.getByLabel("arquivos do checkout");
  const arrived = (await column.boundingBox())!.width;

  // A faixa de abas caberia? Ela mede 494px com os botões de ação dentro, e é por
  // isso que eles moram na linha de estado. Aqui a pergunta é a de verdade: sobra
  // algum controle fora da tela?
  const strip = page.getByRole("tablist", { name: "execução do checkout" });
  const overflow = await strip.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // E o que a área da saída diz antes de existir saída — em vez de um terminal
  // preto. A faixa de portas fica de fora desta afirmação de propósito: a reserva
  // só existe depois do primeiro start, e afirmar aqui atrelaria o teste à ordem
  // da suíte. As duas metades da linha estão cobertas no teste de componente.
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText(/ainda não rodou o run/)).toBeVisible();

  // Mandar rodar roda, e não mexe na tela (Q5).
  await dock.getByRole("button", { name: /rodar/ }).click();
  await expect(dock.getByRole("link", { name: /Abrir/ })).toBeVisible({ timeout: 30_000 });
  expect((await column.boundingBox())!.width).toBe(arrived);

  await dock.getByRole("button", { name: /parar/ }).click();
  await expect(dock.getByRole("link", { name: /Abrir/ })).toHaveCount(0, { timeout: 20_000 });
});

test("quem fecha o rodapé encontra fechado — e reabrir ainda alarga a coluna", async ({ page }) => {
  await openColumn(page);
  await page.getByRole("button", { name: "recolher o rodapé" }).click();

  const folded = page.getByRole("button", { name: "abrir o rodapé" });
  await expect(folded).toBeVisible();

  await page.reload();
  // Recarregar volta para a tela do workspace: a seleção não é lembrada, e o
  // `▤ arquivos` só existe com um checkout na frente.
  await openProject(page, PROJECT);
  await openColumn(page);
  // A preferência ganha do padrão: o padrão é o primeiro contato, não uma regra.
  await expect(page.getByRole("button", { name: "abrir o rodapé" })).toBeVisible();

  const column = page.getByLabel("arquivos do checkout");
  const foldedWidth = (await column.boundingBox())!.width;

  // Abrir de propósito continua levando a coluna com ele, como sempre levou —
  // um terminal de 80 colunas não cabe na largura de chegada.
  await page.getByRole("button", { name: "abrir o rodapé" }).click();
  await expect(page.getByRole("tablist", { name: "execução do checkout" })).toBeVisible();
  await expect
    .poll(async () => (await column.boundingBox())!.width, { timeout: 5_000 })
    .toBeGreaterThan(foldedWidth);
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
