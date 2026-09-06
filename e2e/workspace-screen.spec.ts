import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { createAgentConfig, createWorktree, ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * A tela do workspace — e o caminho que originou a feature.
 *
 * A pergunta era: *"tem uma memória do workspace? como eu acesso?"* A resposta era
 * "só através de um projeto", porque o botão que abre o painel direito só aparece
 * com um checkout selecionado. Este spec é o que prova que a resposta mudou.
 *
 * O que só um navegador responde: que o painel central **é** a tela agora — antes
 * ele era a frase "selecione uma worktree" — e que a memória de workspace está
 * revisável de lá.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Workspace {
  id: string;
  name: string;
}

/** O painel do workspace aparece quando nenhuma worktree está selecionada. */
function panel(page: Page) {
  return page.locator(".wsp");
}

async function workspaceId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as Workspace[];
  const found = workspaces.find((row) => row.name === "e2e") ?? workspaces[0];
  if (found === undefined) throw new Error("nenhum workspace");
  return found.id;
}

test("o workspace tem tela, e a memória dele não precisa de projeto aberto", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");

  const ws = await workspaceId();
  // Escrita pela API porque escrever memória não é o que está sob teste — ver e
  // revisar é. Mesma escolha do `memory.spec.ts`.
  await call(DAEMON, "memory.write", {
    type: "process",
    name: "Release deste workspace",
    description: "tag assinada, sempre",
    body: "Release sai de tag assinada.",
    scope: "workspace",
    workspaceId: ws,
    actor: "human",
  });

  // Sem selecionar worktree nenhuma: é exatamente o estado em que o produto só
  // sabia dizer "selecione uma worktree".
  await page.reload();
  await expect(panel(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("selecione uma worktree")).toHaveCount(0);

  // A memória do workspace, alcançável sem painel direito e sem checkout.
  await expect(panel(page).getByText("Release deste workspace")).toBeVisible({ timeout: 20_000 });
  // E o grupo `projeto` não existe aqui: o escopo é o do workspace.
  await expect(panel(page).getByText("projeto", { exact: true })).toHaveCount(0);

  // O consumo tem lugar, e a janela de tempo é uma pergunta nova ao daemon.
  await expect(panel(page).getByRole("group", { name: "Janela de tempo do consumo" })).toBeVisible();
  await panel(page).getByRole("button", { name: "1m", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "1m", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Remover está fechado, com o motivo — o banco recusa, e a tela diz antes.
  await expect(panel(page).getByRole("button", { name: "remover workspace" })).toBeDisabled();
  await expect(panel(page).getByText(/projeto dentro|projetos dentro/)).toBeVisible();
});

test("renomear o workspace troca o nome nos dois lugares", async ({ page }) => {
  /*
   * **Workspace próprio**, criado e removido por este teste.
   *
   * A primeira versão renomeava o `e2e` compartilhado e devolvia o nome no fim —
   * e uma falha no meio deixaria todos os specs seguintes procurando um workspace
   * que não existe mais com aquele nome. Um workspace descartável custa duas
   * chamadas e não tem esse jeito de quebrar.
   */
  const created = (await call(DAEMON, "workspace.create", { name: "tela-renomear" })) as Workspace;

  try {
    await page.goto("/");
    await ensureWorkspace(page);
    await page.getByLabel("Workspace", { exact: true }).selectOption({ label: "tela-renomear" });
    await expect(panel(page)).toBeVisible({ timeout: 20_000 });
    // Vazio: é o caso em que, antes desta feature, **nada** era alcançável.
    await expect(panel(page).getByText("Nenhum projeto ainda")).toBeVisible();

    await panel(page).getByRole("button", { name: "renomear" }).click();
    await panel(page).getByLabel("Nome do workspace").fill("tela-renomeada");
    await panel(page).getByRole("button", { name: "salvar" }).click();

    // Na tela e no seletor do topo: um nome novo em dois lugares diferentes é o
    // começo de uma tela discordando de si mesma.
    await expect(panel(page).getByRole("heading", { name: "tela-renomeada" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByLabel("Workspace", { exact: true }).locator("option", { hasText: "tela-renomeada" }),
    ).toHaveCount(1);

    // Workspace vazio pode ser removido, e o botão diz isso.
    await expect(panel(page).getByRole("button", { name: "remover workspace" })).toBeEnabled();
  } finally {
    await call(DAEMON, "workspace.remove", { id: created.id }).catch(() => undefined);
  }
});

test("um turno de verdade, e o consumo dele na tela do projeto que o gastou", async ({
  page,
  request,
}) => {
  /*
   * A prova que atravessa tudo: daemon, protocolo e tela.
   *
   * Os testes de unidade provam que o delta é calculado, que a soma agrupa e que
   * a linha desenha. Nenhum deles gasta um token. Aqui um turno **de verdade**
   * roda contra o agente falso — que reporta `usage_update` como um adaptador
   * reporta —, e o número aparece na tela do projeto que o gastou.
   *
   * A worktree é **desta prova**, e é isso que faz o número ser exato: outros
   * specs rodam turnos no mesmo projeto, então o total dele acumula; a worktree
   * criada aqui só recebeu o meu turno.
   */
  const WORKTREE = "consumo-de-um-turno";
  await createAgentConfig(request, DAEMON, {
    name: "acp-falso",
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });

  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, WORKTREE, "repo-acp");
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  // O turno. O agente falso pede permissão no meio, como um de verdade.
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: /^acp-falso\b/ }).click();
  const conv = page.locator("[role=tabpanel]:not([hidden]) .conv");
  await expect(conv).toBeVisible({ timeout: 20_000 });
  await expect(conv.getByText("sessão aberta, nada pedido ainda")).toBeVisible({ timeout: 20_000 });

  await conv.getByLabel("mensagem para o agente").fill("arruma o frontmatter vazio");
  await conv.getByRole("button", { name: /enviar/ }).click();
  await conv.getByRole("button", { name: /permitir uma vez/ }).click();
  // O rodapé de consumo aparecendo é o sinal de que o `usage_update` chegou.
  await expect(conv.getByText(/39,2k/)).toBeVisible({ timeout: 30_000 });

  // A tela do projeto: o consumo por worktree, com a minha worktree nele.
  await openProject(page, "repo-acp");
  const row = page.locator(".spend__row", { hasText: WORKTREE });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // Exato, porque só o meu turno rodou nesta worktree.
  await expect(row.locator(".spend__tok")).toHaveText("39,2k");
  await expect(row.locator(".spend__cost")).toContainText("US$ 0,2354");
  await expect(row.locator(".spend__turns")).toHaveText("1 turnos");

  // E o projeto que a gastou aparece na tela do workspace com o total dele — que
  // acumula os turnos dos outros specs, então a asserção é "não é zero".
  await page.reload();
  await expect(panel(page)).toBeVisible({ timeout: 20_000 });
  const projectRow = panel(page).locator(".spend__row", { hasText: "repo-acp" });
  await expect(projectRow).toBeVisible();
  await expect(projectRow.locator(".spend__tok")).not.toHaveText("0");
});

test("entrar num projeto deixou de ser um beco: o breadcrumb volta (W7)", async ({ page }) => {
  /*
   * O beco era literal: o painel do workspace só aparece com nada selecionado, e
   * nada desfazia a seleção — a única saída era trocar de workspace e voltar.
   *
   * Em navegador porque é navegação: o teste de componente prova o `onClick`, e o
   * que só aqui se vê é a tela **trocando** de verdade, com o daemon respondendo
   * as duas telas.
   */
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  // Dentro do projeto: o painel do workspace saiu de cena.
  await expect(page.getByRole("heading", { name: "local" })).toBeVisible({ timeout: 20_000 });
  await expect(panel(page)).toHaveCount(0);

  // O nome do workspace no breadcrumb — que era texto morto — é a saída.
  const crumb = page.locator("[role=tabpanel]:not([hidden]) .crumb, .crumb").first();
  await crumb.getByRole("button", { name: "e2e" }).click();

  await expect(panel(page)).toBeVisible({ timeout: 20_000 });
  await expect(panel(page).getByRole("heading", { name: "e2e" })).toBeVisible();
});
