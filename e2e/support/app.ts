import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { call, query } from "./daemon.js";

/**
 * Gets past the first-access flow, PRD §5.
 *
 * Idempotent: the e2e state directory is wiped once per run, not per spec, so the
 * first spec walks the flow and the rest find the workspace already there.
 *
 * The flow replaced `FirstRun`, so this helper now walks five screens instead of
 * filling one field. It takes the short path on purpose — every step but the
 * workspace is skippable, and what these specs need from it is a workspace, not a
 * tour. `onboarding.spec.ts` is the one that walks it properly.
 */
export async function ensureWorkspace(page: Page, name = "e2e"): Promise<void> {
  const welcome = page.getByRole("button", { name: /Configurar em 5 passos/ });
  // `exact`, because getByLabel matches case-insensitive substrings by
  // default — "Workspace" would also match "Nome do workspace".
  const selector = page.getByLabel("Workspace", { exact: true });

  // The app shows "conectando ao daemon…" until the workspace list arrives.
  // Checking visibility before that resolves reads as "no flow" and then waits
  // forever for a selector that will never appear.
  await expect(welcome.or(selector).first()).toBeVisible({ timeout: 15_000 });

  if (await selector.isVisible().catch(() => false)) return;

  await welcome.click();
  // The machine step never blocks; whatever it found, the flow goes on.
  await page.getByRole("button", { name: /^Continuar/ }).click();
  // The agent step, skipped — and with it the handshake, which would spawn an
  // adapter these specs do not need.
  await page.getByRole("button", { name: "pular este passo" }).click();

  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: /Criar workspace/ }).click();

  // Project and task, skipped: the specs that want them create their own.
  await page.getByRole("button", { name: "pular este passo" }).click();
  await page.getByRole("button", { name: "pular este passo" }).click();
  await page.getByRole("button", { name: /Abrir o workspace/ }).click();

  await expect(selector).toBeVisible({ timeout: 15_000 });
}

/**
 * Registers the fixture repository, if it is not registered yet.
 *
 * Idempotent for the same reason `ensureWorkspace` is: the state directory is
 * wiped once per run and the specs share what the first one created.
 */
export async function ensureProject(page: Page, path: string, name = "fixture"): Promise<void> {
  // `exact`, because the agent buttons in the main area say "novo <config>"
  // and a substring match would find those too.
  const entry = page.getByRole("button", { name, exact: true });

  /*
   * Waited for, not merely checked.
   *
   * `isVisible` answers about *this* frame, and the project list arrives one
   * round trip after the sidebar does. Reading it too early answers "no project"
   * for a project that exists, and the duplicate that follows is refused by the
   * daemon — a failure that looks like a product bug and is not one.
   */
  const present = await entry
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (present) return;

  // O `+` do cabeçalho `Projetos`, desde a `sidebar-actions`. Ele mantém o
  // nome acessível que tinha no rodapé, e é por isso que este clique não mudou:
  // o que mudou foi de onde ele sai.
  await page.getByRole("button", { name: "adicionar projeto" }).click();

  /*
   * Escopado no diálogo, e isso é obrigatório desde a `sidebar-actions`.
   *
   * O gatilho **não some mais** quando o formulário abre: ele é o `+` do
   * cabeçalho da árvore, e continua na tela por trás do véu. `adicionar` sem
   * escopo casa com ele (`adicionar projeto`) e com o submit — dois elementos,
   * e o Playwright recusa. Na versão antiga o botão do rodapé virava o
   * formulário, então só existia um por vez.
   */
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Caminho ou URL").fill(path);
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByRole("button", { name: "adicionar" }).click();
  await expect(entry).toBeVisible({ timeout: 15_000 });
}

