import { expect, test, type Page } from "@playwright/test";

import { E2E_SERVER_PORT } from "../ports.js";
import { ensureProject, ensureWorkspace, openProject } from "./support/app.js";
import { call, query } from "./support/daemon.js";
import { E2E_FIXTURE_REPO } from "./support/fixtures.js";

/**
 * Tarefa como entidade, ponta a ponta (`022-workspace-tasks` T17).
 *
 * **Zero token e zero rede.** O agente do e2e é falso e a porta de tarefas é
 * HTTP puro — o que está sob teste é a costura, não um modelo.
 *
 * Três caminhos: a lista com o estado como primeiro item, o `done` que só uma
 * pessoa dá, e a porta do agente. O cross-projeto — *escrever para cima é
 * proposta* — pede um segundo repositório no `fixture` e vem com a `028`, que é
 * quem tem a fila de duas portas.
 */

const DAEMON = `http://127.0.0.1:${E2E_SERVER_PORT}`;

interface Task {
  id: string;
  title: string;
  status: string;
  projectId: string;
  createdBy: string;
}

async function workspaceId(): Promise<string> {
  const workspaces = (await query(DAEMON, "workspace.list", {})) as { id: string; name: string }[];
  const found = workspaces.find((row) => row.name === "e2e") ?? workspaces[0];
  if (found === undefined) throw new Error("nenhum workspace para pendurar a tarefa");
  return found.id;
}

async function projectId(name: string): Promise<string> {
  const ws = await workspaceId();
  const projects = (await query(DAEMON, "project.listByWorkspace", { workspaceId: ws })) as {
    id: string;
    name: string;
  }[];
  const found = projects.find((row) => row.name === name);
  if (found === undefined) throw new Error(`não achei o projeto ${name}`);
  return found.id;
}

async function tasks(): Promise<Task[]> {
  return (await query(DAEMON, "task.listByWorkspace", {
    workspaceId: await workspaceId(),
  })) as Task[];
}

/** Volta para a tela do workspace, que é onde a lista e a fila moram. */
async function openWorkspaceScreen(page: Page): Promise<void> {
  await page.getByRole("button", { name: "e2e", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "e2e" })).toBeVisible({ timeout: 15_000 });
}

test("a tarefa aparece na lista, e o estado dela é o primeiro item da linha", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  await call(DAEMON, "task.create", {
    workspaceId: await workspaceId(),
    projectId: await projectId("fixture"),
    title: "o endpoint /orders devolve 500",
    body: "reproduz em staging",
  });

  await openWorkspaceScreen(page);

  const row = page.getByRole("button", { name: /o endpoint \/orders devolve 500/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  // O estado, e ele vem antes do título — é o critério de ordenação da lista.
  await expect(row).toContainText("open");
});

test("o detalhe oferece done, porque quem está olhando é uma pessoa", async ({ page }) => {
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  await call(DAEMON, "task.create", {
    workspaceId: await workspaceId(),
    projectId: await projectId("fixture"),
    title: "marcar esta como pronta",
  });

  await openWorkspaceScreen(page);
  await page.getByRole("button", { name: /marcar esta como pronta/ }).click();

  await expect(page.getByRole("button", { name: "marcar done" })).toBeVisible();
  await page.getByRole("button", { name: "marcar done" }).click();

  await expect
    .poll(async () => (await tasks()).find((row) => row.title === "marcar esta como pronta")?.status)
    .toBe("done");
});

test("um agente cria tarefa pela porta HTTP, e a proveniência aparece", async ({ page }) => {
  /*
   * A porta do agente, ponta a ponta: HTTP e texto puro, `curl` de qualquer
   * `cwd`, sem envelope de tRPC para ele errar.
   *
   * **Um projeto só**, de propósito: o caminho cross-projeto pede um segundo
   * repositório no `fixture`, e ele vem com a `028` — que é quem tem a fila de
   * duas portas. O que este caso prova é a porta, a proveniência e a regra do
   * §3.2 no caminho que existe hoje.
   */
  await page.goto("/");
  await ensureWorkspace(page);
  await ensureProject(page, E2E_FIXTURE_REPO, "fixture");
  await openProject(page, "fixture");

  // Uma sessão de shell no `fixture` — é o escopo que dá "de onde veio".
  const scope = await projectId("fixture");
  const session = (await call(DAEMON, "session.createShell", {
    scopeType: "project",
    scopeId: scope,
  })) as { id: string };

  const reply = await fetch(`${DAEMON}/tasks?session=${session.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "o checkout lê um campo que esta tarefa renomeia",
      project: "fixture",
    }),
  });
  expect(reply.status).toBe(200);
  // Para o **próprio** projeto, entra aberta: não há "para cima" aqui.
  await expect
    .poll(async () => (await tasks()).find((row) => row.createdBy === "agent")?.status)
    .toBe("open");

  await openWorkspaceScreen(page);
  const row = page.getByRole("button", { name: /o checkout lê um campo/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  // A proveniência aparece, e é ela que separa proposta de lixo.
  await expect(row).toContainText("proposta");
});
