import { describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { withTestDb } from "../db/testing.js";
import { createProjectRepository } from "./project.js";
import { createWorkspaceRepository } from "./workspace.js";
import { createWorktreeRepository, type WorktreeRepository } from "./worktree.js";

async function setup(db: Db): Promise<{ repository: WorktreeRepository; projectId: string }> {
  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name: "lorebase",
    path: "/repos/lorebase",
    defaultBranch: "main",
  });
  return { repository: createWorktreeRepository(db), projectId: project.id };
}

function input(projectId: string, name = "teste") {
  return { projectId, name, branch: name, path: `/home/.lumem/worktrees/lorebase/${name}` };
}

describe("create", () => {
  it("registers a worktree as active", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);

      const created = await repository.create(input(projectId));

      expect(created).toMatchObject({ name: "teste", branch: "teste", state: "active" });
    });
  });

  it("refuses a name already used in the same project", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      await repository.create(input(projectId));

      const failure = repository.create({
        ...input(projectId),
        path: "/somewhere/else",
      });

      await expect(failure).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(failure).rejects.toThrow(/já existe uma worktree chamada "teste"/);
    });
  });

  it("allows the same name in another project", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const workspace = await createWorkspaceRepository(db).create({ name: "trabalho" });
      const other = await createProjectRepository(db).create({
        workspaceId: workspace.id,
        name: "outro",
        path: "/repos/outro",
        defaultBranch: "main",
      });
      await repository.create(input(projectId));

      await expect(
        repository.create({ ...input(other.id), path: "/other/path" }),
      ).resolves.toMatchObject({ name: "teste" });
    });
  });

  it("reports a project that does not exist", async () => {
    await withTestDb(async (db) => {
      const repository = createWorktreeRepository(db);

      await expect(repository.create(input("ghost"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("keeps a name with a slash intact", async () => {
    // F4.5: the name is also the branch, and `feat/login` is a normal branch.
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);

      const created = await repository.create(input(projectId, "feat/login"));

      expect(created).toMatchObject({ name: "feat/login", branch: "feat/login" });
    });
  });
});

describe("listByProject", () => {
  it("returns only that project's worktrees, sorted by name", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      await repository.create(input(projectId, "zeta"));
      await repository.create(input(projectId, "alfa"));

      expect((await repository.listByProject(projectId)).map((row) => row.name)).toEqual([
        "alfa",
        "zeta",
      ]);
    });
  });

  it("is empty for a project with none", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);

      expect(await repository.listByProject(projectId)).toEqual([]);
    });
  });
});

describe("setState", () => {
  it("marks a worktree as missing without deleting it", async () => {
    // F7.4: it does not vanish quietly. The branch still exists and the user
    // decides what to do about it.
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const created = await repository.create(input(projectId));

      const updated = await repository.setState(created.id, "missing");

      expect(updated.state).toBe("missing");
      expect(await repository.findById(created.id)).toBeDefined();
    });
  });

  it("brings a missing worktree back to active", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const created = await repository.create(input(projectId));
      await repository.setState(created.id, "missing");

      expect((await repository.setState(created.id, "active")).state).toBe("active");
    });
  });

  it("refuses a state the readers cannot interpret", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const created = await repository.create(input(projectId));

      await expect(
        repository.setState(created.id, "zombie" as "active"),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    });
  });

  it("reports a worktree that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(
        createWorktreeRepository(db).setState("nope", "missing"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("listAll", () => {
  it("walks the whole registry, across projects", async () => {
    // What the boot reconciliation needs: it checks the disk for every
    // registration, not for one project at a time.
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const workspace = await createWorkspaceRepository(db).create({ name: "trabalho" });
      const other = await createProjectRepository(db).create({
        workspaceId: workspace.id,
        name: "outro",
        path: "/repos/outro",
        defaultBranch: "main",
      });
      await repository.create(input(projectId, "a"));
      await repository.create({ ...input(other.id, "b"), path: "/other/b" });

      expect(await repository.listAll()).toHaveLength(2);
    });
  });
});

describe("remove", () => {
  it("drops the registration", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const created = await repository.create(input(projectId));

      await repository.remove(created.id);

      expect(await repository.findById(created.id)).toBeUndefined();
    });
  });

  it("reports a worktree that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(createWorktreeRepository(db).remove("nope")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  it("frees the project to be removed", async () => {
    await withTestDb(async (db) => {
      const { repository, projectId } = await setup(db);
      const created = await repository.create(input(projectId));
      const projects = createProjectRepository(db);
      await expect(projects.remove(projectId)).rejects.toMatchObject({ code: "IN_USE" });

      await repository.remove(created.id);

      await expect(projects.remove(projectId)).resolves.toBeUndefined();
    });
  });
});
