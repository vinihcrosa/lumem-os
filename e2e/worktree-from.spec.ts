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

async function openDialog(page: Page): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page, WORKSPACE);
  await ensureProject(page, E2E_FIXTURE_REPO_ORIGINS, PROJECT);
  await openProject(page, PROJECT);
  await page.getByRole("button", { name: `nova worktree em ${PROJECT}` }).click();
  await expect(page.getByLabel("Nome da worktree")).toBeVisible();
}

async function create(page: Page, name: string): Promise<void> {
  const field = page.getByLabel("Nome da worktree");
  await field.fill(name);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("tab", { name })).toBeVisible({ timeout: 30_000 });
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

test("o campo de nome funciona antes de as listas chegarem", async ({ page }) => {
  // F3.5, com o daemon de verdade no meio: a leitura do host começa depois de o
  // diálogo existir, e o gesto não espera por ela.
  await openDialog(page);

  await page.getByLabel("Nome da worktree").fill("antes-da-rede");

  await expect(page.getByLabel("Nome da worktree")).toHaveValue("antes-da-rede");
  await expect(page.getByRole("button", { name: "criar" })).toBeEnabled();
});

test("corta de uma branch local que já existe, e o nome não é a branch", async ({ page }) => {
  await openDialog(page);

  await page.getByRole("button", { name: "branch", exact: true }).click();
  await page.getByRole("option", { name: /feature-local/ }).click();
  await create(page, "trabalho");

  // Q9: a branch é a que existia, o nome é o da worktree. As duas divergem, e
  // isto é a primeira vez que o produto faz isso.
  expect(branchOnDisk("trabalho")).toBe("feature-local");
});

test("corta de uma issue, com o nome derivado dela", async ({ page }) => {
  await openDialog(page);

  await page.getByRole("button", { name: "issue", exact: true }).click();
  await page.getByRole("option", { name: /#52/ }).click();

  // O nome vem montado aqui — sem `gh issue develop`, que escreveria no host.
  await expect(page.getByLabel("Nome da worktree")).toHaveValue("52-cortar-de-uma-issue");
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("tab", { name: "52-cortar-de-uma-issue" })).toBeVisible({
    timeout: 30_000,
  });

  expect(branchOnDisk("52-cortar-de-uma-issue")).toBe("52-cortar-de-uma-issue");
});

test("corta da head de uma PR publicada, e o HEAD não fica destacado", async ({ page }) => {
  await openDialog(page);

  await page.getByRole("button", { name: "PR", exact: true }).click();
  await page.getByRole("option", { name: /#19/ }).click();
  await create(page, "da-pr");

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

  await page.getByRole("button", { name: "PR", exact: true }).click();
  const row = page.getByRole("option", { name: /#21/ });
  await expect(row).toBeEnabled();
  await expect(row.getByText("busca ao criar")).toBeVisible();

  await row.click();
  await create(page, "da-busca");

  expect(branchOnDisk("da-busca")).toBe("da-busca");
  expect(upstreamOnDisk("da-busca")).toBe("origin/publicada-depois");
});

test("um projeto sem host abre o diálogo de sempre", async ({ page }) => {
  // O `fixture` não tem remote nenhum: as duas abas de host não aparecem, e o
  // campo de nome continua funcionando sozinho.
  await page.goto("/");
  await ensureWorkspace(page, WORKSPACE);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");
  await page.getByRole("button", { name: "nova worktree em fixture" }).click();

  await expect(page.getByText(/não tem remoto/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "issue", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PR", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "branch", exact: true })).toBeVisible();
});
