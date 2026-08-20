import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO } from "./support/fixtures.js";

/**
 * A memória do workspace, na tela.
 *
 * O buraco que a integração das duas pilhas revelou: a feature tem ~357 testes de
 * unidade e integração e **nenhum** e2e. A tela dela é a terceira aba do painel
 * direito, e nada a percorria num navegador — que é justamente onde este
 * repositório já perdeu dois defeitos que nenhum teste de componente pegaria,
 * porque jsdom mede tudo como zero.
 *
 * A API aparece como **setup**, e é a única forma honesta: uma proposta nasce de
 * um ator não-humano escrevendo para cima (Q27), e não existe gesto de tela que
 * produza uma. O que está sob teste é a revisão — ver, aprovar, e o resultado
 * aparecer.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Proposal {
  id: string;
  name: string;
  status: string;
}

function memory(page: Page) {
  return page.getByRole("region", { name: "Memória do workspace" });
}

/** Abre o painel direito na aba da memória. */
async function openMemory(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /arquivos/ });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.getByRole("tab", { name: "Memória" }).click();
  await expect(memory(page)).toBeVisible({ timeout: 15_000 });
}

async function workspaceId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = workspaces.find((row) => row.name === "e2e") ?? workspaces[0];
  if (found === undefined) throw new Error("nenhum workspace para pendurar a memória");
  return found.id;
}

test("uma memória escrita pelo daemon aparece na tela", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  const ws = await workspaceId();
  // Ator humano em escopo de workspace: grava direto, sem passar pela inbox.
  await call(DAEMON, "memory.write", {
    type: "process",
    name: "PR só com o portão verde",
    description: "nenhum PR sobe com o gate vermelho",
    body: "O gate que vale é o que a task declara.",
    scope: "workspace",
    workspaceId: ws,
    actor: "human",
  });

  await openMemory(page);

  // O tipo e o nome, que é o que a linha da lista tem para dizer.
  await expect(memory(page).getByText("PR só com o portão verde")).toBeVisible({ timeout: 15_000 });
  await expect(memory(page).getByText("process").first()).toBeVisible();
});

test("uma proposta de agente é revisada e aprovada pela tela", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  const ws = await workspaceId();
  /*
   * Escrever para cima, como agente. É o desvio da Q27: ator não-humano em
   * escopo de workspace não grava — propõe. A proposta é o que a tela revisa, e
   * não existe gesto de tela que a crie, então ela entra pela API.
   */
  await call(DAEMON, "memory.write", {
    type: "domain",
    name: "Carrinho expira em 30 minutos",
    description: "abandonado, expira e devolve estoque",
    body: "Um job varre a cada 5 minutos. Expirar devolve estoque.",
    scope: "workspace",
    workspaceId: ws,
    actor: "agent",
  });

  const pending = (await query(DAEMON, "memory.proposals", { status: "pending" })) as Proposal[];
  expect(pending.some((row) => row.name === "Carrinho expira em 30 minutos")).toBe(true);

  await openMemory(page);
  await memory(page).getByRole("tab", { name: "Propostas" }).click();

  // O corpo inteiro, na tela: aprovar é gravar e commitar, e gravar o que a
  // revisão não leu não é revisão.
  await expect(memory(page).getByText("Carrinho expira em 30 minutos")).toBeVisible({
    timeout: 15_000,
  });
  await expect(memory(page).getByText(/devolve estoque/).first()).toBeVisible();

  await memory(page).getByRole("button", { name: "Aprovar", exact: true }).click();

  // O que prova a aprovação é o daemon, não a tela: a proposta sai de pendente e
  // a memória passa a existir no acervo.
  await expect
    .poll(
      async () => {
        const rows = (await query(DAEMON, "memory.proposals", { status: "pending" })) as Proposal[];
        return rows.some((row) => row.name === "Carrinho expira em 30 minutos");
      },
      { timeout: 20_000 },
    )
    .toBe(false);

  await memory(page).getByRole("tab", { name: "Memória" }).click();
  await expect(memory(page).getByText("Carrinho expira em 30 minutos")).toBeVisible({
    timeout: 15_000,
  });
});
