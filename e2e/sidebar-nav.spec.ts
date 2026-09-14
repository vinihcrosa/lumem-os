import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * O bloco de navegação da sidebar (`029-sidebar-nav` T6).
 *
 * **Zero token**, e nada aqui abre agente: o que está sob teste é geometria e
 * seleção.
 *
 * **Por que não é teste de componente.** Todo teste de componente do produto é
 * jsdom, que **não faz layout**: um `getByRole` acha o botão `Tarefas` com a
 * árvore rolada, com o bloco fora da tela e com duas barras de seleção acesas ao
 * mesmo tempo. É a lição da `023`, onde um menu ficou invisível por três
 * features tendo teste, e a da `028`, cuja Q38 achou um arrasto que funcionava
 * sem nada cobrindo.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

/*
 * Uma worktree **por caso**, e não por spec.
 *
 * A suíte compartilha daemon e diretório de estado, então o mesmo nome no
 * segundo caso é `git worktree add` recusando um nome que já existe — a
 * armadilha que o `board.spec.ts` já nomeia para tarefa, e que vale igual aqui.
 */
const CHECKOUTS = { umClique: "nav-um-clique", selecao: "nav-selecao" } as const;

async function workspaceId(): Promise<string> {
  const rows = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = rows.find((row) => row.name === "e2e") ?? rows[0];
  if (found === undefined) throw new Error("nenhum workspace");
  return found.id;
}

/**
 * O workspace começa **sem tarefa** em cada caso.
 *
 * A suíte compartilha daemon e diretório de estado, então tarefa de outro spec é
 * estado deste — e o número da linha `Tarefas` é justamente o que **conta**. Foi
 * exatamente o que aconteceu: os cinco casos passavam isolados e o do número
 * falhava na suíte inteira, porque outro spec tinha deixado uma tarefa em
 * `ready_to_merge`.
 *
 * `remove` só apaga tarefa sem sessão; a que teve uma vira `dropped`, que sai do
 * quadro. As duas portas juntas limpam tudo — a mesma rotina do `board.spec.ts`,
 * pelo mesmo motivo.
 */
async function clearTasks(): Promise<void> {
  const rows = (await query(DAEMON, "task.listByWorkspace", {
    workspaceId: await workspaceId(),
  })) as { id: string; status: string }[];

  for (const row of rows) {
    try {
      await call(DAEMON, "task.remove", { id: row.id });
    } catch {
      if (row.status !== "dropped") {
        await call(DAEMON, "task.setStatus", { id: row.id, status: "dropped", reason: "e2e" });
      }
    }
  }
}

async function arrive(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
}

/** A linha da sidebar, pelo rótulo — e só dentro da coluna. */
function navRow(page: Page, label: string) {
  return page.locator(".nav .row").filter({ has: page.getByText(label, { exact: true }) });
}

test("de um checkout ao quadro em um clique", async ({ page }) => {
  await arrive(page);
  await createWorktree(page, CHECKOUTS.umClique, "repo-acp");
  await page.getByRole("button", { name: CHECKOUTS.umClique, exact: true }).first().click();

  /*
   * O defeito que a feature existe para consertar: com o checkout aberto, a tela
   * do workspace e o quadro não existiam em lugar nenhum da coluna, e o caminho
   * de volta era o primeiro segmento de um breadcrumb de 30px.
   */
  await navRow(page, "Tarefas").click();

  await expect(page.getByRole("heading", { name: "Quadro de tarefas" })).toBeVisible({
    timeout: 15_000,
  });
});

