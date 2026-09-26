import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_SERVER_PORT, E2E_STATE_DIR } from "../ports.js";
import { ensureProject, ensureWorkspace, openNewAgent, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO_ACCOUNTS } from "./support/fixtures.js";

/**
 * O critério de sucesso da `034`, de ponta a ponta (§1 da PRD, T17).
 *
 * *"Com duas contas do Claude conectadas, abrir uma conversa com Opus 5 na conta
 * `pessoal` e outra com Fable 5.1 na conta `trabalho`, lado a lado, e cada uma
 * gastar — e aparecer gastando — na conta certa."*
 *
 * A token zero: as duas contas são o mesmo fake, e o que as separa é o que o
 * produto promete separar — o **ambiente do processo**. O fake responde
 * `em que conta você está` dizendo a `CLAUDE_CONFIG_DIR` que **ele** viu, lida
 * do próprio `process.env`. É a única testemunha que não é o daemon: o banco diz
 * em que conta a sessão nasceu; só o processo diz com que conta ele subiu.
 *
 * A conta padrão é a que já existia — a do login desta máquina, sem diretório —,
 * e ela nasce `principal`, e não com o nome do agente (nota da Q2 de 2026-09-26:
 * `claude · claude` era o produto dando nome no seu lugar). O que o critério
 * cobra dela é o outro lado da mesma moeda: subir **sem** a variável, e não com
 * o caminho padrão escrito nela (ADR de 2026-09-26).
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const PROJECT = "repo-accounts";
const WORK = "trabalho";
/** A frase que o fake reconhece. Combinada com ele, e com mais nada. */
const ASK = "em que conta você está";

interface Account {
  id: string;
  label: string;
  adapterId: string;
  configDir: string | null;
  bare: boolean;
  state: string;
  sessionCount: number;
}

async function claudeAccounts(): Promise<Account[]> {
  return (await query(DAEMON, "agentAccount.list", { adapterId: "claude" })) as Account[];
}

function conversation(page: Page): Locator {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

/** O centro do elemento é dele — a regra da `023`: visível não é clicável. */
async function hitsItself(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && element.contains(hit);
  });
}

async function worktreeIn(projectName: string, name: string): Promise<{ id: string }> {
  const workspaces = (await query(DAEMON, "workspace.list", undefined)) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  if (!workspace) throw new Error("workspace e2e não encontrado");
  const projects = (await query(DAEMON, "project.listByWorkspace", {
    workspaceId: workspace.id,
  })) as { id: string; name: string }[];
  const project = projects.find((row) => row.name === projectName);
  if (!project) throw new Error(`projeto ${projectName} não encontrado`);
  return (await call(DAEMON, "worktree.create", { projectId: project.id, name })) as { id: string };
}

/** O cabeçalho inteiro depois do glifo `◆`: agente e conta, e nada além. */
function who(account: string): RegExp {
  return new RegExp(`^◆?claude · ${account}$`);
}

/** `opus[1m]` tem colchetes, e colchete em regex é classe. */
function escaped(text: string): string {
  return text.replace(/[[\]]/g, "\\$&");
}

/**
 * Um rascunho, na conta e no modelo pedidos, com a pergunta enviada.
 *
 * A conta antes do modelo, e a ordem é a feature: escolher a conta volta o
 * modelo ao padrão **dela** (Q1a), então quem quer outro modelo o escolhe
 * depois. E o grupo de contas só existe com o Claude já escolhido — por isso
 * o primeiro clique é num modelo dele.
 */
async function openIn(page: Page, account: string, model: string, text: string): Promise<void> {
  await openNewAgent(page);
  const draft = page.getByRole("tabpanel", { name: "rascunho" });
  const pill = draft.getByRole("button", { name: /^agente e modelo:/ });

  await pill.click();
  const claude = draft.getByRole("group", { name: "Claude Code" });
  await expect(claude.getByRole("menuitemradio").first()).toBeEnabled({ timeout: 20_000 });
  await claude.getByRole("menuitemradio").first().click();

  await pill.click();
  const choice = draft
    .getByRole("group", { name: "conta do Claude Code" })
    .getByRole("menuitemradio", { name: account, exact: true });
  await expect(choice).toBeVisible();
  expect(await hitsItself(choice)).toBe(true);
  await choice.click();

  await pill.click();
  const modelChoice = draft
    .getByRole("group", { name: "Claude Code" })
    .getByRole("menuitemradio", { name: new RegExp(`^${escaped(model)}(\\s|$)`) });
  await expect(modelChoice).toBeEnabled({ timeout: 20_000 });
  await modelChoice.click();

  // O botão diz as duas escolhas — a conta só aparece quando há duas.
  await expect(pill).toHaveAccessibleName(new RegExp(`Claude Code · ${account} · ${escaped(model)}`));

  await draft.getByLabel("mensagem para o agente").fill(text);
  await draft.getByRole("button", { name: /enviar/ }).click();
}

