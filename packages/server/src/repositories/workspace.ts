import { newId } from "@lumem/shared";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { workspace, type WorkspaceRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Workspaces, PRD F1.1–F1.5.
 *
 * A factory over `db` rather than a class over a singleton: procedures get
 * their database from the tRPC context, and a test gets one that belongs to it
 * alone.
 */
export interface WorkspaceRepository {
  create(input: { name: string }): Promise<WorkspaceRow>;
  list(): Promise<WorkspaceRow[]>;
  findById(id: string): Promise<WorkspaceRow | undefined>;
  rename(id: string, name: string): Promise<WorkspaceRow>;
  remove(id: string): Promise<void>;
}

function duplicateName(name: string): ConstraintMap {
  return {
    "unique:workspace.name": {
      code: "DUPLICATE",
      message: `já existe um workspace chamado "${name}"`,
    },
  };
}

export function createWorkspaceRepository(db: Db): WorkspaceRepository {
  async function require_(id: string): Promise<WorkspaceRow> {
    const found = await db.query.workspace.findFirst({ where: eq(workspace.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `workspace ${id} não existe`);
    return found;
  }

  return {
    async create({ name }) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(workspace)
            .values({ id: newId(), name })
            .returning(),
        duplicateName(name),
      );
      // `returning()` on an insert that did not throw always yields the row.
      return row!;
    },

    list() {
      // By name: the selector is a list a human scans, and creation order is
      // meaningless to them.
      return db.select().from(workspace).orderBy(asc(workspace.name));
    },

    findById(id) {
      return db.query.workspace.findFirst({ where: eq(workspace.id, id) });
    },

    async rename(id, name) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(workspace)
            .set({ name, updatedAt: new Date() })
            .where(eq(workspace.id, id))
            .returning(),
        duplicateName(name),
      );
      return row!;
    },

    async remove(id) {
      await require_(id);
      // F1.5: no cascade. The foreign key is what actually stops it — this only
      // turns the refusal into something the user can read.
      await withConstraints(() => db.delete(workspace).where(eq(workspace.id, id)).returning(), {
        foreignKey: {
          code: "IN_USE",
          message: "o workspace ainda tem projetos; remova-os antes",
        },
      });
    },
  };
}
