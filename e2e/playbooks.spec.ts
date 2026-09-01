import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO } from "./support/fixtures.js";

/**
 * O ciclo de vida de um playbook, num navegador.
 *
 * O que só aqui se prova: que a aba existe, que ela mostra **uso** em vez de
 * escopo, e que arquivar é um gesto seu que não apaga nada. A contagem de
 * carregamento pelo `tool_call` tem teste de unidade contra o agente falso — aqui
 * ela entra pela CLI, que é a outra superfície da mesma função.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Playbook {
  path: string;
  taskClass: string;
  loads: number;
  archived: boolean;
  lifecycle: string;
}

function memory(page: Page) {
  return page.getByRole("region", { name: "Memória do workspace" });
}

async function openPlaybooks(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "abrir a coluna de arquivos" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.getByRole("tab", { name: "Memória" }).click();
  await expect(memory(page)).toBeVisible({ timeout: 15_000 });
  await memory(page).getByRole("tab", { name: "Playbooks" }).click();
}

async function workspaceId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = workspaces.find((row) => row.name === "e2e") ?? workspaces[0];
  if (found === undefined) throw new Error("nenhum workspace para pendurar o playbook");
  return found.id;
}

test("um playbook aparece com o uso, e arquivar é gesto seu", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  const ws = await workspaceId();
  // A API como setup, como no `memory.spec.ts`: escrever playbook pela tela não
  // é o que está sob teste aqui — ver o uso e arquivar é.
  await call(DAEMON, "memory.writePlaybook", {
    taskClass: "Investigar teste flaky no e2e",
    description: "o caminho que já funcionou duas vezes",
    body: "1. rode isolado\n2. rode a suíte\n3. compare o estado compartilhado",
    scope: "workspace",
    workspaceId: ws,
  });

  await openPlaybooks(page);

  const panel = memory(page);
  await expect(panel.getByText("Investigar teste flaky no e2e")).toBeVisible({ timeout: 15_000 });
  // Nunca carregado diz isso, e não uma data inventada.
  await expect(panel.getByText("nunca carregado")).toBeVisible();
  // Exato: `ativo` como substring casaria também o botão "ativos" da vista.
  await expect(panel.getByText("ativo", { exact: true })).toBeVisible();

  // Arquivar pela tela, e o daemon confirmando que saiu da vista de ativos.
  await panel.getByRole("button", { name: "arquivar" }).click();
  await expect
    .poll(async () =>
      ((await query(DAEMON, "memory.playbooks", { workspaceId: ws, archived: false })) as Playbook[])
        .length,
    )
    .toBe(0);

  // E continua existindo: arquivar não apaga.
  await panel.getByRole("button", { name: "arquivados" }).click();
  await expect(panel.getByText("Investigar teste flaky no e2e")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole("button", { name: "desarquivar" })).toBeVisible();
});
