import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { E2E_FIXTURE_REPO_PR, E2E_GH_STATE } from "./support/fixtures.js";
import { createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";

/**
 * A barra da pull request, do âmbar ao verde, com um `gh` de mentira.
 *
 * **Zero rede.** Um executável na frente do `PATH` do daemon responde o que
 * este arquivo escreve num JSON — processo de verdade, `argv` de verdade, saída
 * de verdade. É o mesmo espírito de "filesystem de verdade" que o resto do
 * repositório usa, e é a única forma honesta: o `gh` real fala com a conta de
 * quem roda a suíte.
 *
 * O que só um navegador prova, e por isso está aqui e não nos 41 testes de
 * componente:
 *
 * - a barra **existe no lugar certo** — acima da faixa de abas do painel, sem
 *   empurrar nem comer os outros três andares;
 * - a quarta aba **aparece e some** conforme a PR existe;
 * - o marcador da sidebar e a barra concordam sobre o mesmo instante, com o
 *   daemon de verdade no meio;
 * - `⟳` alcança o host: o único andar da coluna cujo dado não é local.
 */

const PROJECT = "repo-pr";

/**
 * Uma branch por teste, e é isso que os isola.
 *
 * O daemon guarda **um instantâneo por projeto** — é a feature inteira, F4.3 —
 * e os specs compartilham um daemon. Com uma branch só, cada teste começaria
 * vendo a pull request que o anterior deixou, e a primeira asserção falaria
 * sobre um estado que não é dele. O `gh` casa PR com worktree pelo
 * `headRefName`, então branches próprias resolvem isso na raiz, sem cerimônia
 * de limpeza entre um teste e outro.
 */
const CORES = "pr-cores";
const ABA = "pr-aba";
const MARCADOR = "pr-marcador";
const MERGE = "pr-merge";

const CHECK_OK = {
  name: "lint",
  app: "CI",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  url: "https://github.com/exemplo/repo/actions/runs/1/job/1",
  startedAt: "2026-09-05T11:58:00Z",
  completedAt: "2026-09-05T11:58:38Z",
};

function pull(branch: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 19,
    url: "https://github.com/exemplo/repo/pull/19",
    title: "a barra da PR",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefName: branch,
    baseRefName: "main",
    updatedAt: "2026-09-05T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "pessoa-1",
    reviews: [],
    checks: [CHECK_OK],
    ...over,
  };
}

/** O que o `gh` falso vai responder na próxima execução. */
function say(pulls: Array<Record<string, unknown>>): void {
  writeFileSync(E2E_GH_STATE, JSON.stringify({ pulls }), "utf8");
}

/**
 * Força o daemon a reler o host.
 *
 * O `⟳` da coluna é o gesto do produto para isto, e ele existe porque
 * "recarregar" quer dizer *tudo o que esta coluna mostra*. Invalidar só no
 * cliente devolveria o mesmo valor em cache — o TTL vive no daemon.
 */
async function reload(page: Page): Promise<void> {
  await page.getByRole("button", { name: "recarregar" }).click();
}

function bar(page: Page) {
  return page.getByRole("status", { name: "estado da pull request" });
}

async function openColumn(page: Page): Promise<void> {
  if ((await page.getByLabel("arquivos do checkout").count()) === 0) {
    await page.getByRole("button", { name: "abrir a coluna de arquivos" }).click();
  }
  await expect(page.getByLabel("arquivos do checkout")).toBeVisible();
}

/** Abre a worktree deste teste, criando na primeira vez que ele roda. */
async function openWorktree(page: Page, name: string): Promise<void> {
  const row = page.getByLabel("árvore de projetos").getByRole("button", {
    name: new RegExp(`^${name}`),
  });

  const present = await row
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (present) await row.first().click();
  else {
    await createWorktree(page, name, PROJECT);
  }

  await expect(page.getByRole("tab", { name })).toBeVisible({ timeout: 30_000 });
}

