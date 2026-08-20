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

  await page.getByRole("button", { name: "adicionar projeto" }).click();
  await page.getByLabel("Caminho do repositório").fill(path);
  await page.getByLabel("Nome (opcional)").fill(name);
  await page.getByRole("button", { name: "adicionar" }).click();
  await expect(entry).toBeVisible({ timeout: 15_000 });
}

/** Selects a project in the sidebar. */
export async function openProject(page: Page, name = "fixture"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
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
  },
): Promise<void> {
  const response = await request.post(`${daemonUrl}/trpc/agentConfig.create`, {
    data: {
      name: input.name,
      command: input.command,
      args: input.args ?? [],
      ...(input.transport ? { transport: input.transport } : {}),
      ...(input.adapterVersion ? { adapterVersion: input.adapterVersion } : {}),
    },
  });
  // A duplicate is fine: specs share one daemon and the first one to run wins.
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`não deu para criar a config de agente: ${await response.text()}`);
  }
}
