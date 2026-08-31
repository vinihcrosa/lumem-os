import { newId } from "@lumem/shared";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, worktree, type ProjectRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Projects, PRD F2.1–F2.5.
 *
 * Storage only: whether a path is really a git repository is the router's
 * question, asked through GitService *before* anything reaches here (PRD §8 —
 * a failed validation registers nothing).
 */
export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  /** Absolute path to the repository root. */
  path: string;
  defaultBranch: string;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRow>;
  listByWorkspace(workspaceId: string): Promise<ProjectRow[]>;
  findById(id: string): Promise<ProjectRow | undefined>;
  findByPath(path: string): Promise<ProjectRow | undefined>;
  rename(id: string, name: string): Promise<ProjectRow>;
  remove(id: string): Promise<void>;
}

function conflicts(name: string, path?: string): ConstraintMap {
  return {
    "unique:project.workspace_id,project.name": {
      code: "DUPLICATE",
      message: `já existe um projeto chamado "${name}" neste workspace`,
    },
    "unique:project.path": {
      code: "DUPLICATE",
      // The path, not the name: two workspaces pointing at one repository would
      // give a single checkout two independent sets of worktrees.
      message: `o repositório ${path ?? ""} já está registrado`.trim(),
    },
    foreignKey: {
      code: "NOT_FOUND",
      message: "o workspace informado não existe",
    },
  };
}

export function createProjectRepository(db: Db): ProjectRepository {
  async function require_(id: string): Promise<ProjectRow> {
    const found = await db.query.project.findFirst({ where: eq(project.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `projeto ${id} não existe`);
    return found;
  }

  return {
    async create(input) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(project)
            .values({ id: newId(), ...input })
            .returning(),
        conflicts(input.name, input.path),
      );
      return row!;
    },

    listByWorkspace(workspaceId) {
      return db
        .select()
        .from(project)
        .where(eq(project.workspaceId, workspaceId))
        .orderBy(asc(project.name));
    },

    findById(id) {
      return db.query.project.findFirst({ where: eq(project.id, id) });
    },

    findByPath(path) {
      return db.query.project.findFirst({ where: eq(project.path, path) });
    },

    async rename(id, name) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(project)
            .set({ name, updatedAt: new Date() })
            .where(eq(project.id, id))
            .returning(),
        conflicts(name),
      );
      return row!;
    },

    async remove(id) {
      await require_(id);
      // F2.5: the registration goes, the disk never does — not the repository at
      // its path, and not the worktrees the daemon cut under ~/.lumem. Their rows
      // go with the project in one transaction, so the FK that forbids orphaning
      // a worktree is satisfied without a single directory being touched. The
      // checkouts, uncommitted work and all, stay exactly where they are.
      db.transaction((tx) => {
        tx.delete(worktree).where(eq(worktree.projectId, id)).run();
        tx.delete(project).where(eq(project.id, id)).run();
      });
    },
  };
}