/**
 * Cria uma worktree pelo `+` da linha do projeto — `sidebar-actions` F1.3.
 *
 * Aqui, e não espalhado por quinze specs: a ação já mudou de lugar uma vez
 * (saiu do `LocalPanel`, Q4), e o próximo movimento dela tem que mexer num
 * arquivo só. O diálogo é modal e **já sabe o projeto**, então não há seletor
 * dentro dele — o nome no clique é o que escolhe.
 *
 * Desde a `033` F4, criar worktree é compor o primeiro prompt: não há mais um
 * campo de nome sozinho e um `criar`. O gesto agora é o `NewWorktreeComposer`
 * — escrever o que se quer, abrir o `…` para escolher o nome (em vez de
 * deixá-lo derivado do prompt, o que faria o nome pedido por quem chama nunca
 * bater com o que a worktree recebe) e `Create`. O prompt é o próprio `name`:
 * nenhum spec que usa este helper lê o texto da conversa, então gastar dois
 * parâmetros só criaria uma segunda forma de errar.
 */
export async function createWorktree(
  page: Page,
  name: string,
  project = "fixture",
): Promise<void> {
  await page.getByRole("button", { name: `nova worktree em ${project}` }).click();
  const dialog = page.getByRole("dialog", { name: "Nova worktree" });
  await dialog.getByLabel("No que você quer trabalhar?").fill(name);
  await dialog.getByRole("button", { name: "nome da worktree" }).click();
  // `getByRole("textbox", …)`, e não `getByLabel`: o botão que abre o campo
  // tem o mesmo `aria-label` que o rótulo do campo, e `getByLabel` casa os
  // dois (substring, sem `exact`).
  await dialog.getByRole("textbox", { name: "Nome da worktree" }).fill(name);
  await dialog.getByRole("button", { name: /^Create/ }).click();

  /*
   * `worktree.start` (`033` T12) always opens a first agent session now —
   * creating a worktree *is* composing the first prompt. Every caller of this
   * helper predates that: some read the checkout's own tab right after
   * calling it (which the arrived session tab would hide), and one asserts an
   * *exact* token count for a turn of its own. So the session this creates is
   * closed here, once, before this returns — which is also before anyone
   * could answer its permission request, the one thing standing between it
   * and a `usage_update`. Closing takes its tab with it and hands the
   * checkout tab back its selection (`ScopePanel`'s own rule: the last
   * session tab going away is where selection returns to).
   *
   * A refusal (an existing branch, a repository with no commit) never spawns
   * a session, so the race below is what lets this return to that caller
   * exactly as before — no tab to close, no time spent looking for one.
  */
  const conversation = page.locator("[role=tabpanel]:not([hidden]) .conv");
  const refusal = page.getByRole("dialog").getByRole("alert");
  await expect(conversation.or(refusal).first()).toBeVisible({ timeout: 30_000 });
  if (!(await conversation.isVisible().catch(() => false))) return;
  const activeTab = page.locator(".tabs-bar .tab-item--active");
  await activeTab.getByRole("button", { name: /^fechar / }).click({ timeout: 15_000 });
}

/**
 * Abre um rascunho de agente pelo `＋ nova sessão` da faixa de abas (`033` F5).
 *
 * Não cria processo nenhum no daemon — a aba rascunho só vira sessão no
 * primeiro envio (Q4). Quem precisa de uma sessão de verdade escreve e manda,
 * depois de chamar isto.
 */
export async function openNewAgent(page: Page): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: "novo agente" }).click();
}

/**
 * Opens a configured ACP session for specs whose subject is the conversation,
 * not the new draft gesture. Drafts are covered through `openNewAgent` and the
 * feature e2e; this helper keeps older transcript and permission scenarios
 * focused by creating their fixture session through the public router.
 */
