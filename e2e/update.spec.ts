import { expect, test } from "@playwright/test";

import { NEW_VERSION, OLD_VERSION, createUpdateWorld, type UpdateWorld } from "./support/update-world.js";

/**
 * Atualizar é um gesto só, e a página volta inteira (`038`, C41).
 *
 * O defeito que isto existe para não deixar voltar foi **medido**, não suposto
 * (experimento 1 da fase 0): instalar por cima com o daemon de pé faz `/` servir o
 * `index.html` novo apontando para um asset que responde 404 — o `@fastify/static`
 * registrou uma rota por arquivo no boot —, e o asset velho também é 404, porque o
 * gerenciador o apagou. Página em branco, sem erro que diga por quê.
 *
 * O teste tem **duas metades, e a segunda é o que faz a primeira valer**: o
 * controle prova que a troca de arquivos deste mundo *reproduz* a página em branco
 * quando o daemon não reinicia. Sem ele, "a página volta inteira" passaria também
 * num mundo que nunca soube quebrar — que é o e2e verde que não testa nada.
 *
 * O supervisor é o teste (`startSupervised`): relança o processo quando ele sai.
 * Quem prova o launchd e o systemd de verdade é o `pnpm smoke:service`.
 */

let world: UpdateWorld | undefined;

test.afterEach(async () => {
  await world?.dispose();
  world = undefined;
});

test("a página volta inteira depois da atualização", async ({ page }) => {
  // O daemon lê o registry uns segundos depois de subir, a tela pergunta a cada 15 s,
  // e o daemon precisa sair e voltar: com folga, mas nada disto é lento.
  test.setTimeout(150_000);
  world = await createUpdateWorld();
  const { origin, assets, daemon } = world;

  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/assets/") && response.status() >= 400) {
      failures.push(`${String(response.status())} ${response.url()}`);
    }
  });

  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
  await expect(page.getByText(`daemon v${OLD_VERSION}`)).toBeVisible();

  // O aviso chega sozinho — ninguém clicou em nada ainda.
  await expect(page.getByText(`v${OLD_VERSION} → v${NEW_VERSION}`)).toBeVisible({ timeout: 60_000 });
  expect(world.asked[0]).toBe("/@vinihcrosa%2Flumem-os/latest");

  // Só as respostas do que vem **depois** do clique interessam.
  const afterClick: { path: string; status: number }[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/assets/")) afterClick.push({ path, status: response.status() });
  });

  await page.getByRole("button", { name: "Atualizar" }).click();

  // O daemon instalou, saiu, foi relançado; a aba notou a versão nova, recarregou
  // uma vez, e diz a que versão chegou.
  await expect(page.getByText(`Lumem atualizado para v${NEW_VERSION}`)).toBeVisible({ timeout: 90_000 });

  // **Não em branco**: o app desenhou, o `#root` tem conteúdo, e é a versão nova.
  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
  await expect(page.getByText(`daemon v${NEW_VERSION}`)).toBeVisible();
  expect(await page.locator("#root > *").count()).toBeGreaterThan(0);

  // E carregou os assets **novos**, todos com 200 — o velho não foi pedido depois.
  expect(afterClick.filter((asset) => asset.path === assets.new)).toEqual([
    { path: assets.new, status: 200 },
  ]);
  expect(afterClick.some((asset) => asset.path === assets.old)).toBe(false);
  expect(failures).toEqual([]);

  // Instalou uma vez, com o gerenciador e a versão que o registry disse, e o
  // supervisor precisou subir o daemon uma vez.
  expect(world.installerCalls()).toEqual([`install --global @vinihcrosa/lumem-os@${NEW_VERSION}`]);
  expect(daemon.restarts()).toBe(1);
});

test("sem reiniciar, a mesma troca de arquivos deixa a página em branco", async ({ page, request }) => {
  // O CONTROLE do teste acima. A instalação é a mesma; o que falta é o daemon sair.
  world = await createUpdateWorld();
  const { origin, assets } = world;

  world.install();

  // `/` já é o `index.html` novo, que aponta para o asset novo...
  const home = await request.get(`${origin}/`);
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain(assets.new);
  // ...e nem o novo nem o velho respondem: o daemon velho registrou o que existia
  // no boot, e o gerenciador apagou o que ele registrou.
  expect((await request.get(`${origin}${assets.new}`)).status()).toBe(404);
  expect((await request.get(`${origin}${assets.old}`)).status()).toBe(404);

  // E é isto que a pessoa vê: nada.
  await page.goto(origin);
  await page.waitForLoadState("load");
  await expect(page.locator("#root")).toBeEmpty();
});
