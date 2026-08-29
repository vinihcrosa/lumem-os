import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { withTestDb } from "../db/testing.js";
import { createGitService } from "../git/GitService.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";
import { loadConfig } from "../config.js";
import {
  migrateWorktreeLayout,
  reconcileOnBoot,
  reconcileOrphanSessions,
  reconcileWorktrees,
} from "./reconcile.js";

/** A config whose state directory is a throwaway. */
function testConfig() {
  return loadConfig({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
}

afterEach(() => {
  cleanupGitFixtures();
});

async function projectIn(db: Db, name = "lorebase"): Promise<string> {
  const workspace = await createWorkspaceRepository(db).create({ name: `ws-${name}` });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name,
    path: `/repos/${name}`,
    defaultBranch: "main",
  });
  return project.id;
}

/** A registration whose directory really exists on disk. */
async function registerPresent(db: Db, projectId: string, name: string): Promise<string> {
  const path = join(tempDir("lumem-reconcile-"), name);
  mkdirSync(path, { recursive: true });
  const created = await createWorktreeRepository(db).create({
    projectId,
    name,
    branch: name,
    path,
  });
  return created.id;
}

describe("reconcileWorktrees", () => {
  it("marks a worktree whose directory is gone as missing", async () => {
    // PRD §8: `rm -rf` on a worktree must not make the registration vanish
    // silently — the branch still exists and the user has to be told.
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      rmSync((await worktrees.findById(id))!.path, { recursive: true, force: true });

      const report = await reconcileWorktrees({ db });

      expect(report).toMatchObject({ checked: 1, markedMissing: 1, restored: 0, failed: 0 });
      expect((await worktrees.findById(id))?.state).toBe("missing");
    });
  });

  it("does not delete the registration", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      rmSync((await worktrees.findById(id))!.path, { recursive: true, force: true });

      await reconcileWorktrees({ db });

      expect(await worktrees.findById(id)).toBeDefined();
    });
  });

  it("brings a worktree back to active when its directory reappears", async () => {
    // A remounted drive, a restored backup. Otherwise the user has to remove
    // and recreate a worktree that is sitting right there.
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      await worktrees.setState(id, "missing");

      const report = await reconcileWorktrees({ db });

      expect(report).toMatchObject({ restored: 1, markedMissing: 0 });
      expect((await worktrees.findById(id))?.state).toBe("active");
    });
  });

  it("leaves an untouched worktree alone", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      await registerPresent(db, projectId, "teste");

      expect(await reconcileWorktrees({ db })).toMatchObject({
        checked: 1,
        markedMissing: 0,
        restored: 0,
      });
    });
  });

  it("keeps going across projects when one worktree fails", async () => {
    // A single broken project must not turn into a broken boot.
    await withTestDb(async (db) => {
      const first = await projectIn(db, "quebrado");
      const second = await projectIn(db, "inteiro");
      const worktrees = createWorktreeRepository(db);
      const doomed = await registerPresent(db, first, "some");
      const healthy = await registerPresent(db, second, "outro");
      rmSync((await worktrees.findById(doomed))!.path, { recursive: true, force: true });
      rmSync((await worktrees.findById(healthy))!.path, { recursive: true, force: true });

      const report = await reconcileWorktrees({ db });

      expect(report.checked).toBe(2);
      expect(report.markedMissing).toBe(2);
    });
  });

  it("does nothing, loudly, on an empty registry", async () => {
    await withTestDb(async (db) => {
      expect(await reconcileWorktrees({ db })).toEqual({
        checked: 0,
        markedMissing: 0,
        restored: 0,
        failed: 0,
      });
    });
  });
});


describe("reconcileOrphanSessions", () => {
  it("closes every session left running by the previous daemon", async () => {
    // F7.3: a PTY is a child of the process that spawned it, so a restart
    // killed all of them. A record still saying `running` would block a
    // worktree removal on something the user cannot close.
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      await sessions.create({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });

      expect(await reconcileOrphanSessions({ db })).toBe(1);
      expect(await sessions.listRunning()).toEqual([]);
    });
  });

  it("leaves the exit code null rather than claiming a clean finish", async () => {
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      const id = newId();
      await sessions.create({
        id,
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });

      await reconcileOrphanSessions({ db });

      // The daemon genuinely does not know how it ended; a 0 would say it
      // finished cleanly.
      expect((await sessions.findById(id))?.exitCode).toBeNull();
    });
  });

  it("does not touch sessions that already ended", async () => {
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      const id = newId();
      await sessions.create({
        id,
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });
      await sessions.markExited(id, 7);

      expect(await reconcileOrphanSessions({ db })).toBe(0);
      expect((await sessions.findById(id))?.exitCode).toBe(7);
    });
  });
});

