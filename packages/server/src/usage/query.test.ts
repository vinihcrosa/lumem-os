import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { sessionUsage } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { newId } from "@lumem/shared";
import { createProjectRepository } from "../repositories/project.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";

import { usageByProject, usageByWorktree, usageOutsideWorktrees, windowStart } from "./query.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
});

const NOW = new Date("2026-08-21T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

interface World {
  db: Db;
  workspaceId: string;
  projects: Record<string, string>;
  worktrees: Record<string, string>;
  spend(input: {
    projectId: string;
    worktreeId?: string;
    tokens: number;
    cost?: number;
    at: Date;
  }): void;
}

async function world(): Promise<World> {
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
  const projects = createProjectRepository(db);
  const api = await projects.create({
    workspaceId: workspace.id,
    name: "api",
    path: join(tmpdir(), "api"),
    defaultBranch: "main",
  });
  const web = await projects.create({
    workspaceId: workspace.id,
    name: "web",
    path: join(tmpdir(), "web"),
    defaultBranch: "main",
  });
  const worktrees = createWorktreeRepository(db);
  const feat = await worktrees.create({
    projectId: api.id,
    name: "feat-checkout",
    branch: "feat/checkout",
    path: join(tmpdir(), "wt-feat"),
  });
  const fix = await worktrees.create({
    projectId: api.id,
    name: "fix-loader",
    branch: "fix/loader",
    path: join(tmpdir(), "wt-fix"),
  });

  return {
    db,
    workspaceId: workspace.id,
    projects: { api: api.id, web: web.id },
    worktrees: { feat: feat.id, fix: fix.id },
    spend({ projectId, worktreeId = "", tokens, cost, at }) {
      db.insert(sessionUsage)
        .values({
          id: newId(),
          sessionId: `ses-${newId()}`,
          projectId,
          worktreeId,
          tokens,
          ...(cost === undefined ? {} : { cost, currency: "USD" }),
          createdAt: at,
          updatedAt: at,
        })
        .run();
    },
  };
}

describe("windowStart", () => {
  it("cada janela é um número de dias, sem calendário", () => {
    expect(windowStart("1d", NOW)).toEqual(daysAgo(1));
    expect(windowStart("7d", NOW)).toEqual(daysAgo(7));
    expect(windowStart("1y", NOW)).toEqual(daysAgo(365));
  });
});

describe("usageByProject", () => {
  it("soma por projeto dentro da janela, e ignora o que ficou fora", async () => {
    const app = await world();
    app.spend({ projectId: app.projects.api!, tokens: 10_000, at: daysAgo(2) });
    app.spend({ projectId: app.projects.api!, tokens: 5_000, at: daysAgo(20) });

    const week = usageByProject(app.db, {
      workspaceId: app.workspaceId,
      period: "7d",
      now: NOW,
    });
    const month = usageByProject(app.db, {
      workspaceId: app.workspaceId,
      period: "1m",
      now: NOW,
    });

    expect(week.find((row) => row.name === "api")?.tokens).toBe(10_000);
    expect(month.find((row) => row.name === "api")?.tokens).toBe(15_000);
  });

  it("projeto que não gastou aparece com zero, e não desaparece", async () => {
    // "Não gastou" é resposta; uma lista que esconde obriga a pessoa a lembrar o
    // que deveria estar ali.
    const app = await world();
    app.spend({ projectId: app.projects.api!, tokens: 10_000, at: daysAgo(1) });

    const rows = usageByProject(app.db, { workspaceId: app.workspaceId, period: "7d", now: NOW });

    expect(rows.map((row) => row.name).sort()).toEqual(["api", "web"]);
    expect(rows.find((row) => row.name === "web")).toMatchObject({ tokens: 0, turns: 0 });
  });

  it("o corte de tempo não faz o projeto sumir da lista", async () => {
    // O `gte` vive no `join`, não no `where`: no `where` ele eliminaria a linha
    // do projeto que só gastou fora da janela.
    const app = await world();
    app.spend({ projectId: app.projects.api!, tokens: 10_000, at: daysAgo(300) });

    const rows = usageByProject(app.db, { workspaceId: app.workspaceId, period: "7d", now: NOW });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.name === "api")).toMatchObject({ tokens: 0 });
  });

  it("custo soma quando existe, e é `null` quando ninguém reportou", async () => {
    const app = await world();
    app.spend({ projectId: app.projects.api!, tokens: 1, cost: 0.2, at: daysAgo(1) });
    app.spend({ projectId: app.projects.api!, tokens: 1, cost: 0.35, at: daysAgo(1) });
    app.spend({ projectId: app.projects.web!, tokens: 1, at: daysAgo(1) });

    const rows = usageByProject(app.db, { workspaceId: app.workspaceId, period: "7d", now: NOW });

    expect(rows.find((row) => row.name === "api")?.cost).toBeCloseTo(0.55);
    // Um agente que não informa dinheiro não pode parecer grátis.
    expect(rows.find((row) => row.name === "web")?.cost).toBeNull();
  });

  it("não vaza consumo de outro workspace", async () => {
    const app = await world();
    const outro = await createWorkspaceRepository(app.db).create({ name: "trabalho" });
    const alheio = await createProjectRepository(app.db).create({
      workspaceId: outro.id,
      name: "alheio",
      path: join(tmpdir(), "alheio"),
      defaultBranch: "main",
    });
    app.spend({ projectId: alheio.id, tokens: 99_000, at: daysAgo(1) });

    const rows = usageByProject(app.db, { workspaceId: app.workspaceId, period: "7d", now: NOW });

    expect(rows.map((row) => row.name).sort()).toEqual(["api", "web"]);
  });

  it("ordena pelo que gastou mais", async () => {
    const app = await world();
    app.spend({ projectId: app.projects.web!, tokens: 50_000, at: daysAgo(1) });
    app.spend({ projectId: app.projects.api!, tokens: 10_000, at: daysAgo(1) });

    const rows = usageByProject(app.db, { workspaceId: app.workspaceId, period: "7d", now: NOW });

    expect(rows.map((row) => row.name)).toEqual(["web", "api"]);
  });
});

