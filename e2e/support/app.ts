import { expect, type APIRequestContext, type Page } from "@playwright/test";

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

  // O `+` do cabeçalho da lista, desde a `sidebar-actions`: o botão do rodapé
  // saiu, e o nome acessível continua o mesmo.
  await page.getByRole("button", { name: "adicionar projeto" }).click();
  await page.getByLabel("Caminho ou URL").fill(path);
  await page.getByLabel("Nome").fill(name);
  // `exact`, porque o `name` do playwright casa **substring**: sem isto,
  // "adicionar" também encontra o `+` do cabeçalho, que se chama "adicionar
  // projeto" e continua na tela atrás do véu.
  await page.getByRole("button", { name: "adicionar", exact: true }).click();
  await expect(entry).toBeVisible({ timeout: 15_000 });
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
 * Corta uma worktree pelo `+` da linha do projeto.
 *
 * O projeto é obrigatório na prática, mesmo com default: desde a
 * `sidebar-actions` a ação mora em **cada** linha, e num workspace com dois
 * projetos um locator sem nome de projeto casa dois botões. Este helper existe
 * para que "como se cria uma worktree" seja uma decisão de um lugar só.
 */
export async function createWorktree(page: Page, name: string, project = "fixture"): Promise<void> {
  const tree = page.getByLabel("árvore de projetos");
  await tree.getByRole("button", { name: `nova worktree em ${project}`, exact: true }).click();
  await page.getByLabel("Nome da worktree").fill(name);
  await page.getByRole("button", { name: "criar", exact: true }).click();
}

/**
 * Creates an agent configuration through the daemon's own API.
 *
 * There is no UI for this in the walking skeleton, and PRD §7 requires the API
 * to be able to do everything the client can — so driving it here is using the
 * contract, not going around it.
 */
export async function createAgentConfig(
  request: APIRequestContext,
  daemonUrl: string,
  input: {
    name: string;
    command: string;
    args?: string[];
    /** Omitted means `pty`, which is what every existing caller meant. */
    transport?: "pty" | "acp";
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
      ...(input.transport ? { transport: input.transport } : {}),
      ...(input.adapterVersion ? { adapterVersion: input.adapterVersion } : {}),
      ...(input.env ? { env: input.env } : {}),
    },
  });
  // A duplicate is fine: specs share one daemon and the first one to run wins.
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`não deu para criar a config de agente: ${await response.text()}`);
  }
}
