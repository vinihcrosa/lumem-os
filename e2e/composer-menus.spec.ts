import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  createAgentConfig,
  createWorktree,
  ensureProject,
  ensureWorkspace,
  openProject,
} from "./support/app.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";
import { E2E_SERVER_PORT } from "../ports.js";

/**
 * Os menus do composer — e o único teste que podia cobrar isto.
 *
 * O defeito era geometria pura: `.composer__box` tinha `overflow: hidden`, e
 * todo popover que abre para cima e passa da borda da caixa deixava de existir
 * — para o olho e para o mouse. Nenhuma bateria de componente podia pegar, e
 * não foi por falta de teste: jsdom não faz layout, então um `getByRole` acha,
 * clica e passa num elemento que no navegador está recortado.
 *
 * São três coisas, e nenhuma delas é um pixel:
 *   1. a opção do topo da lista **recebe o clique** (era a que sumia);
 *   2. uma lista longa **cabe na janela** e o fundo dela é alcançável;
 *   3. o menu de `/comandos` **existe na tela** — ele ancorava na própria caixa
 *      que recortava, então sumia inteiro, e nenhum e2e o abria.
 *
 * O adaptador é o fake com `LUMEM_FAKE_MANY_MODELS=1`: vinte modelos, zero
 * token. Dois modelos cabiam em qualquer menu, e é por caberem que o recorte
 * atravessou três features sem aparecer.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-muitos-modelos";

/** Uma worktree por teste: elas dividem daemon e diretório de estado. */
const WORKTREES = {
  top: "menu-topo",
  tall: "menu-longo",
  commands: "menu-comandos",
} as const;

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function openConversation(page: Page): Promise<void> {
  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  await expect(conversation(page)).toBeVisible({ timeout: 20_000 });
  await expect(conversation(page).getByText("sessão aberta, nada pedido ainda")).toBeVisible({
    timeout: 20_000,
  });
}

async function arrive(page: Page, worktree: string): Promise<void> {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await createWorktree(page, worktree, "repo-acp");
  await expect(page.getByRole("heading", { name: worktree })).toBeVisible({ timeout: 30_000 });
}

/**
 * O mouse chega nele?
 *
 * A pergunta que "está visível" não responde. Um elemento recortado por um
 * ancestral continua no DOM, continua com caixa, e o `toBeVisible` do playwright
 * continua satisfeito — o clique é que vai para outro lugar. Então o que se
 * pergunta é o que o navegador responderia ao mouse: quem está no ponto do meio
 * deste elemento?
 */
async function reachableByMouse(page: Page, target: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  if (box === null) return false;

  return target.evaluate(
    (element, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit !== null && (element === hit || element.contains(hit));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

test.beforeEach(async ({ request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
    env: { LUMEM_FAKE_MANY_MODELS: "1" },
  });
});

test("a opção do topo do menu recebe o clique, e não a conversa atrás dele", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await arrive(page, WORKTREES.top);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByRole("button", { name: /^Model:/ }).click();
  const menu = conv.getByRole("menu", { name: "Model" });
  await expect(menu).toBeVisible();

  /*
   * O menu sobe ACIMA da caixa, que é o que o recorte proibia. Não é uma
   * preferência de desenho: é a definição do defeito — tudo o que passava desta
   * borda era apagado.
   */
  const menuBox = await menu.boundingBox();
  const composerBox = await conv.locator(".composer__box").boundingBox();
  expect(menuBox, "o menu tem que ter caixa").not.toBeNull();
  expect(composerBox, "o composer tem que ter caixa").not.toBeNull();
  expect(
    menuBox!.y,
    "o menu não passa da borda de cima da caixa — é ali que ele era cortado",
  ).toBeLessThan(composerBox!.y);

  // E ele não sai da janela por cima, que é o defeito que o conserto poderia
  // ter trocado por outro.
  expect(menuBox!.y, "o menu saiu pela parte de cima da janela").toBeGreaterThanOrEqual(0);

  /*
   * A primeira opção da lista: a que estava mais longe da borda e portanto a
   * primeira a sumir. O clique tem que CHEGAR nela — antes ele caía na conversa.
   */
  const first = menu.getByRole("menuitemradio", { name: /^modelo-01\b/ });
  expect(
    await reachableByMouse(page, first),
    "o clique na primeira opção não chega nela",
  ).toBe(true);

  const second = menu.getByRole("menuitemradio", { name: /^modelo-02\b/ });
  await second.click();

  // E a escolha viajou: o daemon respondeu, e a pílula diz o modelo novo.
  await expect(conv.getByRole("button", { name: /^Model:/ })).toHaveText(/modelo-02/);
});

test("uma lista longa ganha teto e rolagem própria, e o fundo dela é alcançável", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await arrive(page, WORKTREES.tall);
  await openConversation(page);
  const conv = conversation(page);

  await conv.getByRole("button", { name: /^Model:/ }).click();
  const menu = conv.getByRole("menu", { name: "Model" });
  await expect(menu).toBeVisible();

  /*
   * O teto, e a prova de que ele é teto: a altura para em
   * `--size-menu-max-h`, e o conteúdo é maior que ela. Sem as duas medidas
   * juntas, um menu de altura 280 poderia ser um menu com 280 de conteúdo.
   */
  const size = await menu.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    client: element.clientHeight,
    content: element.scrollHeight,
    top: element.getBoundingClientRect().top,
  }));

  expect(size.height, "o menu passou do teto de 280px").toBeLessThanOrEqual(281);
  expect(size.content, "vinte modelos deveriam transbordar o teto").toBeGreaterThan(size.client);
  expect(size.top, "o menu saiu pela parte de cima da janela").toBeGreaterThanOrEqual(0);

  /*
   * O fundo da lista, alcançado ROLANDO O MENU — e não a página. É o que separa
   * "tem barra de rolagem" de "a barra serve para alguma coisa".
   */
  const last = menu.getByRole("menuitemradio", { name: /^modelo-do-fundo\b/ });
  await menu.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  expect(
    await reachableByMouse(page, last),
    "a última opção não recebe o clique nem depois de rolar",
  ).toBe(true);

  await last.click();
  await expect(conv.getByRole("button", { name: /^Model:/ })).toHaveText(/modelo-do-fundo/);
});

test("o menu de comandos aparece na tela, e escolher insere o comando", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await arrive(page, WORKTREES.commands);
  await openConversation(page);
  const conv = conversation(page);

  /*
   * Um turno primeiro: a lista de comandos é do agente, e ele a manda durante o
   * turno (`available_commands_update`). Sem isto não há o que abrir.
   */
  const box = conv.getByLabel("mensagem para o agente");
  await box.click();
  await page.keyboard.type("separa o parser do loader");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(conv.getByText("o parser está embutido no loader")).toBeVisible({
    timeout: 20_000,
  });

  await box.click();
  await page.keyboard.type("/ga");

  /*
   * Este é o menu que NÃO existia. Ele ancora na própria caixa do composer, em
   * `bottom: calc(100% + 6px)` — cem por cento fora dela —, então o recorte o
   * apagava inteiro. Nenhum e2e o abria, e o teste de componente é jsdom.
   */
  const menu = conv.getByRole("listbox", { name: "comandos do agente" });
  await expect(menu).toBeVisible();

  const row = menu.getByRole("option", { name: /\/gate/ });
  expect(await reachableByMouse(page, row), "o clique no comando não chega nele").toBe(true);

  await row.click();
  await expect(box).toHaveValue("/gate");
});
