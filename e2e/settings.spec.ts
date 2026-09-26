import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { ensureWorkspace } from "./support/app.js";
import { query } from "./support/daemon.js";

/**
 * A tela de configurações, ponta a ponta (`030-settings` T15).
 *
 * **O que só o navegador prova.** Todo teste de componente deste repositório é
 * jsdom, e jsdom **tem `history`** — `pushState`, `replaceState` e `popstate`
 * funcionam lá. O que ele não tem é barra de endereço, `F5` e layout, então um
 * roteador que nunca sobreviveu a um reload passa verde a tarde inteira. Estes
 * casos são exatamente os que aquela suíte não consegue fazer.
 *
 * **Zero token e zero rede.** Nada aqui sobe adaptador: a tela lê tetos do
 * SQLite e escreve neles.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Workspace {
  id: string;
  name: string;
  budgetCostPerTask: number | null;
}

async function workspace(): Promise<Workspace> {
  const rows = (await query(DAEMON, "workspace.list", {})) as Workspace[];
  const found = rows.find((row) => row.name === "e2e") ?? rows[0];
  if (found === undefined) throw new Error("nenhum workspace para configurar");
  return found;
}

/** O campo de um teto, pelo nome que o leitor de tela ouve. */
function cap(page: Page, label: string) {
  return page.getByLabel(label);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Configurações/ }).click();
  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();
}

test("/settings aberto direto abre a tela, sem piscar o Home", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);

  /*
   * A piscada é o defeito que `useSyncExternalStore` evita, e ela dura um
   * quadro: com estado mais efeito, o primeiro render desenha o Home e o
   * segundo troca. Perguntar *"o Home apareceu em algum momento?"* é a única
   * forma de vê-la — `toBeVisible` no fim já é tarde.
   */
  await page.goto("/settings");

  const titulo = page.getByRole("heading", { name: "Configurações", level: 1 });
  await expect(titulo).toBeVisible({ timeout: 15_000 });
  // O quadro e a tela do workspace são as outras duas; nenhuma delas apareceu.
  await expect(page.getByRole("heading", { name: "Quadro de tarefas" })).toHaveCount(0);
});

test("F5 em /settings volta em /settings", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await openSettings(page);
  expect(new URL(page.url()).pathname).toBe("/settings");

  await page.reload();

  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  expect(new URL(page.url()).pathname).toBe("/settings");
});

test("o botão voltar sai de /settings para onde se estava", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await openSettings(page);

  await page.goBack();

  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toHaveCount(0);
});

/**
 * O caminho que **nenhum código da web percorreu até esta feature**.
 *
 * `workspace.setBudget` existia, validado e testado, sem nenhum chamador —
 * os três tetos eram somente-leitura no produto inteiro.
 */
test("escrever um teto grava, e o valor sobrevive ao reload", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await openSettings(page);

  const campo = cap(page, "teto por tarefa");
  await campo.click();
  await campo.fill("3,00");
  await campo.blur();

  await expect(page.getByText("salvo")).toBeVisible({ timeout: 15_000 });
  // O daemon, e não a tela: o que prova a escrita é o outro lado da rede.
  await expect.poll(async () => (await workspace()).budgetCostPerTask).toBe(3);

  await page.reload();
  await expect(cap(page, "teto por tarefa")).toHaveValue("3,00", { timeout: 15_000 });
});

/**
 * `null` é *sem teto* e `0` é *bloqueia tudo*, e eles são diferentes no banco.
 * Uma tela que os colapsasse desfaria a distinção onde ela precisa ser lida.
 */
test("apagar o campo grava null, e a tela lê sem teto", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await openSettings(page);

  async function capPorDia(): Promise<number | null | undefined> {
    const rows = (await query(DAEMON, "workspace.list", {})) as {
      name: string;
      budgetCostPerDay: number | null;
    }[];
    return (rows.find((row) => row.name === "e2e") ?? rows[0])?.budgetCostPerDay;
  }

  const campo = cap(page, "teto por dia");
  await campo.click();
  await campo.fill("12,00");
  await campo.blur();

  /*
   * O teto **precisa** existir antes de ser apagado, e a asserção é do daemon.
   *
   * Sem ela o caso é verde de graça: um workspace que nunca teve teto já tem
   * `null`, e apagar um campo vazio não prova nada. Descoberto mutando a
   * escrita para um no-op — este caso continuou passando, e o de cima morreu
   * sozinho.
   */
  await expect.poll(capPorDia).toBe(12);

  await campo.click();
  await campo.fill("");
  await campo.blur();

  await expect(campo).toHaveAttribute("placeholder", "sem teto");
  await expect.poll(capPorDia).toBeNull();
});

/**
 * A entrada é **uma**, e ela é clicável de verdade.
 *
 * `document.elementFromPoint` e não `toBeVisible`: contra um elemento recortado
 * por ancestral, o segundo fica verde — é a lição que a
 * [`023`](../docs/features/023-composer-menus/prd.md) pagou com um menu
 * invisível por três features.
 */
test("a entrada da tela é uma só, e o clique chega nela", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);

  const entradas = page.getByRole("button", { name: /^Configurações/ });
  await expect(entradas).toHaveCount(1);

  const caixa = await entradas.first().boundingBox();
  expect(caixa).not.toBeNull();

  const acertou = await page.evaluate(
    ({ x, y }) => {
      const alvo = document.elementFromPoint(x, y);
      return alvo?.closest("button")?.textContent?.includes("Configurações") ?? false;
    },
    { x: (caixa?.x ?? 0) + (caixa?.width ?? 0) / 2, y: (caixa?.y ?? 0) + (caixa?.height ?? 0) / 2 },
  );

  expect(acertou).toBe(true);
});

/**
 * O que a fase 3 tirou, provado do lado de fora: a lista de tarefas não tem mais
 * controle de configuração nenhum.
 */
test("a lista de tarefas ficou sem os controles", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);

  await expect(page.getByRole("button", { name: "assistido" })).toHaveCount(0);
  await expect(page.getByText("LUMEM_TASKS_BUDGET")).toHaveCount(0);
});