/**
 * Entra na worktree deste teste, com o que o `gh` deve responder já escrito.
 *
 * O `⟳` no fim não é cerimônia: o daemon guarda **um instantâneo por projeto**
 * (F4.3, e é a feature inteira), e os specs compartilham um daemon. Escrever o
 * arquivo não desfaz um cache dentro do TTL — pedir para reler desfaz, e é o
 * mesmo gesto que uma pessoa usaria.
 */
async function enter(page: Page, branch: string, pulls: Array<Record<string, unknown>>): Promise<void> {
  say(pulls);
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_PR, PROJECT);
  await openProject(page, PROJECT);
  await openWorktree(page, branch);
  await openColumn(page);
  await expect(bar(page)).toBeVisible({ timeout: 20_000 });
  await reload(page);
}

test.beforeEach(() => {
  // `git worktree add` num repositório de verdade, mais o primeiro acesso: os
  // 30s padrão são o orçamento da asserção, não o da criação.
  test.setTimeout(90_000);
});

test("a barra vai de verificando a falhou a pronta, e a cor acompanha", async ({ page }) => {
  // 1 · verificando — âmbar, porque ainda não se sabe. Metade da vida de uma PR
  //     é isso, e pintar de vermelho seria gritar lobo.
  await enter(page, CORES, [
    pull(CORES, {
      checks: [
        CHECK_OK,
        {
          ...CHECK_OK,
          name: "e2e (macOS)",
          status: "IN_PROGRESS",
          conclusion: "",
          completedAt: null,
        },
      ],
    }),
  ]);

  await expect(bar(page)).toHaveClass(/prbar--pending/, { timeout: 20_000 });
  await expect(bar(page).getByText("1 verificação rodando")).toBeVisible();

  // 2 · falhou — vermelho, e o culpado tem nome. Daqui em diante quem faz a
  //     barra andar é o `⟳`, que é o gesto do produto para reler o host.
  say([
    pull(CORES, {
      checks: [CHECK_OK, { ...CHECK_OK, name: "e2e (macOS)", conclusion: "FAILURE" }],
    }),
  ]);
  await reload(page);

  await expect(bar(page)).toHaveClass(/prbar--blocked/, { timeout: 20_000 });
  await expect(bar(page).getByText("1 verificação falhou")).toBeVisible();
  await expect(bar(page).getByText("e2e (macOS)")).toBeVisible();

  // 3 · pronta — verde. Nada impede.
  say([
    pull(CORES, {
      reviewDecision: "APPROVED",
      reviews: [{ author: "pessoa-2", state: "APPROVED" }],
    }),
  ]);
  await reload(page);

  await expect(bar(page)).toHaveClass(/prbar--ready/, { timeout: 20_000 });
  await expect(bar(page).getByText("pronta para merge")).toBeVisible();
});

