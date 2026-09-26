import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_STATE_DIR } from "../ports.js";
import { E2E_FIXTURE_REPO, E2E_FIXTURE_REPO_ORIGINS, E2E_GH_STATE } from "./support/fixtures.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * Cortar worktree de uma issue, de uma branch e de uma PR — com o `gh` de
 * mentira e **zero rede**.
 *
 * O que só um navegador prova, e por isso está aqui e não nos testes de
 * componente:
 *
 * - a worktree criada **fica na branch certa**, conferido com `git` no disco. É
 *   a asserção que pega a armadilha medida na fase 0: `worktree add <path>
 *   origin/<ref>` devolve código zero e HEAD **destacado**, e uma tela que só
 *   olha para a tela veria uma worktree perfeitamente normal;
 * - as duas listas do host chegam **depois** de o diálogo abrir, atravessando o
 *   daemon de verdade, o cache e um processo `gh` real (falso, mas processo);
 * - um projeto sem host abre o mesmo diálogo, sem espera e sem erro.
 *
 * Desde a `033` F4 o diálogo é o `NewWorktreeComposer`: o trilho de origem
 * (`OriginPicker`, T19) virou um popover ancorado no botão `origem: …` do
 * cabeçalho, e o nome deixou de ser o primeiro campo — é o `…`, derivado do
 * prompt ou da origem até alguém escrever nele (F4.2). O que a F3.5 media
 * ("o campo de nome funciona antes das listas chegarem") passou para o prompt:
 * é ele que está utilizável no primeiro quadro agora — a nota da `033` no
 * requisito da própria feature diz isso.
 */

const PROJECT = "repo-origins";
const WORKSPACE = "e2e";

/** O que o `gh` falso responde na próxima execução. */
function say(state: { pulls?: unknown[]; issues?: unknown[] }): void {
  writeFileSync(E2E_GH_STATE, JSON.stringify({ pulls: [], issues: [], ...state }), "utf8");
}

function pull(number: number, headRefName: string, title: string): Record<string, unknown> {
  return {
    number,
    url: `https://github.com/exemplo/repo/pull/${number}`,
    title,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefName,
    baseRefName: "main",
    updatedAt: "2026-09-07T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "pessoa-1",
    reviews: [],
    checks: [],
  };
}

function issue(number: number, title: string): Record<string, unknown> {
  return {
    number,
    title,
    state: "OPEN",
    url: `https://github.com/exemplo/repo/issues/${number}`,
    updatedAt: "2026-09-07T12:00:00Z",
    author: "pessoa-1",
    labels: [],
  };
}

/** Em qual branch a worktree ficou — perguntado ao git, e não à tela. */
function branchOnDisk(name: string): string {
  const path = join(E2E_STATE_DIR, "workspaces", WORKSPACE, PROJECT, "worktrees", ...name.split("/"));
  return execFileSync("git", ["branch", "--show-current"], { cwd: path, encoding: "utf8" }).trim();
}

function upstreamOnDisk(name: string): string {
  const path = join(E2E_STATE_DIR, "workspaces", WORKSPACE, PROJECT, "worktrees", ...name.split("/"));
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "@{u}"], {
    cwd: path,
    encoding: "utf8",
  }).trim();
}

/** O compositor da worktree, aberto pelo `+` da linha do projeto. */
function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Nova worktree" });
}

async function openDialog(page: Page, project = PROJECT): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page, WORKSPACE);
  await ensureProject(page, E2E_FIXTURE_REPO_ORIGINS, PROJECT);
  await openProject(page, PROJECT);
  await page.getByRole("button", { name: `nova worktree em ${project}` }).click();
  await expect(dialog(page)).toBeVisible();
}

/** Abre o popover do trilho de origem, ancorado no botão `origem: …` do cabeçalho. */
async function openOrigin(page: Page): Promise<void> {
  await dialog(page).getByRole("button", { name: /^origem:/ }).click();
}

/** Fecha o popover se ele ainda estiver aberto — o mesmo botão alterna. */
async function closeOriginIfOpen(page: Page): Promise<void> {
  const trigger = dialog(page).getByRole("button", { name: /^origem:/ });
  if ((await trigger.getAttribute("aria-expanded")) === "true") await trigger.click();
}

/**
 * Escreve o prompt, opcionalmente escolhe um nome à mão (o `…`) e cria.
 *
 * Todo `Create` exige um prompt não vazio (F4.3) — mesmo quando o que o teste
 * quer provar é a origem ou o nome derivado, e não o texto em si.
 */
async function create(page: Page, prompt: string, name?: string): Promise<void> {
  const box = dialog(page);
  await closeOriginIfOpen(page);
  await box.getByLabel("No que você quer trabalhar?").fill(prompt);
  if (name !== undefined) {
    await box.getByRole("button", { name: "nome da worktree" }).click();
    // `getByRole("textbox", …)`: o botão que abre o campo tem o mesmo
    // `aria-label` do rótulo do campo, e `getByLabel` casaria os dois.
    await box.getByRole("textbox", { name: "Nome da worktree" }).fill(name);
  }
  await box.getByRole("button", { name: /^Create/ }).click();
}

test.describe.configure({ mode: "serial" });

/*
 * O estado do host, escrito **uma vez**, antes de qualquer diálogo abrir.
 *
 * E isto é um achado, não uma conveniência: o `IssueCache` guarda por projeto
 * com TTL de 60 s, e a lista de origens **não tem `⟳`** — a barra de PR tem, e
 * é assim que o spec dela faz o host mudar de resposta no meio do arquivo. Aqui,
 * o primeiro diálogo que abrir congela a resposta para o resto da suíte.
 *
 * A limitação é do produto e está registrada no
 * [backlog](../docs/project/backlog.md): quem abre uma issue no navegador e volta
 * ao Lumem espera até um minuto para vê-la. O spec não a contorna com um truque —
 * ele escreve o estado que um repositório teria e o mantém.
 */
