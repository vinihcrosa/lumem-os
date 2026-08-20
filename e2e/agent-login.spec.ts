import { expect, test } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { ensureWorkspace } from "./support/app.js";
import { query } from "./support/daemon.js";

/**
 * The login panel against a real handshake.
 *
 * What only an e2e can answer here: that the panel's connected state is the
 * *adapter's* answer arriving over a real stdio handshake — the version it
 * reported, the absence of a logout button because it declares no
 * `auth.logout`, and the command the daemon runs shown as a fact rather than a
 * field.
 *
 * **What this does not cover, deliberately:** the "nenhum → conectado" click in
 * the footer. Reaching that state in the suite means removing whatever ACP
 * configuration the specs before left behind, and a configuration held by a live
 * session is refused — so the setup would be flaky in a way the assertion is not.
 * That transition has seventeen component tests, and `00-onboarding` walks the
 * real install-and-handshake path because it is the only spec that starts with an
 * empty daemon.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Config {
  id: string;
  name: string;
  transport: string;
  adapterVersion: string | null;
}

test("the panel reads the connection back from the adapter", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);

  // The footer says the state of the connection — a line that did not exist
  // before this feature, when the footer only had a button that opened a form.
  const footer = page.getByRole("button", { name: /conectado|expirado|falhou|nenhum/ });
  await expect(footer).toBeVisible({ timeout: 20_000 });
  await expect(footer).toContainText("conectado", { timeout: 30_000 });
  await footer.click();

  const panel = page.getByRole("group", { name: "conectar um agente" });

  // The version came from `initialize`, over a real handshake with the fixture
  // adapter — nobody typed it, which is the promise the whole feature turns on.
  await expect(panel.getByText(/Fake Agent|e2e-fake-agent/)).toBeVisible({ timeout: 20_000 });
  const configs = (await query(DAEMON, "agentConfig.list", {})) as Config[];
  expect(configs.some((row) => row.transport === "acp" && row.adapterVersion === "0.0.0")).toBe(
    true,
  );

  // No logout, and that is the protocol's answer rather than an omission: `logout`
  // exists in ACP but is gated on `agentCapabilities.auth.logout`, and this
  // adapter sends none. The design's own rule — without it the button would lie.
  await expect(panel.getByRole("button", { name: /^sair$/ })).toHaveCount(0);
  await expect(panel.getByText(/auth\.logout/)).toBeVisible();

  // The five old fields survive as facts in a drawer, not as a form to fill.
  await panel.getByRole("button", { name: "avançado" }).click();
  await expect(panel.getByText("0.0.0")).toBeVisible();
  await expect(panel.getByLabel("Comando")).toHaveCount(0);

  // And there is still a way to add a second agent — a gap in the drawn screen,
  // where state 07 offered only "trocar conta" and "sair".
  await panel.getByRole("button", { name: "voltar" }).click();
  await expect(panel.getByRole("button", { name: /outro agente ACP/ })).toBeVisible();
});