export async function openConfiguredAgent(
  page: Page,
  daemonUrl: string,
  agentName: string,
  worktreeName?: string,
): Promise<void> {
  const workspaces = (await query(daemonUrl, "workspace.list", undefined)) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.name === "e2e");
  if (!workspace) throw new Error("workspace e2e não encontrado");

  const projects = (await query(daemonUrl, "project.listByWorkspace", {
    workspaceId: workspace.id,
  })) as { id: string; name: string; path: string }[];
  const scopeLabel = await page.locator(".tabs-bar").getAttribute("aria-label");
  const scopePath = scopeLabel?.replace(/^sessões de /, "");
  let scope: { scopeType: "project" | "worktree"; scopeId: string } | undefined;
  let scopeName: string | undefined;
  for (const project of projects) {
    const worktrees = (await query(daemonUrl, "worktree.listByProject", {
      projectId: project.id,
    })) as { id: string; name: string; path: string }[];
    const worktree = worktrees.find((row) =>
      worktreeName !== undefined ? row.name === worktreeName : scopePath === row.path,
    );
    if (worktree) {
      scope = { scopeType: "worktree", scopeId: worktree.id };
      scopeName = worktree.name;
      break;
    }

    if (worktreeName === undefined && scopePath === project.path) {
      scope = { scopeType: "project", scopeId: project.id };
      scopeName = project.name;
      break;
    }
  }
  if (!scope) throw new Error(`escopo ativo não encontrado${worktreeName ? `: ${worktreeName}` : ""}`);

  const configs = (await query(daemonUrl, "agentConfig.list", undefined)) as {
    id: string;
    name: string;
  }[];
  const config = configs.find((row) => row.name === agentName);
  if (!config) throw new Error(`configuração ${agentName} não encontrada`);

  await call(daemonUrl, "session.createAgent", {
    ...scope,
    agentConfigId: config.id,
  });
  const tab = page.getByRole("tab", { name: agentName, exact: true });
  const appeared = await tab
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  // This helper creates the session through the public router, outside React's
  // mutation cache. If the live event was missed while the page was reconnecting,
  // a reload reconciles the tab strip from the daemon's session list.
  if (!appeared) {
    await page.reload();
    if (scopeName !== undefined) {
      await page
        .getByLabel("árvore de projetos")
        .getByRole("button", { name: scopeName, exact: true })
        .click();
    }
    await expect(tab).toBeVisible({ timeout: 20_000 });
  }
  await tab.click();
  await expect(page.locator("[role=tabpanel]:not([hidden]) .conv")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator("[role=tabpanel]:not([hidden]) .conv").getByText("sessão aberta, nada pedido ainda"),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Selects a project **in the sidebar**.
 *
 * Scoped to the tree, and that is not decoration: since the breadcrumb started
 * navigating (`workspace-screen`, W7), the project's name is a button in two
 * places — the tree row and the crumb segment of the worktree screen. Both go to
 * the same place, and an unscoped locator matches two elements and fails.
 */
export async function openProject(page: Page, name = "fixture"): Promise<void> {
  // `getByLabel` e não `getByRole("tree")`: a árvore da sidebar é um `div` com
  // `aria-label` e sem `role` — inconsistência com a árvore de arquivos, que é
  // `role="tree"`. Anotada no backlog; consertar aqui exigiria `treeitem` nas
  // linhas, e árvore sem itens é pior que div rotulada.
  const tree = page.getByLabel("árvore de projetos");
  await tree.getByRole("button", { name, exact: true }).click();
}

/**
 * Creates an agent configuration through the daemon's own API.
 *
 * There is no UI for this in the walking skeleton, and PRD §7 requires the API
 * to be able to do everything the client can — so driving it here is using the
 * contract, not going around it.
 *
 * No `transport` since the `033`: every configuration is an ACP adapter
 * (`agentConfig.create` dropped the field, T4), and `adapterVersion` is what
 * the daemon now requires instead. A config named exactly a catalog id
 * (`claude`, `codex`) is the one way to reach the composer's pill from here —
 * `configForAdapter` finds it **by name** and reuses its `env`, which is how a
 * spec asks the fake for a variant (many models, no modes, a profile) without
 * a menu that lists configurations one by one existing any more (`033` F1.6).
 */
export async function createAgentConfig(
  request: APIRequestContext,
  daemonUrl: string,
  input: {
    name: string;
    command: string;
    args?: string[];
    adapterVersion?: string;
    /** O ambiente do adaptador. O fake usa isto para mudar o que ele relata. */
    env?: Record<string, string>;
  },
): Promise<void> {
  const response = await request.post(`${daemonUrl}/trpc/agentConfig.create`, {
    data: {
      name: input.name,
      command: input.command,
      args: input.args ?? [],
      adapterVersion: input.adapterVersion ?? "0.0.0-fake",
      ...(input.env ? { env: input.env } : {}),
    },
  });
  // A duplicate is fine: specs share one daemon and the first one to run wins.
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`não deu para criar a config de agente: ${await response.text()}`);
  }
}
