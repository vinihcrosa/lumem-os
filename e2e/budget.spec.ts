import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { createAgentConfig, createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * O teto do workspace, ponta a ponta (`028` Parte 3, T20).
 *
 * **Zero token.** O teto é conferido **antes** do `session/prompt`, então o
 * agente falso nem precisa responder para o caso existir — o que está sob teste
 * é o portão, e ele fica na frente.
 *
 * Os três caminhos são os de quem **conduz**: avisa e segue. O ramo que bloqueia
 * é da esteira, não tem chamador até a Parte 2, e é coberto onde ele é uma
 * função pura (`tasks/budget.test.ts`) — um e2e que o exercitasse teria que
 * inventar um chamador.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-teto";

/**
 * Uma worktree por caso.
 *
 * Os specs dividem daemon e diretório de estado, então nome repetido é estado
 * carregado entre casos: o segundo acha a worktree já lá e tenta criar uma
 * duplicata.
 */
const WORKTREES = { semTeto: "teto-sem", aviso: "teto-aviso", sobe: "teto-sobe" } as const;

/** `null` antes de o workspace existir — os ganchos rodam antes do primeiro `goto`. */
async function workspaceId(): Promise<string | null> {
  const rows = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  return (rows.find((row) => row.name === "e2e") ?? rows[0])?.id ?? null;
}

async function setCaps(caps: {
  costPerTask: number | null;
  costPerDay: number | null;
  turnsPerSession: number | null;
}): Promise<void> {
  const id = await workspaceId();
  if (id === null) return;
  await call(DAEMON, "workspace.setBudget", { id, ...caps });
}

const SEM_TETO = { costPerTask: null, costPerDay: null, turnsPerSession: null };

/** Uma conversa aberta na worktree deste teste. */
async function conversation(page: Page, worktree: string) {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, worktree, "repo-acp");
  await expect(page.getByRole("heading", { name: worktree })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();

  const conv = page.locator("[role=tabpanel]:not([hidden]) .conv");
  await expect(conv.getByText("sessão aberta, nada pedido ainda")).toBeVisible({ timeout: 30_000 });
  return conv;
}

test.beforeEach(async ({ request }) => {
  await setCaps(SEM_TETO);
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });
});

test.afterEach(async () => {
  // O daemon é compartilhado: um teto deixado de pé é um teto que o próximo
  // spec herda sem ter pedido.
  await setCaps(SEM_TETO);
});

test("sem teto, nada é dito — é o workspace de quem nunca pediu teto", async ({ page }) => {
  const conv = await conversation(page, WORKTREES.semTeto);
  await setCaps(SEM_TETO);

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("oi");
  await page.keyboard.press("ControlOrMeta+Enter");

  /*
   * O pedido de permissão aparecer **é** a prova de que o turno passou do
   * portão: ele fica na frente do `session/prompt`, e o agente falso só chega
   * aqui depois de ter sido chamado.
   */
  await expect(conv.getByRole("group", { name: "pedido de permissão" })).toBeVisible({
    timeout: 30_000,
  });
  // O pior defeito desta fatia seria um teto que nasce valendo: o produto de
  // todo mundo passaria a falar de limite sem ninguém ter pedido.
  await expect(conv.getByText(/teto do workspace/)).toHaveCount(0);
});

test("quem conduz é avisado, e o turno acontece assim mesmo", async ({ page }) => {
  // Teto de zero turno: o primeiro prompt já passou dele. É o caminho mais curto
  // até o aviso, e não depende de nenhum consumo ter sido gravado.
  const conv = await conversation(page, WORKTREES.aviso);
  // O teto entra **depois** de o workspace existir: os ganchos correm antes do
  // primeiro `goto`, e aí não há em quem escrever.
  await setCaps({ ...SEM_TETO, turnsPerSession: 0 });

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("oi");
  await page.keyboard.press("ControlOrMeta+Enter");

  // Avisa **e** deixa passar: interromper alguém que está olhando é como um teto
  // vira desligado e nunca mais ligado (Q45).
  await expect(conv.getByText(/passou do teto do workspace — 0 turnos por sessão/)).toBeVisible({
    timeout: 30_000,
  });
  // E o turno acontece assim mesmo — o agente foi chamado.
  await expect(conv.getByRole("group", { name: "pedido de permissão" })).toBeVisible({
    timeout: 30_000,
  });
});

test("subir o teto apaga o aviso, sem reabrir nada", async ({ page }) => {
  const conv = await conversation(page, WORKTREES.sobe);
  await setCaps({ ...SEM_TETO, turnsPerSession: 0 });

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("primeiro");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(conv.getByText(/passou do teto do workspace/)).toBeVisible({ timeout: 30_000 });

  // O turno anterior ficou esperando uma permissão; responder fecha ele, senão
  // o composer não aceita a segunda mensagem.
  await conv.getByRole("button", { name: /permitir uma vez/ }).click();
  await expect(conv.getByText(/Pronto\. Você pediu: primeiro/)).toBeVisible({ timeout: 30_000 });

  await setCaps({ ...SEM_TETO, turnsPerSession: 50 });

  await conv.getByLabel("mensagem para o agente").click();
  await page.keyboard.type("segundo");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(conv.getByRole("group", { name: "pedido de permissão" })).toBeVisible({
    timeout: 30_000,
  });

  // Um aviso por turno, e o do turno anterior fica na transcrição — ele
  // aconteceu. O que não pode é o novo turno ganhar um.
  await expect(conv.getByText(/passou do teto do workspace/)).toHaveCount(1);
});
