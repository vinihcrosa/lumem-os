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
  /**
   * Os três tetos do workspace (`028` Parte 3, T18).
   *
   * **`null` é escrita, e não ausência de escrita.** Passar `null` apaga o teto
   * — é como se diz *"sem teto"* —, e por isso o campo é obrigatório nos três:
   * um `Partial` faria "não mandei" e "mandei nada" serem a mesma coisa, e as
   * duas precisam ser distinguíveis para o gesto de desligar existir.
   */
  setBudget(
    id: string,
    caps: {
      costPerTask: number | null;
      costPerDay: number | null;
      turnsPerSession: number | null;
    },
  ): Promise<WorkspaceRow>;
  /**
   * O interruptor da esteira, e quantas de uma vez (`028` Parte 2, T29 e T25).
   *
   * Os dois juntos porque a tela os mostra juntos e porque mudá-los é um gesto
   * só — ligar a autonomia sem dizer quantas seria ligar sem freio, que é o que
   * a Parte 3 veio antes para impedir.
   */
  setAutonomy(
    id: string,
    input: { autonomy: "manual" | "assistido" | "autonomo"; maxParallel: number },
  ): Promise<WorkspaceRow>;
  /** *"PR mesclada sempre remove a worktree"* (`028` Parte 4, T40 · Q27). */
  setCleanup(id: string, mergedAlwaysRemoves: boolean): Promise<WorkspaceRow>;
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

    async setBudget(id, caps) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(workspace)
            .set({
              budgetCostPerTask: caps.costPerTask,
              budgetCostPerDay: caps.costPerDay,
              budgetTurnsPerSession: caps.turnsPerSession,
              updatedAt: new Date(),
            })
            .where(eq(workspace.id, id))
            .returning(),
        {
          "check:workspace_budget_not_negative": {
            code: "INVALID_ARGUMENT",
            message: "teto negativo não existe — `sem teto` se diz com vazio",
          },
        },
      );
      return row!;
    },

    async setAutonomy(id, { autonomy, maxParallel }) {
      await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(workspace)
            .set({ autonomy, autonomyMaxParallel: maxParallel, updatedAt: new Date() })
            .where(eq(workspace.id, id))
            .returning(),
        {
          "check:workspace_autonomy": {
            code: "INVALID_ARGUMENT",
            message: `autonomia inválida: ${autonomy}`,
          },
          "check:workspace_autonomy_max_parallel": {
            code: "INVALID_ARGUMENT",
            // Não existe "sem teto" aqui, e a mensagem diz o que existe: `0` é
            // como se pausa a esteira sem mexer em cada tarefa.
            message: "o teto de paralelismo não pode ser negativo — `0` é como se pausa a esteira",
          },
        },
      );
      return row!;
    },

    async setCleanup(id, mergedAlwaysRemoves) {
      await require_(id);
      const [row] = await db
        .update(workspace)
        .set({ mergedAlwaysRemoves, updatedAt: new Date() })
        .where(eq(workspace.id, id))
        .returning();
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
