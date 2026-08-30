import { newId } from "@lumem/shared";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { worktree, type WorktreeRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Worktrees, PRD F4.6 and §6.
 *
 * Storage only. Creating the checkout on disk is the router's job, and it
 * happens *before* anything is written here — a registration without a
 * directory is the state PRD §8 forbids.
 */

export type WorktreeState = "active" | "missing";

export interface CreateWorktreeInput {
  projectId: string;
  name: string;
  branch: string;
  /** Absolute, and outside the project's own path. */
  path: string;
}

export interface WorktreeRepository {
  create(input: CreateWorktreeInput): Promise<WorktreeRow>;
  listByProject(projectId: string): Promise<WorktreeRow[]>;
  listAll(): Promise<WorktreeRow[]>;
  findById(id: string): Promise<WorktreeRow | undefined>;
  /** Boot reconciliation, F7.4. Never deletes — the branch is still there. */
  setState(id: string, state: WorktreeState): Promise<WorktreeRow>;
  /** After the checkout has been moved on disk, F6.12. */
  setPath(id: string, path: string): Promise<WorktreeRow>;
  remove(id: string): Promise<void>;
}

function conflicts(name: string): ConstraintMap {
  return {
    "unique:worktree.project_id,worktree.name": {
      code: "DUPLICATE",
      message: `já existe uma worktree chamada "${name}" neste projeto`,
    },
    foreignKey: { code: "NOT_FOUND", message: "o projeto informado não existe" },
    "check:worktree_state": {
      code: "INVALID_ARGUMENT",
      message: "estado de worktree inválido",
    },
  };
}

export function createWorktreeRepository(db: Db): WorktreeRepository {
  async function require_(id: string): Promise<WorktreeRow> {
    const found = await db.query.worktree.findFirst({ where: eq(worktree.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `worktree ${id} não existe`);
    return found;
  }

  return {
    async create(input) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(worktree)
            .values({ id: newId(), ...input })
            .returning(),
        conflicts(input.name),
      );
      return row!;
    },

    listByProject(projectId) {
      return db
        .select()
        .from(worktree)
        .where(eq(worktree.projectId, projectId))
        .orderBy(asc(worktree.name));
    },

    /** Everything, for the boot reconciliation that walks the whole registry. */
    listAll() {
      return db.select().from(worktree).orderBy(asc(worktree.projectId), asc(worktree.name));
    },

    findById(id) {
      return db.query.worktree.findFirst({ where: eq(worktree.id, id) });
    },

    async setState(id, state) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(worktree)
            .set({ state, updatedAt: new Date() })
            .where(eq(worktree.id, id))
            .returning(),
        conflicts(""),
      );
      return row!;
    },

    async setPath(id, path) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(worktree)
            .set({ path, updatedAt: new Date() })
            .where(eq(worktree.id, id))
            .returning(),
        conflicts(""),
      );
      return row!;
    },

    async remove(id) {
      await require_(id);
      await withConstraints(() => db.delete(worktree).where(eq(worktree.id, id)).returning(), {
        // No foreign key points here — `session.scope_id` is polymorphic — so
        // the live-session block is the router's, in T30.
        foreignKey: { code: "IN_USE", message: "a worktree ainda está em uso" },
      });
    },
  };
}
