import { newId } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { project } from "../db/schema.js";
import { withTestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { DomainError } from "../errors.js";
import { createWorkspaceRepository } from "./workspace.js";

/** Adds a project directly, bypassing the repository that does not exist yet. */
async function addProject(db: Db, workspaceId: string): Promise<void> {
  await db.insert(project).values({
    id: newId(),
    workspaceId,
    name: "lorebase",
    path: `/repos/${newId()}`,
    defaultBranch: "main",
  });
}

describe("create", () => {
  it("stores a workspace and gives it an id", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);

      const created = await repository.create({ name: "pessoal" });

      expect(created.name).toBe("pessoal");
      expect(created.id).toMatch(/\S/);
      expect(await repository.findById(created.id)).toMatchObject({ name: "pessoal" });
    });
  });

  it("refuses a name already in use, with a message naming it", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      await repository.create({ name: "pessoal" });

      const failure = repository.create({ name: "pessoal" });

      await expect(failure).rejects.toThrow(DomainError);
      await expect(failure).rejects.toMatchObject({ code: "DUPLICATE" });
      await expect(failure).rejects.toThrow(/já existe um workspace chamado "pessoal"/);
    });
  });
});

describe("list", () => {
  it("is empty on a fresh install", async () => {
    await withTestDb(async (db) => {
      expect(await createWorkspaceRepository(db).list()).toEqual([]);
    });
  });

  it("sorts by name, not by creation order", async () => {
    // The selector is a list a human scans; when they created each one tells
    // them nothing.
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      await repository.create({ name: "trabalho" });
      await repository.create({ name: "aberto" });
      await repository.create({ name: "pessoal" });

      expect((await repository.list()).map((row) => row.name)).toEqual([
        "aberto",
        "pessoal",
        "trabalho",
      ]);
    });
  });
});

describe("findById", () => {
  it("returns undefined for an id that never existed", async () => {
    await withTestDb(async (db) => {
      expect(await createWorkspaceRepository(db).findById("nope")).toBeUndefined();
    });
  });
});

describe("rename", () => {
  it("changes the name and moves updated_at", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      const created = await repository.create({ name: "pessoal" });

      const renamed = await repository.rename(created.id, "particular");

      expect(renamed.name).toBe("particular");
      expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
      expect(await repository.findById(created.id)).toMatchObject({ name: "particular" });
    });
  });

  it("refuses a name another workspace already has", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      await repository.create({ name: "pessoal" });
      const other = await repository.create({ name: "trabalho" });

      await expect(repository.rename(other.id, "pessoal")).rejects.toMatchObject({
        code: "DUPLICATE",
      });
    });
  });

  it("reports a workspace that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(createWorkspaceRepository(db).rename("nope", "x")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  it("leaves the row alone when the new name is refused", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      await repository.create({ name: "pessoal" });
      const other = await repository.create({ name: "trabalho" });

      await expect(repository.rename(other.id, "pessoal")).rejects.toThrow();

      expect(await repository.findById(other.id)).toMatchObject({ name: "trabalho" });
    });
  });
});

describe("remove", () => {
  it("deletes an empty workspace", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      const created = await repository.create({ name: "pessoal" });

      await repository.remove(created.id);

      expect(await repository.list()).toEqual([]);
    });
  });

  it("refuses to remove a workspace that still has projects", async () => {
    // F1.5, and the PRD's flat rule against cascades: the user removes the
    // projects, the system never does it for them.
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      const created = await repository.create({ name: "pessoal" });
      await addProject(db, created.id);

      const failure = repository.remove(created.id);

      await expect(failure).rejects.toMatchObject({ code: "IN_USE" });
      await expect(failure).rejects.toThrow(/ainda tem projetos/);
      expect(await repository.findById(created.id)).toBeDefined();
    });
  });

  it("reports a workspace that does not exist", async () => {
    await withTestDb(async (db) => {
      await expect(createWorkspaceRepository(db).remove("nope")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  it("does not touch the other workspaces", async () => {
    await withTestDb(async (db) => {
      const repository = createWorkspaceRepository(db);
      const doomed = await repository.create({ name: "pessoal" });
      await repository.create({ name: "trabalho" });

      await repository.remove(doomed.id);

      expect((await repository.list()).map((row) => row.name)).toEqual(["trabalho"]);
    });
  });
});