test.afterEach(async () => {
  /*
   * A conta sai com o spec. Os specs dividem um daemon, e um Claude com duas
   * contas muda três telas que outros specs leem — a pílula ganha o grupo de
   * contas, o cabeçalho ganha `· conta`, e o `⇄ continuar` aparece. Apagar de
   * vez é o gesto que devolve o agente a uma conta só; as conversas vão junto,
   * e por isso as abertas fecham antes (o daemon recusa com uma aberta).
   */
  const work = (await claudeAccounts()).find((account) => account.label === WORK);
  if (work === undefined) return;
  const worktrees = (await query(DAEMON, "worktree.listByProject", {
    projectId: await projectId(),
  }).catch(() => [])) as { id: string }[];
  for (const worktree of worktrees) {
    const sessions = (await query(DAEMON, "session.listByScope", {
      scopeType: "worktree",
      scopeId: worktree.id,
    })) as { id: string; state: string }[];
    for (const session of sessions.filter((row) => row.state === "running")) {
      await call(DAEMON, "session.close", { id: session.id });
    }
  }
  const fresh = (await claudeAccounts()).find((account) => account.id === work.id);
  if (fresh === undefined) return;
  await call(DAEMON, "agentAccount.purge", { accountId: fresh.id, sessionCount: fresh.sessionCount });
});

async function projectId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", undefined)) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  const projects = (await query(DAEMON, "project.listByWorkspace", {
    workspaceId: workspace?.id ?? "",
  })) as { id: string; name: string }[];
  return projects.find((row) => row.name === PROJECT)?.id ?? "";
}

