import { expect, test } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { createAgentConfig, ensureWorkspace } from "./support/app.js";
import { E2E_FAKE_ACP_AGENT } from "./support/fixtures.js";

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
const AGENT = "acp-login";

/*
 * Este spec cria o agente **dele**, e por dois motivos.
 *
 * O primeiro é ordem: com uma linha por agente (`second-agent`, C8), um locator
 * pelo estado acha uma linha por spec que rodou antes — o que é a feature
 * funcionando, e um teste que depende de quem passou antes por ali.
 *
 * O segundo é o que ele afirma: a linha nasce com uma versão **diferente** da que
 * o adaptador reporta. Um `agent_config` de ACP é obrigado pelo banco a ter versão
 * fixada, então "sem versão" não existe — mas com uma versão *errada* de propósito
 * a asserção passa a distinguir o que antes ela não distinguia: se o painel lê do
 * adaptador ou do banco.
 */
test.beforeEach(async ({ request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "9.9.9-gravada",
  });
});

test("the panel reads the connection back from the adapter", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);

  /*
   * **Uma linha por agente**, e por isso o locator é o nome de um deles.
   *
   * Antes da `second-agent` este rodapé tinha uma linha só, e um matcher pelo
   * estado bastava. Os specs dividem um daemon e cada um deixa a configuração
   * dele para trás — então hoje há três linhas aqui, o que é a feature
   * funcionando, e um matcher solto acha as três. É a regra de locator que a
   * `testing.md` já registra: por nome acessível, ancorado ou escopado.
   */
  const row = page.getByRole("button", { name: new RegExp(`^${AGENT}: `) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("conectado", { timeout: 30_000 });
  await row.click();

  const panel = page.getByRole("group", { name: new RegExp(`agente ${AGENT}`) });

  // The version came from `initialize`, over a real handshake with the fixture
  // adapter — nobody typed it, which is the promise the whole feature turns on.
  await expect(panel).toContainText(/Fake Agent|e2e-fake-agent/, { timeout: 20_000 });
  // A do handshake, e não a da linha: o adaptador diz `0.0.0` e o banco guarda
  // `9.9.9-gravada`.
  await expect(panel).toContainText("0.0.0", { timeout: 20_000 });
  await expect(panel).not.toContainText("9.9.9-gravada");

  // No logout, and that is the protocol's answer rather than an omission: `logout`
  // exists in ACP but is gated on `agentCapabilities.auth.logout`, and this
  // adapter sends none. The design's own rule — without it the button would lie.
  await expect(panel.getByRole("button", { name: /^sair$/ })).toHaveCount(0);
  await expect(panel.getByText(/auth\.logout/)).toBeVisible();

  /*
   * The five old fields survive as facts in a drawer, not as a form to fill.
   *
   * E a gaveta mostra a versão **fixada na linha** — a outra —, porque é isso que
   * ela é: o que o daemon vai lançar, e não o que o adaptador respondeu. As duas
   * aparecem em lugares diferentes porque são duas coisas diferentes.
   */
  await panel.getByRole("button", { name: "avançado" }).click();
  await expect(panel).toContainText("9.9.9-gravada");
  await expect(panel.getByLabel("Comando")).toHaveCount(0);

  /*
   * E o caminho para o **próximo** agente é o `＋` do cabeçalho, não um link
   * dentro deste painel (C8).
   *
   * Era um `outro agente ACP…` no rodapé do painel de quem já estava conectado —
   * uma saída escondida atrás de estar conectado. Agora a lista tem cabeçalho, e a
   * ação mora nele.
   */
  await panel.getByRole("button", { name: "voltar" }).click();
  await page.getByRole("button", { name: "conectar um agente" }).click();
  const connect = page.getByRole("group", { name: "conectar agente" });
  await expect(connect.getByRole("button", { name: /Codex/ })).toBeVisible();
  await expect(connect.getByRole("button", { name: /outro agente ACP/ })).toBeVisible();
});