describe("usageByWorktree", () => {
  it("soma por worktree dentro do projeto", async () => {
    const app = await world();
    app.spend({
      projectId: app.projects.api!,
      worktreeId: app.worktrees.feat!,
      tokens: 8_000,
      at: daysAgo(1),
    });
    app.spend({
      projectId: app.projects.api!,
      worktreeId: app.worktrees.fix!,
      tokens: 2_000,
      at: daysAgo(1),
    });

    const rows = usageByWorktree(app.db, { projectId: app.projects.api!, period: "7d", now: NOW });

    expect(rows.map((row) => [row.name, row.tokens])).toEqual([
      ["feat-checkout", 8_000],
      ["fix-loader", 2_000],
    ]);
  });

  it("o que rodou direto no projeto tem lugar próprio", async () => {
    /*
     * Sem isto a soma das worktrees não fecharia com o total do projeto, e a
     * diferença apareceria como número faltando sem explicação.
     */
    const app = await world();
    app.spend({ projectId: app.projects.api!, tokens: 3_000, at: daysAgo(1) });
    app.spend({
      projectId: app.projects.api!,
      worktreeId: app.worktrees.feat!,
      tokens: 7_000,
      at: daysAgo(1),
    });

    const worktrees = usageByWorktree(app.db, {
      projectId: app.projects.api!,
      period: "7d",
      now: NOW,
    });
    const loose = usageOutsideWorktrees(app.db, {
      projectId: app.projects.api!,
      period: "7d",
      now: NOW,
    });

    const total = worktrees.reduce((sum, row) => sum + row.tokens, 0) + loose.tokens;
    expect(loose.tokens).toBe(3_000);
    expect(total).toBe(10_000);
  });
});