test("duas contas do Claude, lado a lado, cada uma gastando na sua", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACCOUNTS, PROJECT);

  // ── 1. A segunda conta, pela tela: conectar, entrar, conferida ──────────────
  await page.getByRole("button", { name: /^Configurações/ }).click();
  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();

  /*
   * Sem conta nenhuma, o gesto é **adotar** o login da máquina — ele entra como
   * `principal` —, e o `＋ conectar conta` só existe depois: a conta de
   * diretório próprio é a segunda (T18). Os specs dividem um daemon, então o
   * Claude pode já ter a dele quando este roda; os dois caminhos chegam no mesmo
   * lugar.
   */
  const adopt = page.getByRole("group", { name: "nenhuma conta do Claude Code" });
  const principal = page.getByRole("group", { name: "conta principal" });
  await expect(adopt.or(principal)).toBeVisible({ timeout: 20_000 });
  if (await adopt.isVisible()) await adopt.getByRole("button", { name: "conectar Claude Code" }).click();
  await expect(principal).toContainText("conectada", { timeout: 20_000 });

  // Um `＋` por agente que já tem conta; o painel que abre diz de qual.
  await page.getByRole("button", { name: "＋ conectar conta" }).first().click();
  const connect = page.getByRole("group", { name: "conectar conta do Claude Code" });
  await expect(connect).toBeVisible();
  await connect.getByLabel("nome da conta").fill(WORK);
  await connect.getByRole("button", { name: "conectar" }).click();

  /*
   * O login abre sozinho — a conta de assinatura nasce desconectada — e o botão
   * é o que o **adaptador** ofereceu no handshake. O fake só oferece o comando
   * exato para quem o pede em `clientCapabilities._meta`, como o `0.75.1`; foi
   * aqui que o daemon, pedindo no lugar errado, recebia `command: null`.
   */
  const login = page.getByRole("group", { name: `entrar em ${WORK}` });
  const subscription = login.getByRole("button", { name: /Claude Subscription/ });
  await expect(subscription).toBeVisible({ timeout: 20_000 });
  await subscription.click();
  // Quem confirma é a conferência depois do terminal, não a pessoa.
  await expect(login.getByText("O adaptador confirmou o login desta conta.")).toBeVisible({ timeout: 30_000 });

  const workRow = page.getByRole("group", { name: `conta ${WORK}` });
  await expect(workRow).toContainText("conectada", { timeout: 20_000 });
  // A identidade que a conferência leu, na segunda linha.
  await expect(workRow).toContainText("e2e@lumem.local");

  const accounts = await claudeAccounts();
  const work = accounts.find((account) => account.label === WORK);
  const bare = accounts.find((account) => account.bare);
  if (work === undefined || bare === undefined) throw new Error("as duas contas do Claude não existem");
  expect(bare.label).toBe("principal");
  // O diretório é do Lumem, fora do git pela regra do `_system/`.
  expect(work.configDir).toBe(join(E2E_STATE_DIR, "_system", "agents", "claude", work.id));
  await expect(page.getByRole("group", { name: `conta ${bare.label}` })).toContainText("conectada");

  // ── 2. Duas conversas, uma em cada conta ────────────────────────────────────
  // Pela API, e antes de a tela voltar: criar pela tela abriria uma conversa
  // (`worktree.start`), e a árvore só relê a lista ao carregar.
  const worktreeName = `duas-contas-${Date.now().toString(36)}`;
  await worktreeIn(PROJECT, worktreeName);
  await page.goto("/");
  await openProject(page, PROJECT);
  await page.getByLabel("árvore de projetos").getByRole("button", { name: worktreeName, exact: true }).click();

  await openIn(page, bare.label, "opus[1m]", `${ASK}? primeira conversa`);
  const first = conversation(page);
  // Sem a variável — o login desta máquina —, e não com o caminho padrão.
  await expect(first.getByText("conta: sem variável de conta")).toBeVisible({ timeout: 20_000 });
  await expect(first.getByRole("button", { name: /^Model:/ })).toContainText("opus");

  await openIn(page, WORK, "sonnet", `${ASK}? segunda conversa`);
  const second = conversation(page);
  await expect(second.getByText(`conta: ${work.configDir}`)).toBeVisible({ timeout: 20_000 });
  await expect(second.getByRole("button", { name: /^Model:/ })).toContainText("sonnet");

  // ── 3. Cada cabeçalho diz a conta dele ──────────────────────────────────────
  const tabs = page.getByRole("tab", { name: /^claude/ });
  await expect(tabs).toHaveCount(2);
  // A aba diz a conta também — senão seriam `claude` e `claude 2`.
  await expect(tabs.nth(0)).toContainText("claude · principal");
  await expect(tabs.nth(1)).toContainText(`claude · ${WORK}`);
  await expect(conversation(page).locator(".conv__who")).toHaveText(who(WORK));
  await tabs.nth(0).click();
  await expect(conversation(page).locator(".conv__who")).toHaveText(who("principal"));
  // E a primeira continua sendo a da conta sem variável: a aba certa, não só o rótulo.
  await expect(conversation(page).getByText("conta: sem variável de conta")).toBeVisible();

  // ── 4. Continuar a primeira na outra conta ──────────────────────────────────
  const origin = conversation(page);
  const gesture = origin.getByRole("button", { name: /continuar em outra conta/ });
  await expect(gesture).toBeEnabled();
  await gesture.click();
  const target = origin
    .getByRole("menu", { name: "continuar em outra conta" })
    .getByRole("menuitem", { name: `claude · ${WORK}` });
  expect(await hitsItself(target)).toBe(true);
  await target.click();

  await expect(tabs).toHaveCount(3, { timeout: 20_000 });
  const third = conversation(page);
  await expect(third.locator(".conv__who")).toHaveText(who(WORK), { timeout: 20_000 });
  // A linha de vínculo: de onde veio, e quanto levou (a pergunta e a resposta).
  // O nome da aba e do cabeçalho — `claude` —, e não o do catálogo: dentro da
  // conversa, um vocabulário só.
  await expect(third.getByText("continuação de claude · principal — levou 2 mensagens")).toBeVisible();
  // O processo novo subiu na conta de destino…
  await expect(third.getByText(`conta: ${work.configDir}`)).toBeVisible({ timeout: 20_000 });
  // …e o que ele recebeu é o corte da origem: a abertura e a pergunta de lá.
  await expect(third).toContainText("recebi: Continuação de uma conversa em claude · principal");
  await expect(third).toContainText(`${ASK}? primeira conversa`);

  // A origem ganhou a linha que aponta para a continuação, e segue viva.
  await tabs.nth(0).click();
  await expect(conversation(page).getByText(`continuada em claude · ${WORK} →`)).toBeVisible();

  // ── 5. O consumo cai na linha certa ─────────────────────────────────────────
  // Três turnos de 39,2k: um na conta sem diretório, dois no `trabalho` — a
  // segunda conversa e a continuação. Números diferentes, para a asserção saber
  // qual linha é qual.
  await page.reload();
  const panel = page.locator(".wsp");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  const twist = panel.getByRole("button", { name: `abrir a divisão por agente de ${PROJECT}` });
  await expect(twist).toBeVisible({ timeout: 20_000 });
  await twist.click();

  const group = panel.locator(".spend__group").filter({ has: page.getByText(PROJECT, { exact: true }) });
  const accountRows = group.locator(".spend__row--account");
  await expect(accountRows).toHaveCount(2);
  const rowOf = (label: string) =>
    accountRows.filter({ has: page.locator(".spend__name").getByText(label, { exact: true }) });
  await expect(rowOf(WORK)).toContainText("78,4k");
  await expect(rowOf(WORK)).toContainText("2 turnos");
  await expect(rowOf(bare.label)).toContainText("39,2k");
});
