import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import {
  ensureProject,
  ensureWorkspace,
  openConfiguredAgent,
  openNewAgent,
  openProject,
} from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO_ACCOUNTS } from "./support/fixtures.js";

/**
 * A conta bateu no limite, de ponta a ponta (`028` T17, `034` Q12).
 *
 * O fake repete o que o `claude-agent-acp@0.75.1` mandou em 2026-09-28, quando a
 * conta `technomar-ted` estourou o limite semanal: o texto do limite como
 * mensagem do agente, um `usage_update` zerado, o `session/prompt` recusado com
 * `-32603` e `data.errorKind: "rate_limit"`, e nenhum `turn_end`. O que se prova
 * aqui é o que a tela faz com isso: diz **qual conta** parou, fecha o turno, e
 * oferece — só oferece — continuar noutra.
 *
 * A segunda conta é de **chave**, pela API: ela nasce conectada, sem login, e o
 * que este spec mede não é conectar conta — isso é o `agent-accounts.spec.ts`.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const PROJECT = "repo-accounts";
const SPARE = "reserva-cota";
/**
 * A frase que o fake reconhece no começo, e a que ele reconhece em qualquer
 * lugar: a primeira estoura a cota; a segunda viaja no corte da continuação e faz
 * a conta nova dizer de onde subiu.
 */
const ASK = "estoure a cota — em que conta você está?";

interface Account {
  id: string;
  label: string;
  bare: boolean;
  configDir: string | null;
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

async function projectId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", undefined)) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  const projects = (await query(DAEMON, "project.listByWorkspace", {
    workspaceId: workspace?.id ?? "",
  })) as { id: string; name: string }[];
  return projects.find((row) => row.name === PROJECT)?.id ?? "";
}

test.afterEach(async () => {
  /*
   * A conta sai com o spec, pelo mesmo motivo do `agent-accounts`: os specs
   * dividem um daemon, e um Claude com duas contas muda a pílula, o cabeçalho e
   * o `⇄ continuar` de quem roda depois. As conversas abertas fecham antes — o
   * daemon recusa apagar de vez com uma aberta.
   */
  const spare = (await claudeAccounts()).find((account) => account.label === SPARE);
  if (spare === undefined) return;
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
  const fresh = (await claudeAccounts()).find((account) => account.id === spare.id);
  if (fresh === undefined) return;
  await call(DAEMON, "agentAccount.purge", { accountId: fresh.id, sessionCount: fresh.sessionCount });
});