describe("migrateWorktreeLayout", () => {
  /** Um projeto de verdade, com uma worktree de verdade na árvore antiga. */
  async function inOldTree(db: Db): Promise<{
    config: ReturnType<typeof loadConfig>;
    repo: string;
    worktreeId: string;
    oldPath: string;
  }> {
    const config = testConfig();
    const repo = await createRepo({ branch: "main" });
    const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
    const project = await createProjectRepository(db).create({
      workspaceId: workspace.id,
      name: "lorebase",
      path: repo,
      defaultBranch: "main",
    });

    // Onde o `worktreesDir` de antes da Q20 as colocava.
    const oldPath = join(config.stateDir, "worktrees", "lorebase", "teste");
    await runGit(repo, "worktree", "add", "-b", "teste", oldPath, "main");
    const row = await createWorktreeRepository(db).create({
      projectId: project.id,
      name: "teste",
      branch: "teste",
      path: oldPath,
    });
    return { config, repo, worktreeId: row.id, oldPath };
  }

  it("move a worktree e ela continua funcionando dos dois lados", async () => {
    // O critério não é o diretório existir no lugar novo. São os dois lados do
    // vínculo: a worktree responde, **e** o repositório sabe onde ela está.
    await withTestDb(async (db) => {
      const { config, repo, worktreeId } = await inOldTree(db);

      const report = await migrateWorktreeLayout({ db, config });

      const row = await createWorktreeRepository(db).findById(worktreeId);
      expect(report.moved).toBe(1);
      expect(row!.path).toBe(
        join(config.workspacesDir, "pessoal", "lorebase", "worktrees", "teste"),
      );
      expect(existsSync(join(row!.path, "README.md"))).toBe(true);
      await expect(runGit(row!.path, "status", "--porcelain")).resolves.toBe("");
      // Este é o que só passa por causa do `repair`.
      expect(await runGit(repo, "worktree", "list")).toContain(row!.path);
    });
  });

  it("um mv sem repair deixa o repositório apontando para o lugar antigo", async () => {
    // Medido, não suposto: mover a worktree **não** quebra o `git status` dela,
    // porque o `.git` dentro dela aponta para um repositório que não se moveu.
    // O que quebra é o vínculo de volta — `<repo>/.git/worktrees/<nome>/gitdir`
    // continua nomeando o caminho antigo. O repositório passa a listar uma
    // worktree que não está mais lá, e um `git worktree prune` — que o git roda
    // sozinho em várias operações — apaga a administração dela. Aí sim ela
    // quebra de vez, e longe do movimento que a quebrou.
    await withTestDb(async (db) => {
      const { config, repo, oldPath } = await inOldTree(db);
      const destino = join(config.stateDir, "movida-na-mao");

      renameSync(oldPath, destino);

      await expect(runGit(destino, "status", "--porcelain")).resolves.toBe("");
      expect(await runGit(repo, "worktree", "list")).toContain(oldPath);
      expect(await runGit(repo, "worktree", "list")).not.toContain(destino);
    });
  });

  it("não mexe numa worktree que já está no lugar certo", async () => {
    await withTestDb(async (db) => {
      const { config } = await inOldTree(db);
      await migrateWorktreeLayout({ db, config });

      const segunda = await migrateWorktreeLayout({ db, config });

      expect(segunda.moved).toBe(0);
      expect(segunda.failed).toBe(0);
    });
  });

  it("deixa para a reconciliação a worktree que sumiu do disco", async () => {
    await withTestDb(async (db) => {
      const { config, oldPath, worktreeId } = await inOldTree(db);
      rmSync(oldPath, { recursive: true, force: true });

      const report = await migrateWorktreeLayout({ db, config });

      expect(report).toMatchObject({ moved: 0, failed: 0 });
      expect((await createWorktreeRepository(db).findById(worktreeId))!.path).toBe(oldPath);
    });
  });

  it("desfaz o movimento quando o repair falha, em vez de deixar meia migração", async () => {
    // Uma worktree movida e não reparada é pior que uma que não se moveu: ela
    // parece íntegra, e a linha do registro ainda nomeia o lugar antigo.
    await withTestDb(async (db) => {
      const { config, oldPath, worktreeId } = await inOldTree(db);
      const git = createGitService();

      const report = await migrateWorktreeLayout({
        db,
        config,
        git: { ...git, repairWorktree: () => Promise.reject(new Error("sem repair")) },
      });

      expect(report.failed).toBe(1);
      expect(existsSync(oldPath)).toBe(true);
      expect((await createWorktreeRepository(db).findById(worktreeId))!.path).toBe(oldPath);
    });
  });

  it("uma falha não impede as outras worktrees de migrarem", async () => {
    await withTestDb(async (db) => {
      const { config, worktreeId } = await inOldTree(db);
      // Um projeto cujo repositório não existe: o repair não tem de onde rodar.
      const quebrado = await projectIn(db, "fantasma");
      const orfa = join(tempDir("lumem-orfa-"), "orfa");
      mkdirSync(orfa, { recursive: true });
      await createWorktreeRepository(db).create({
        projectId: quebrado,
        name: "orfa",
        branch: "orfa",
        path: orfa,
      });

      const report = await migrateWorktreeLayout({ db, config });

      expect(report).toMatchObject({ moved: 1, failed: 1 });
      expect((await createWorktreeRepository(db).findById(worktreeId))!.path).toContain(
        "workspaces",
      );
    });
  });
});

describe("reconcileOnBoot", () => {
  it("seeds the default agent configuration", async () => {
    // F6.4: a first boot that finished without it would show an empty menu.
    await withTestDb(async (db) => {
      await reconcileOnBoot({ db, config: testConfig() });

      expect((await createAgentConfigRepository(db).list()).map((row) => row.name)).toEqual([
        "claude-code",
      ]);
    });
  });

  it("runs the whole alignment in one call", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      rmSync((await createWorktreeRepository(db).findById(id))!.path, {
        recursive: true,
        force: true,
      });
      await createSessionRepository(db).create({
        id: newId(),
        kind: "shell",
        scopeType: "worktree",
        scopeId: id,
        cwd: "/w",
        command: "/bin/sh",
      });

      const report = await reconcileOnBoot({ db, config: testConfig() });

      expect(report.worktrees.markedMissing).toBe(1);
      expect(report.orphanSessions).toBe(1);
    });
  });

  it("is idempotent across restarts", async () => {
    await withTestDb(async (db) => {
      await reconcileOnBoot({ db, config: testConfig() });
      await reconcileOnBoot({ db, config: testConfig() });

      expect(await createAgentConfigRepository(db).list()).toHaveLength(1);
    });
  });
});
