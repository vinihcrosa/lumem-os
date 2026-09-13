import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { createAgentConfig, createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * O quadro, ponta a ponta (`028-autonomous-orchestration` T12).
 *
 * **Zero token.** O agente é falso e nenhum modelo é chamado — o que está sob
 * teste é a costura: as sete colunas, o arrasto que persiste, e o selo que
 * **volta sozinho na leitura seguinte, sem nenhuma escrita**.
 *
 * Este último é o par que o §12 da PRD pede, e é o único dos dois que a F1
 * alcança: o outro precisa da esteira.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-quadro";

/** Uma worktree por teste. Nome repetido entre specs é estado carregado. */
const WORKTREES = { seal: "quadro-selo" } as const;

interface Card {
  id: string;
  title: string;
  seal: { kind: string; role?: string | null };
}

interface Column {
  status: string;
  cards: Card[];
}

async function workspaceId(): Promise<string> {
  const rows = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = rows.find((row) => row.name === "e2e") ?? rows[0];
  if (found === undefined) throw new Error("nenhum workspace");
  return found.id;
}

async function projectId(name: string): Promise<string> {
  const projects = (await query(DAEMON, "project.listByWorkspace", {
    workspaceId: await workspaceId(),
  })) as { id: string; name: string }[];
  const found = projects.find((row) => row.name === name);
  if (found === undefined) throw new Error(`não achei o projeto ${name}`);
  return found.id;
}

async function board(): Promise<Column[]> {
  return (await query(DAEMON, "task.board", { workspaceId: await workspaceId() })) as Column[];
}

async function cardIn(status: string, title: string): Promise<Card | undefined> {
  return (await board()).find((column) => column.status === status)?.cards.find(
    (card) => card.title === title,
  );
}

async function seed(title: string, status?: string): Promise<string> {
  const created = (await call(DAEMON, "task.create", {
    workspaceId: await workspaceId(),
    projectId: await projectId("repo-acp"),
    title,
  })) as { id: string };
  if (status !== undefined) await call(DAEMON, "task.setStatus", { id: created.id, status });
  return created.id;
}

/**
 * Workspace e projeto de pé — **antes** de semear.
 *
 * A tarefa pendura num projeto que pendura num workspace, então semear primeiro
 * é semear no vazio: o `task.create` não tem onde cair.
 */
async function arrive(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  // O projeto aberto é o que põe `e2e` na migalha **como botão**: sem ele o
  // workspace é um `combobox` na sidebar, e clicar numa opção de `select` não é
  // clicar num botão.
  await openProject(page, "repo-acp");
}

/** Da tela do projeto até o quadro, pela migalha. */
async function openBoard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "e2e", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "e2e" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "quadro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quadro" })).toBeVisible({ timeout: 15_000 });
}

/**
 * O quadro começa vazio em cada caso.
 *
 * A suíte compartilha daemon e diretório de estado, então tarefa de um caso é
 * estado do próximo — e um quadro é justamente a tela que **conta**: "três na
 * To-Do" vira quatro sem ninguém ter feito nada.
 *
 * `remove` só apaga tarefa sem sessão; a que teve uma vira `dropped`, que sai
 * do quadro e vira arquivo (§6/F1). As duas portas juntas limpam tudo.
 */
