import { newId } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { worktree } from "../db/schema.js";
import { withTestDb } from "../db/testing.js";
import { createProjectRepository, type ProjectRepository } from "./project.js";
import { createWorkspaceRepository } from "./workspace.js";

async function setup(db: Db): Promise<{ repository: ProjectRepository; workspaceId: string }> {
  const workspaceRepository = createWorkspaceRepository(db);
  const created = await workspaceRepository.create({ name: "pessoal" });
  return { repository: createProjectRepository(db), workspaceId: created.id };
}

function projectInput(workspaceId: string, overrides: Partial<{ name: string; path: string }> = {}) {
  return {
    workspaceId,
    name: overrides.name ?? "lorebase",
    path: overrides.path ?? "/repos/lorebase",
    defaultBranch: "main",
  };
}

describe("create", () => {
  it("stores a project with the branch resolved at add time", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);

      const created = await repository.create(projectInput(workspaceId));

      expect(created).toMatchObject({
        name: "lorebase",
        path: "/repos/lorebase",
        defaultBranch: "main",
      });
    });
  });

  it("refuses a repository path already registered anywhere", async () => {
    // Global, not per workspace: one checkout with two registrations would end
    // up with two independent sets of worktrees.
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const other = await createWorkspaceRepository(db).create({ name: "trabalho" });
      await repository.create(projectInput(workspaceId, { path: "/repos/lorebase" }));

      const failure = repository.create({
        ...projectInput(other.id, { path: "/repos/lorebase" }),
        name: "outro-nome",
      });

      await expect(failure).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(failure).rejects.toThrow(/\/repos\/lorebase já está registrado/);
    });
  });

  it("refuses a name already used in the same workspace", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      await repository.create(projectInput(workspaceId, { path: "/repos/one" }));

      const failure = repository.create(projectInput(workspaceId, { path: "/repos/two" }));

      await expect(failure).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(failure).rejects.toThrow(/neste workspace/);
    });
  });

  it("allows the same name in a different workspace", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const other = await createWorkspaceRepository(db).create({ name: "trabalho" });
      await repository.create(projectInput(workspaceId, { path: "/repos/one" }));

      await expect(
        repository.create(projectInput(other.id, { path: "/repos/two" })),
      ).resolves.toMatchObject({ name: "lorebase" });
    });
  });

  it("reports a workspace that does not exist", async () => {
    await withTestDb(async (db) => {
      const repository = createProjectRepository(db);

      await expect(repository.create(projectInput("ghost"))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("listByWorkspace", () => {
  it("returns only the projects of that workspace, sorted by name", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const other = await createWorkspaceRepository(db).create({ name: "trabalho" });
      await repository.create(projectInput(workspaceId, { name: "zeta", path: "/repos/z" }));
      await repository.create(projectInput(workspaceId, { name: "alfa", path: "/repos/a" }));
      await repository.create(projectInput(other.id, { name: "outro", path: "/repos/o" }));

      expect((await repository.listByWorkspace(workspaceId)).map((row) => row.name)).toEqual([
        "alfa",
        "zeta",
      ]);
    });
  });

  it("is empty for a workspace with nothing in it", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);

      expect(await repository.listByWorkspace(workspaceId)).toEqual([]);
    });
  });
});

describe("findByPath", () => {
  it("finds a project by the path it was registered with", async () => {
    // How the router tells "already registered" from "new" before touching git.
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      await repository.create(projectInput(workspaceId, { path: "/repos/lorebase" }));

      expect(await repository.findByPath("/repos/lorebase")).toMatchObject({ name: "lorebase" });
      expect(await repository.findByPath("/repos/other")).toBeUndefined();
    });
  });
});

describe("rename", () => {
  it("changes the name", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const created = await repository.create(projectInput(workspaceId));

      expect(await repository.rename(created.id, "lore")).toMatchObject({ name: "lore" });
    });
  });

  it("refuses a name another project in the workspace already has", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      await repository.create(projectInput(workspaceId, { name: "lorebase", path: "/repos/one" }));
      const other = await repository.create(
        projectInput(workspaceId, { name: "outro", path: "/repos/two" }),
      );

      await expect(repository.rename(other.id, "lorebase")).rejects.toMatchObject({
        code: "DUPLICATE",
      });
    });
  });

  it("reports a project that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(createProjectRepository(db).rename("nope", "x")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("remove", () => {
  it("drops the registration", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const created = await repository.create(projectInput(workspaceId));

      await repository.remove(created.id);

      expect(await repository.findById(created.id)).toBeUndefined();
    });
  });

  it("refuses while worktrees still point at it", async () => {
    await withTestDb(async (db) => {
      const { repository, workspaceId } = await setup(db);
      const created = await repository.create(projectInput(workspaceId));
      await db
        .insert(worktree)
        .values({ id: newId(), projectId: created.id, name: "t", branch: "t", path: "/w/t" });

      const failure = repository.remove(created.id);

      await expect(failure).rejects.toMatchObject({ code: "IN_USE" });
      await expect(failure).rejects.toThrow(/ainda tem worktrees/);
      expect(await repository.findById(created.id)).toBeDefined();
    });
  });

  it("reports a project that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(createProjectRepository(db).remove("nope")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
