import { expect, test } from "@playwright/test";

/**
 * The product as someone installs it: one daemon, one port, no vite.
 *
 * Everything here is about how the assets travel, because that is the only
 * thing production changes — and it is enough to make the app not load at all.
 */

test("a aplicação carrega servida pelo próprio daemon", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");

  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
  // Not just "React rendered": the typed client round-tripped to the daemon on
  // the same origin, with no proxy in front of it.
  await expect(page.getByText(/^daemon v/)).toBeVisible();
});

test("uma rota da aplicação sobrevive a um reload", async ({ page }) => {
  // The SPA fallback, which is the one thing a static server gets wrong by
  // default: deep link, hard reload, and the daemon has to answer with the app
  // shell instead of 404.
  await page.goto("/qualquer/rota/da/aplicacao");
  await page.reload();

  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
});

test("as rotas do daemon não recebem o HTML da aplicação", async ({ request }) => {
  // If this regresses, the client asks for JSON, gets `<!doctype html>`, and
  // reports a parse error that says nothing about the 404 underneath.
  const response = await request.get("/trpc/nao.existe", {
    headers: { accept: "text/html" },
  });

  expect(response.status()).not.toBe(200);
  expect(await response.text()).not.toContain("<!doctype html>");
});

test("o asset com hash no nome vem cacheável", async ({ page }) => {
  const assets: string[] = [];
  page.on("response", (response) => {
    if (/\/assets\/.+\.js$/.test(new URL(response.url()).pathname)) {
      assets.push(response.headers()["cache-control"] ?? "");
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();

  expect(assets.length).toBeGreaterThan(0);
  expect(assets.every((value) => value.includes("immutable"))).toBe(true);
});