test("a aba PR aparece com a PR, mostra o reprovado no topo, e some quando ela some", async ({
  page,
}) => {
  // Sem PR, a quarta aba não existe: aba permanente que passa a vida vazia
  // ensina o olho a pular a faixa inteira.
  await enter(page, ABA, []);
  await expect(page.getByRole("tab", { name: /^PR/ })).toHaveCount(0);

  const green = Array.from({ length: 6 }, (_, index) => ({
    ...CHECK_OK,
    name: `verde-${String(index)}`,
  }));
  say([
    pull(ABA, { checks: [...green, { ...CHECK_OK, name: "e2e (macOS)", conclusion: "FAILURE" }] }),
  ]);
  await reload(page);

  const tab = page.getByRole("tab", { name: /^PR/ });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  // A contagem é o distintivo, e ela é colorida pelo PIOR estado.
  await expect(tab).toContainText("✕1");

  await tab.click();

  // Reprovado abaixo de seis linhas verdes é reprovado invisível: o grupo que
  // precisa de você vem primeiro, e a primeira linha é a que quebrou.
  const rows = page.locator(".checks__row");
  await expect(rows.first()).toContainText("e2e (macOS)");
  await expect(page.getByText("precisa de você")).toBeVisible();

  // O `↗` da linha abre AQUELA execução, e não a PR. O clique não sai do teste:
  // o que se verifica é o destino.
  await expect(
    page.getByRole("link", { name: /abrir a execução de e2e \(macOS\)/ }),
  ).toHaveAttribute("href", "https://github.com/exemplo/repo/actions/runs/1/job/1");

  // E some quando a PR some, devolvendo a seleção para uma aba que existe.
  say([]);
  await reload(page);
  await expect(page.getByRole("tab", { name: /^PR/ })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole("tab", { name: "Arquivos" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("o marcador da sidebar diz o mesmo que a barra, e sobrevive ao painel fechado", async ({
  page,
}) => {
  await enter(page, MARCADOR, [pull(MARCADOR, { checks: [{ ...CHECK_OK, conclusion: "FAILURE" }] })]);
  await expect(bar(page)).toHaveClass(/prbar--blocked/, { timeout: 20_000 });

  const mark = page
    .getByLabel("árvore de projetos")
    .locator(`[data-kind=worktree]:has-text("${MARCADOR}") .prmark`);
  await expect(mark).toContainText("#19", { timeout: 20_000 });
  // A cor sai do mesmo veredito: se as duas discordassem, ninguém saberia em
  // qual acreditar.
  await expect(mark).toHaveClass(/prmark--blocked/);

  // É o único sinal de PR que sobrevive ao painel fechado — e o painel nasce
  // fechado. Sem ele, a pergunta que a feature existe para responder não teria
  // onde ser respondida.
  // O `›` do painel, e não o interruptor da faixa de abas: os dois fecham a
  // coluna, e o nome acessível de um contém o do outro.
  await page.getByRole("button", { name: "› fechar a coluna" }).click();
  await expect(page.getByLabel("arquivos do checkout")).toHaveCount(0);
  await expect(mark).toContainText("#19");
  await expect(mark).toHaveClass(/prmark--blocked/);
});

test("o ↗ leva à pull request, e mesclar só é oferecido com o veredito pronto", async ({ page }) => {
  await enter(page, MERGE, [pull(MERGE, { checks: [{ ...CHECK_OK, conclusion: "FAILURE" }] })]);
  await expect(bar(page)).toHaveClass(/prbar--blocked/, { timeout: 20_000 });

  await expect(page.getByRole("link", { name: /abrir a pull request 19/ })).toHaveAttribute(
    "href",
    "https://github.com/exemplo/repo/pull/19",
  );
  // Vermelho não oferece merge: um merge a partir de um estado que a barra
  // pintou de vermelho é o modo de falha que a barra existe para evitar.
  await expect(page.getByRole("button", { name: "mesclar" })).toHaveCount(0);

  say([pull(MERGE)]);
  await reload(page);
  await expect(bar(page)).toHaveClass(/prbar--ready/, { timeout: 20_000 });
  await page.getByRole("button", { name: "mesclar" }).click();

  const dialog = page.getByRole("dialog", { name: "mesclar a pull request" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Mesclar a #19");
  // As estratégias vêm do host: o `gh` falso responde `rebaseMergeAllowed:
  // false`, e a tela não inventa o terceiro botão.
  await expect(dialog.getByRole("radio", { name: "squash" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "merge commit" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "rebase" })).toHaveCount(0);

  /*
   * E ele cabe **dentro da coluna**.
   *
   * Não é zelo: a primeira versão reusava o `.gate` do modo liberado, que é
   * `position: absolute; bottom: 100%` com 420px de largura, ancorado ao
   * compositor da conversa. Numa coluna de 360px ele ia parar acima do painel
   * inteiro — e nada acusava: o jsdom não faz layout, e o `toBeVisible` daqui
   * aprova elemento posicionado fora da tela. Medir é o único jeito.
   */
  const caixa = await dialog.boundingBox();
  const coluna = await page.getByLabel("arquivos do checkout").boundingBox();
  expect(caixa).not.toBeNull();
  expect(coluna).not.toBeNull();
  expect(caixa!.x).toBeGreaterThanOrEqual(coluna!.x - 1);
  expect(caixa!.y).toBeGreaterThanOrEqual(coluna!.y - 1);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(coluna!.x + coluna!.width + 1);
});