async function clearBoard(): Promise<void> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  if (workspace === undefined) return;

  const rows = (await query(DAEMON, "task.listByWorkspace", {
    workspaceId: workspace.id,
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

test.beforeEach(async ({ request }) => {
  await clearBoard();
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });
});

test("as sete colunas, com as duas pontas recolhidas", async ({ page }) => {
  await arrive(page);
  await seed("no backlog, ainda não é pra fazer", "backlog");
  await seed("na fila, é pra fazer");
  await seed("pronta pra mesclar", "ready_to_merge");

  await openBoard(page);

  // Cinco colunas abertas e dois trilhos — o default medido em 1440. Recolher a
  // esteira seria mutilar o quadro; recolher as pontas é dizer o que elas já são.
  await expect(page.locator("section.col")).toHaveCount(5);
  await expect(page.locator("button.col--rail")).toHaveCount(2);

  for (const label of ["To-Do", "In Progress", "In Review", "Testing", "Ready to Merge"]) {
    await expect(page.locator("section.col").filter({ hasText: label })).toHaveCount(1);
  }
  // Coluna vazia é uma resposta, não uma coluna escondida.
  await expect(page.locator("section.col").filter({ hasText: "Testing" }).locator(".col__empty")).toBeVisible();

  // E com a autonomia desligada — o default do produto — ninguém pegou nada.
  await expect(page.getByText("manual — ninguém pega").first()).toBeVisible();
});

test("arrastar persiste a coluna e a ordem, e In Progress aceita", async ({ page }) => {
  await arrive(page);
  await seed("a primeira da fila");
  await seed("a segunda da fila");
  const third = await seed("a terceira, que vai subir");

  await openBoard(page);

  const todo = page.locator("section.col").filter({ hasText: "To-Do" });
  await expect(todo.locator(".tcard")).toHaveCount(3);

  // Subir a terceira para o topo: a posição **é** a prioridade (§4.3).
  await todo.locator(".tcard").nth(2).dragTo(todo.locator(".tcard").nth(0));

  await expect
    .poll(async () => {
      const column = (await board()).find((one) => one.status === "open");
      return column?.cards.map((card) => card.title);
    }, { timeout: 15_000 })
    .toEqual(["a terceira, que vai subir", "a primeira da fila", "a segunda da fila"]);

  // E arrastar para uma coluna da máquina **funciona**: é como se diz "estou
  // fazendo isto na mão", e o selo conta a verdade — ninguém pegou.
  const progress = page.locator("section.col").filter({ hasText: "In Progress" });
  await todo.locator(".tcard").nth(0).dragTo(progress.locator(".col__body"));

  await expect.poll(async () => (await cardIn("in_progress", "a terceira, que vai subir"))?.seal.kind, {
    timeout: 15_000,
  }).toBe("manual");
  expect(third).not.toBe("");
});

test("o selo acende com o turno e volta sozinho, sem ninguém escrever", async ({ page }) => {
  /*
   * O par que o §12 da PRD pede.
   *
   * A janela em que o turno está **em voo** é o pedido de permissão: o agente
   * falso para ali e espera uma resposta, então o selo fica estável o bastante
   * para ser lido. Responder fecha o turno — e é a **leitura seguinte** que
   * devolve `manual`, sem nenhuma escrita em lugar nenhum.
   */
  await arrive(page);
  const taskId = await seed("a tarefa que alguém está tocando");

  await openProject(page, "repo-acp");
  await createWorktree(page, WORKTREES.seal, "repo-acp");
  await expect(page.getByRole("heading", { name: WORKTREES.seal })).toBeVisible({ timeout: 30_000 });

  const worktrees = (await query(DAEMON, "worktree.listByProject", {
    projectId: await projectId("repo-acp"),
  })) as { id: string; name: string }[];
  const worktree = worktrees.find((row) => row.name === WORKTREES.seal);
  if (worktree === undefined) throw new Error("a worktree do teste não existe");

  const configs = (await query(DAEMON, "agentConfig.list", {})) as { id: string; name: string }[];
  const config = configs.find((row) => row.name === AGENT);
  if (config === undefined) throw new Error("a configuração do agente falso não existe");

  // A sessão nasce **ligada à tarefa**, que é o que faz a seta ser derivada.
  await call(DAEMON, "session.createAgent", {
    scopeType: "worktree",
    scopeId: worktree.id,
    agentConfigId: config.id,
    taskId,
  });

  // A sessão mora na **worktree**, então é ela que tem de estar aberta: o
  // projeto é outro escopo, e a aba de conversa não está lá.
  await page.reload();
  await page.getByLabel("árvore de projetos").getByRole("button", { name: new RegExp(`^${WORKTREES.seal}\\b`) }).click();
  await expect(page.getByRole("heading", { name: WORKTREES.seal })).toBeVisible({ timeout: 30_000 });

  // A primeira aba do checkout é o próprio checkout (`018-worktree-first-tab`);
  // a conversa é a segunda, e ela existe porque a sessão foi criada acima.
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(2, { timeout: 30_000 });
  await tabs.nth(1).click();

  const conv = page.locator("[role=tabpanel]:not([hidden]) .conv");
  await expect(conv).toBeVisible({ timeout: 30_000 });
  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("mexe no arquivo");
  await page.keyboard.press("ControlOrMeta+Enter");

  // Turno em voo: o agente falso parou no pedido de permissão.
  const permission = conv.getByRole("group", { name: "pedido de permissão" });
  await expect(permission).toBeVisible({ timeout: 30_000 });

  // A seta andou porque houve um **primeiro prompt**, não porque alguém pediu.
  await expect.poll(async () => (await cardIn("in_progress", "a tarefa que alguém está tocando"))?.seal, {
    timeout: 15_000,
  }).toMatchObject({ kind: "working", role: "implementador" });

  await permission.getByRole("button", { name: /permitir uma vez/ }).click();

  // O turno acabou. Nenhuma escrita: é a leitura seguinte que devolve outro
  // selo — e o cartão **não** volta de coluna.
  await expect.poll(async () => (await cardIn("in_progress", "a tarefa que alguém está tocando"))?.seal.kind, {
    timeout: 30_000,
  }).toBe("manual");
  expect(await cardIn("open", "a tarefa que alguém está tocando")).toBeUndefined();
});

test("abaixo do piso o quadro diz que está rolando, e a faixa é clicável", async ({ page }) => {
  await arrive(page);
  await seed("uma tarefa qualquer");
  await openBoard(page);

  await page.setViewportSize({ width: 1100, height: 900 });

  const band = page.locator(".bd__clip");
  await expect(band).toContainText(/colunas? fora da tela/, { timeout: 15_000 });

  /*
   * `document.elementFromPoint`, e **não** `toBeVisible`.
   *
   * É a lição da [`023`](../docs/features/023-composer-menus/prd.md): contra um
   * elemento recortado por ancestral, `toBeVisible` fica verde. A pergunta que
   * distingue os dois é quem está pintando naquele pixel.
   */
  const onTop = await band.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && node.contains(hit);
  });
  expect(onTop).toBe(true);

  // E ela some ao alargar: um aviso que não some é a mesma doença de um que não
  // aparece.
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect(band).toHaveCount(0, { timeout: 15_000 });
});
