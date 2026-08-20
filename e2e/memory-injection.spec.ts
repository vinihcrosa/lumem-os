import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import {
  createAgentConfig,
  ensureProject,
  ensureWorkspace,
  openProject,
} from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ACP } from "./support/fixtures.js";

/**
 * O núcleo da memória chega no agente — a única prova que vale.
 *
 * Os testes de unidade provam que o daemon **monta** o bloco e que ele **manda**.
 * Nenhum deles pode provar que atravessou: o `session/prompt` é uma requisição
 * JSON-RPC por um pipe, e o que existe do outro lado é outro processo. Aqui o
 * agente falso repete o que recebeu, bloco por bloco, e o spec lê o núcleo na
 * conversa — no mesmo navegador em que a pessoa leria.
 *
 * O segundo turno é metade do teste, e a mais fácil de esquecer: reinjetar em
 * todo turno funcionaria, passaria em tudo, e cobraria o núcleo para sempre.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;
const AGENT = "acp-falso";
const WORKTREE = "memoria-injecao";
/** Combinada com o agente falso, e com mais nada. */
const ECHO = "eco do que recebeu";

const DIRETRIZ = "Commit sempre em inglês, com escopo entre parênteses.";

function conversation(page: Page) {
  return page.locator("[role=tabpanel]:not([hidden]) .conv");
}

async function workspaceId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = workspaces.find((row) => row.name === "e2e") ?? workspaces[0];
  if (found === undefined) throw new Error("nenhum workspace para pendurar a memória");
  return found.id;
}

async function send(page: Page, text: string): Promise<void> {
  const box = conversation(page).getByLabel("mensagem para o agente");
  await box.click();
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+Enter");
}

test("o agente recebe o núcleo, e só uma vez", async ({ page, request }) => {
  await createAgentConfig(request, DAEMON, {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    transport: "acp",
    adapterVersion: "0.0.0-fake",
  });

  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO_ACP, "repo-acp");
  await openProject(page, "repo-acp");
  await page.getByRole("button", { name: "nova worktree" }).click();
  await page.getByLabel("Nome da worktree").fill(WORKTREE);
  await page.getByRole("button", { name: "criar" }).click();
  await expect(page.getByRole("heading", { name: WORKTREE })).toBeVisible({ timeout: 30_000 });

  // A memória antes do **primeiro turno**, não antes da sessão: o bloco é
  // montado quando a pessoa fala, e é isso que faz fixar uma memória valer para
  // a próxima coisa que você pedir, e não só para a próxima sessão.
  const ws = await workspaceId();
  const written = (await call(DAEMON, "memory.write", {
    type: "process",
    name: "Commit neste workspace",
    description: "Conventional Commits, com escopo",
    body: DIRETRIZ,
    scope: "workspace",
    workspaceId: ws,
    actor: "human",
  })) as { path: string };
  await call(DAEMON, "memory.pin", { path: written.path, pinned: true });

  await page.getByRole("button", { name: /nova sessão/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${AGENT}\\b`) }).click();
  const conv = conversation(page);
  await expect(conv).toBeVisible({ timeout: 20_000 });
  // Atada, e não só visível: o composer só aceita mensagem depois do `attached`.
  await expect(conv.getByText("sessão aberta, nada pedido ainda")).toBeVisible({ timeout: 20_000 });

  await send(page, ECHO);

  // 1. Atravessou: o agente repetiu a diretriz que o daemon injetou.
  await expect(conv.getByText(new RegExp(DIRETRIZ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible({
    timeout: 30_000,
  });
  // 2. Como bloco separado, antes da mensagem da pessoa — e a mensagem dela
  //    chegou verbatim, no bloco seguinte.
  await expect(conv.getByText(/\[bloco 1\]/)).toBeVisible();
  await expect(conv.getByText(new RegExp(`\\[bloco 2\\] ${ECHO}`))).toBeVisible();
  // 3. E a injeção é visível para quem está olhando a conversa.
  await expect(conv.getByText(/memória do workspace: 1 diretriz fixada/)).toBeVisible();

  await send(page, `${ECHO} de novo`);

  // O segundo turno leva **um** bloco: reinjetar cobraria o núcleo para sempre
  // sem dizer nada de novo.
  await expect(conv.getByText(new RegExp(`\\[bloco 1\\] ${ECHO} de novo`))).toBeVisible({
    timeout: 30_000,
  });
  await expect(conv.getByText(/memória do workspace/)).toHaveCount(1);
});