test("a conta bateu no limite: a conversa diz qual, e oferece continuar noutra", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACCOUNTS, PROJECT);

  // A conta que já existia é a que estoura; a de chave é para onde se continua.
  await call(DAEMON, "agentAccount.connect", { adapterId: "claude", label: SPARE, kind: "api_key", apiKey: "sk-e2e" });
  const accounts = await claudeAccounts();
  const bare = accounts.find((account) => account.bare);
  const spare = accounts.find((account) => account.label === SPARE);
  if (bare === undefined || spare === undefined) throw new Error("as duas contas do Claude não existem");

  const worktreeName = `cota-${Date.now().toString(36)}`;
  await call(DAEMON, "worktree.create", { projectId: await projectId(), name: worktreeName });
  await page.goto("/");
  await openProject(page, PROJECT);
  await page.getByLabel("árvore de projetos").getByRole("button", { name: worktreeName, exact: true }).click();

  // ── 1. Uma conversa na conta que vai estourar ───────────────────────────────
  // Com duas contas, a pílula oferece as duas: a escolha é explícita, para o
  // caso não depender de qual é a padrão quando este spec roda.
  await openNewAgent(page);
  const draft = page.getByRole("tabpanel", { name: "rascunho" });
  const pill = draft.getByRole("button", { name: /^agente e modelo:/ });
  await pill.click();
  const claude = draft.getByRole("group", { name: "Claude Code" });
  await expect(claude.getByRole("menuitemradio").first()).toBeEnabled({ timeout: 20_000 });
  await claude.getByRole("menuitemradio").first().click();
  await pill.click();
  await draft
    .getByRole("group", { name: "conta do Claude Code" })
    .getByRole("menuitemradio", { name: bare.label, exact: true })
    .click();
  await draft.getByLabel("mensagem para o agente").fill(ASK);
  await draft.getByRole("button", { name: /enviar/ }).click();

  // ── 2. A recusa: a conta nomeada, o texto do adaptador, e o turno fechado ────
  const origin = conversation(page);
  const line = origin.locator(".banner--warning").filter({ hasText: "bateu no limite" });
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect(line).toContainText(`a conta ${bare.label} bateu no limite do Claude Code`);
  await expect(line).toContainText("resets 7pm (America/Sao_Paulo)");
  // O adaptador não manda `turn_end` numa recusa: sem o fecho do Lumem, o botão
  // de interromper ficaria aceso sobre um turno morto.
  await expect(origin.getByRole("button", { name: /interromper/ })).toHaveCount(0);
  // E nenhum aviso vermelho por cima da linha que já disse a mesma coisa.
  await expect(origin.locator(".banner--danger")).toHaveCount(0);
  // Nada troca de conta sozinho (Q4 da `034`): uma aba, a de origem.
  const tabs = page.getByRole("tab", { name: /^claude/ });
  await expect(tabs).toHaveCount(1);

  // ── 3. Continuar noutra conta, pela própria linha ───────────────────────────
  const offer = line.getByRole("button", { name: /continuar em outra conta/ });
  await expect(offer).toBeEnabled({ timeout: 20_000 });
  await offer.click();
  const target = line
    .getByRole("menu", { name: "continuar em outra conta" })
    .getByRole("menuitem", { name: `claude · ${SPARE}` });
  expect(await hitsItself(target)).toBe(true);
  await target.click();

  await expect(tabs).toHaveCount(2, { timeout: 20_000 });
  const next = conversation(page);
  // O processo novo subiu na conta de destino — quem diz é o fake, lendo o
  // próprio ambiente —, e com o corte da origem, onde a recusa ficou para trás.
  await expect(next.getByText(`conta: ${spare.configDir}`)).toBeVisible({ timeout: 20_000 });
  await expect(next.locator(".banner--warning").filter({ hasText: "bateu no limite" })).toHaveCount(0);
});

test("um turno que falha sem ser cota fecha, diz por quê, e a conversa continua", async ({ page }) => {
  /*
   * A falha comum, irmã da cota: `-32603` sem `errorKind`. Antes do `turn_failed`,
   * a conversa ficava em `streaming` para sempre — o botão de interromper aceso,
   * um `internal error` por cima —, e a única saída era fechar a aba.
   */
  test.setTimeout(90_000);
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACCOUNTS, PROJECT);
  const worktreeName = `falha-${Date.now().toString(36)}`;
  await call(DAEMON, "worktree.create", { projectId: await projectId(), name: worktreeName });
  await page.goto("/");
  await openProject(page, PROJECT);
  await page.getByLabel("árvore de projetos").getByRole("button", { name: worktreeName, exact: true }).click();
  await openConfiguredAgent(page, DAEMON, "claude", worktreeName);

  const talk = conversation(page);
  const box = talk.getByLabel("mensagem para o agente");
  await box.fill("falhe o turno, por favor");
  await talk.getByRole("button", { name: /enviar/ }).click();

  const line = talk.locator(".banner--danger").filter({ hasText: "o turno falhou" });
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect(line).toContainText("Internal error: o fake desistiu do turno");
  await expect(talk.getByRole("button", { name: /interromper/ })).toHaveCount(0);
  // Uma linha só: nenhum `internal error` genérico repetindo a mesma coisa.
  await expect(talk.locator(".banner--danger")).toHaveCount(1);

  // O composer aceita a próxima, e o turno seguinte chega ao fim.
  await box.fill("em que conta você está?");
  await talk.getByRole("button", { name: /enviar/ }).click();
  await expect(talk.getByText(/recebi: em que conta você está\?/)).toBeVisible({ timeout: 20_000 });
});