test.beforeAll(() => {
  say({
    issues: [issue(52, "cortar de uma issue")],
    pulls: [
      pull(19, "feature-publicada", "a PR publicada"),
      // Existe no upstream e não no clone: é a que exercita a busca.
      pull(21, "publicada-depois", "a PR publicada depois do último fetch"),
    ],
  });
});

test("o campo de prompt funciona antes de as listas chegarem", async ({ page }) => {
  // F3.5 (nota da `033`): o gesto não espera pela leitura do host — o que está
  // utilizável no primeiro quadro é o prompt, não mais um campo de nome.
  await openDialog(page);

  const prompt = dialog(page).getByLabel("No que você quer trabalhar?");
  await prompt.fill("antes da rede");

  await expect(prompt).toHaveValue("antes da rede");
  await expect(dialog(page).getByRole("button", { name: /^Create/ })).toBeEnabled();
});

test("corta de uma branch local que já existe, e o nome não é a branch", async ({ page }) => {
  await openDialog(page);
  await openOrigin(page);

  await dialog(page).getByRole("button", { name: "branch", exact: true }).click();
  await dialog(page).getByRole("option", { name: /feature-local/ }).click();
  await create(page, "trabalha na branch local", "trabalho");

  await expect(page.getByRole("tab", { name: "trabalho" })).toBeVisible({ timeout: 30_000 });

  // Q9: a branch é a que existia, o nome é o da worktree. As duas divergem, e
  // isto é a primeira vez que o produto faz isso.
  expect(branchOnDisk("trabalho")).toBe("feature-local");
});

test("corta de uma issue, com o nome derivado dela", async ({ page }) => {
  await openDialog(page);
  await openOrigin(page);

  await dialog(page).getByRole("button", { name: "issue", exact: true }).click();
  await dialog(page).getByRole("option", { name: /#52/ }).click();

  // O nome vem montado aqui — sem `gh issue develop`, que escreveria no host.
  // Sem valor no campo (ele fica vazio até alguém escrever, F4.2): o nome
  // derivado mora no `title` do botão `…`, que a folha desenha com
  // `nome: ${finalName}` esteja o painel aberto ou não.
  await expect(dialog(page).getByRole("button", { name: "nome da worktree" })).toHaveAttribute(
    "title",
    "nome: 52-cortar-de-uma-issue",
  );

  await create(page, "corta a partir da issue 52");
  await expect(page.getByRole("tab", { name: "52-cortar-de-uma-issue" })).toBeVisible({
    timeout: 30_000,
  });

  expect(branchOnDisk("52-cortar-de-uma-issue")).toBe("52-cortar-de-uma-issue");
});

test("corta da head de uma PR publicada, e o HEAD não fica destacado", async ({ page }) => {
  await openDialog(page);
  await openOrigin(page);

  await dialog(page).getByRole("button", { name: "PR", exact: true }).click();
  await dialog(page).getByRole("option", { name: /#19/ }).click();
  await create(page, "corta da PR publicada", "da-pr");

  await expect(page.getByRole("tab", { name: "da-pr" })).toBeVisible({ timeout: 30_000 });

  // A asserção que pega a armadilha: com `origin/feature-publicada` passado
  // solto, isto seria vazio e a worktree existiria mesmo assim.
  expect(branchOnDisk("da-pr")).toBe("da-pr");
  expect(upstreamOnDisk("da-pr")).toBe("origin/feature-publicada");
});

test("a PR cuja head não está no clone é buscada, e então cortada", async ({ page }) => {
  /*
   * A Q2 revertida (ADR de 2026-09-08), atravessando tudo: o daemon busca de um
   * "GitHub" que é um repositório em disco — `insteadOf` reescreve a URL na hora
   * de falar com a rede, e o caminho de código é o de verdade.
   *
   * `publicada-depois` existe no upstream e **não** no clone: a fixture apaga a
   * ref de propósito, que é o estado de quem não roda `fetch` há uma semana.
   */
  await openDialog(page);
  await openOrigin(page);

  await dialog(page).getByRole("button", { name: "PR", exact: true }).click();
  const row = dialog(page).getByRole("option", { name: /#21/ });
  await expect(row).toBeEnabled();
  await expect(row.getByText("busca ao criar")).toBeVisible();

  await row.click();
  await create(page, "corta da PR que precisa de busca", "da-busca");

  await expect(page.getByRole("tab", { name: "da-busca" })).toBeVisible({ timeout: 30_000 });

  expect(branchOnDisk("da-busca")).toBe("da-busca");
  expect(upstreamOnDisk("da-busca")).toBe("origin/publicada-depois");
});

test("um projeto sem host abre o diálogo de sempre", async ({ page }) => {
  // O `fixture` não tem remote nenhum: as duas abas de host não aparecem, e o
  // prompt continua funcionando sozinho.
  await page.goto("/");
  await ensureWorkspace(page, WORKSPACE);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");
  await page.getByRole("button", { name: "nova worktree em fixture" }).click();
  await openOrigin(page);

  await expect(page.getByText(/não tem remoto/)).toBeVisible({ timeout: 20_000 });
  await expect(dialog(page).getByRole("button", { name: "issue", exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "PR", exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "branch", exact: true })).toBeVisible();
});