test("o bloco não rola com a árvore", async ({ page }) => {
  await arrive(page);
  /*
   * A janela encolhe para a árvore **poder** rolar.
   *
   * No fixture a lista cabe inteira na tela, e um caso que não pode falhar é um
   * caso que não existe — foi o que a primeira versão deste teste era, e o
   * `expect(rolou)` abaixo é o que a expôs.
   */
  await page.setViewportSize({ width: 1280, height: 320 });
  const before = await page.locator(".nav").boundingBox();

  /*
   * O bloco mora **fora** da `.tree`, que é `flex: 1; overflow: auto`. Um bloco
   * que rola junto com a lista de projetos é um bloco que some quando ela
   * cresce — e *acessar a qualquer hora* é o pedido inteiro.
   */
  const rolou = await page.locator(".tree").evaluate((tree) => {
    tree.scrollTop = tree.scrollHeight;
    return tree.scrollTop;
  });

  /*
   * **A árvore precisa ter rolado de verdade**, e esta linha é o teste do teste:
   * sem ela, um fixture cuja lista cabe na tela faz o caso passar sem exercitar
   * nada — e um caso que não pode falhar é um caso que não existe.
   */
  expect(rolou).toBeGreaterThan(0);

  const after = await page.locator(".nav").boundingBox();
  expect(after?.y).toBe(before?.y);
});

test("a coluna tem uma resposta só para onde eu estou", async ({ page }) => {
  await arrive(page);
  await createWorktree(page, CHECKOUTS.selecao, "repo-acp");
  const selected = page.locator(".row--selected");

  /*
   * As linhas do bloco são `.row`, a classe da árvore — e a barra de 2px é a
   * mesma. É isso que faz clicar num checkout **apagar** o `Home` sem ninguém
   * ter de coordenar nada, e é a razão de a classe ser compartilhada.
   */
  await navRow(page, "Home").click();
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("Home");

  await navRow(page, "Tarefas").click();
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("Tarefas");

  await page.getByRole("button", { name: CHECKOUTS.selecao, exact: true }).first().click();
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText(CHECKOUTS.selecao);
});

test("a linha responde ao ponteiro, e não só ao acessibilidade", async ({ page }) => {
  await arrive(page);
  const box = await navRow(page, "Home").boundingBox();
  if (box === null) throw new Error("a linha Home não tem caixa");

  /*
   * `elementFromPoint`, e não `toBeVisible` — a mesma pergunta que a `023`
   * precisou fazer, e pelo mesmo motivo: contra um elemento recortado ou coberto
   * por um ancestral, o segundo fica verde. Quem responde aqui é o mouse.
   */
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest(".row")?.textContent ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );

  expect(hit).toContain("Home");
});

test("o número some no zero e aparece quando alguém espera", async ({ page }) => {
  await arrive(page);
  await clearTasks();
  await page.reload();
  await expect(page.locator(".nav .row__n")).toHaveCount(0);

  /*
   * `ready_to_merge` é *sua vez* — o `needsYou` o conta sem depender de relógio
   * nenhum, ao contrário do encalhe, que precisaria de duas horas passando.
   */
  const created = (await call(DAEMON, "task.create", {
    workspaceId: await workspaceId(),
    projectId: (
      (await query(DAEMON, "project.listByWorkspace", {
        workspaceId: await workspaceId(),
      })) as { id: string; name: string }[]
    ).find((row) => row.name === "repo-acp")!.id,
    title: "a que espera você",
  })) as { id: string };
  await call(DAEMON, "task.setStatus", { id: created.id, status: "ready_to_merge" });

  // A leitura é a do quadro, na mesma chave — então abrir o quadro e voltar é o
  // que a invalidação já faz sozinha em produção.
  await page.reload();
  /*
   * `1 tarefa esperando você` — o número e a frase para leitor de tela, que é
   * `textContent` também. Asserir o texto inteiro é o que prova que a frase
   * existe: um `toHaveText("1")` teria exigido apagá-la.
   */
  await expect(page.locator(".nav .row__n")).toHaveText("1 tarefa esperando você", {
    timeout: 15_000,
  });

  await call(DAEMON, "task.remove", { id: created.id });
  await page.reload();
  await expect(page.locator(".nav .row__n")).toHaveCount(0, { timeout: 15_000 });
});
