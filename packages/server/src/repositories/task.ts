import { newId } from "@lumem/shared";
import { and, desc, eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, session, task, worktree, type TaskRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints } from "./base.js";

/**
 * Tarefa como entidade (`022-workspace-tasks` F1).
 *
 * O router valida forma; aqui moram as regras. Três delas não são do banco e
 * por isso vivem neste arquivo:
 *
 * - **o projeto pertence ao workspace.** Nenhum estrangeiro expressa "a coluna
 *   A e a coluna B concordam", e sem isto uma tarefa poderia apontar para um
 *   projeto de outro workspace e sumir da lista de ambos;
 * - **quem pode mover a seta**, que depende do ator (T7, T9);
 * - **`remove` só em tarefa sem sessão.** O resto é `dropped`, que preserva o
 *   custo e o motivo.
 */

export type TaskStatus = TaskRow["status"];
export type TaskActor = "human" | "agent";

export const TASK_STATUSES = [
  "proposed",
  "open",
  "in_progress",
  "review",
  "done",
  "dropped",
] as const;

/** Os dois estados que saem do fluxo, e os únicos que carimbam `closed_at`. */
const CLOSED: ReadonlySet<string> = new Set(["done", "dropped"]);

/**
 * A ordem da lista (§F1), e ela é uma decisão de produto escrita em SQL.
 *
 * `review` e `in_progress` primeiro — é o que está acontecendo e o que espera
 * você —, `open` depois, e o que saiu do fluxo por último. Dentro de cada
 * faixa, o mais recente primeiro.
 *
 * Um `CASE` e não uma coluna de ordenação: a ordem é derivada do estado, e uma
 * coluna guardada poderia discordar dele.
 */
const STATUS_RANK = sql`CASE ${task.status}
  WHEN 'review' THEN 0
  WHEN 'in_progress' THEN 1
  WHEN 'proposed' THEN 2
  WHEN 'open' THEN 3
  WHEN 'done' THEN 4
  ELSE 5 END`;

/**
 * O que cada ator pode escrever.
 *
 * **`done` é humano** (T9): ele fecha custo, fecha a worktree como candidata a
 * remoção, e alimenta "o que este workspace fez". Um agente que se declara
 * pronto está em `review`, que é a palavra certa para o que ele sabe.
 *
 * `in_progress` não está em nenhuma das duas listas de propósito: ele é
 * **derivado** do primeiro prompt de uma sessão ligada à tarefa, e quem o
 * escreve é o observador de eventos (T6) — não um pedido.
 */
const AGENT_MAY_SET: ReadonlySet<string> = new Set(["review"]);

export interface TaskFilter {
  status?: TaskStatus;
  projectId?: string;
}

export interface CreateTaskInput {
  workspaceId: string;
  projectId: string;
  title: string;
  body?: string;
  links?: string[];
  /** `human` cria `open`; `agent` decide pela regra do §3.2 (ver `statusForAgent`). */
  actor?: TaskActor;
  status?: TaskStatus;
  sessionId?: string;
}

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<TaskRow>;
  listByWorkspace(workspaceId: string, filter?: TaskFilter): Promise<TaskRow[]>;
  get(id: string): Promise<TaskRow | undefined>;
  findByWorktree(worktreeId: string): Promise<TaskRow | undefined>;
  update(id: string, patch: { title?: string; body?: string; links?: string[] }): Promise<TaskRow>;
  setStatus(
    id: string,
    status: TaskStatus,
    options?: { actor?: TaskActor; reason?: string },
  ): Promise<TaskRow>;
  attachWorktree(id: string, worktreeId: string): Promise<TaskRow>;
  remove(id: string): Promise<void>;
}

export function createTaskRepository(db: Db): TaskRepository {
  async function require_(id: string): Promise<TaskRow> {
    const found = await db.query.task.findFirst({ where: eq(task.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `tarefa ${id} não existe`);
    return found;
  }

  /**
   * O projeto existe e é **deste** workspace.
   *
   * Lido antes de escrever de propósito, e é a exceção à regra de "não checar
   * lendo primeiro": não existe constraint que expresse isto, então ou é aqui
   * ou não é em lugar nenhum.
   */
  async function requireProjectIn(workspaceId: string, projectId: string): Promise<void> {
    const found = await db.query.project.findFirst({ where: eq(project.id, projectId) });
    if (!found) throw new DomainError("NOT_FOUND", `projeto ${projectId} não existe`);
    if (found.workspaceId !== workspaceId) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        `o projeto "${found.name}" não é deste workspace`,
      );
    }
  }

  return {
    async create(input) {
      const actor = input.actor ?? "human";
      await requireProjectIn(input.workspaceId, input.projectId);

      if (actor === "agent" && !input.sessionId) {
        // O CHECK do banco também recusa, e esta mensagem existe para o agente
        // ler algo melhor que "CHECK constraint failed".
        throw new DomainError("INVALID_ARGUMENT", "tarefa criada por agente precisa da sessão");
      }

      const status = input.status ?? (actor === "agent" ? "proposed" : "open");
      const [row] = await withConstraints(
        () =>
          db
            .insert(task)
            .values({
              id: newId(),
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              title: input.title,
              body: input.body ?? "",
              links: JSON.stringify(input.links ?? []),
              createdBy: actor,
              createdBySession: actor === "agent" ? input.sessionId : null,
              status,
              closedAt: CLOSED.has(status) ? new Date() : null,
            })
            .returning(),
        {
          foreignKey: { code: "NOT_FOUND", message: "o workspace ou o projeto não existe" },
        },
      );
      return row!;
    },

    listByWorkspace(workspaceId, filter = {}) {
      const where = [eq(task.workspaceId, workspaceId)];
      if (filter.status) where.push(eq(task.status, filter.status));
      if (filter.projectId) where.push(eq(task.projectId, filter.projectId));

      return db
        .select()
        .from(task)
        .where(and(...where))
        .orderBy(STATUS_RANK, desc(task.updatedAt));
    },

    get(id) {
      return db.query.task.findFirst({ where: eq(task.id, id) });
    },

    /**
     * A tarefa deste checkout, se houver.
     *
     * `findFirst` e não `find`: a coluna não é única, e duas tarefas apontando
     * para a mesma worktree é um estado que o produto não cria mas o banco
     * permite. A primeira é a resposta honesta — melhor que uma exceção numa
     * linha de contexto.
     */
    findByWorktree(worktreeId) {
      return db.query.task.findFirst({ where: eq(task.worktreeId, worktreeId) });
    },

    async update(id, patch) {
      await require_(id);
      const [row] = await db
        .update(task)
        .set({
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.body === undefined ? {} : { body: patch.body }),
          ...(patch.links === undefined ? {} : { links: JSON.stringify(patch.links) }),
          updatedAt: new Date(),
        })
        .where(eq(task.id, id))
        .returning();
      return row!;
    },

    async setStatus(id, status, options = {}) {
      const actor = options.actor ?? "human";
      const current = await require_(id);

      if (actor === "agent" && !AGENT_MAY_SET.has(status)) {
        throw new DomainError(
          "BLOCKED",
          status === "done"
            ? "só você marca done — o agente diz review"
            : `um agente não pode mover a tarefa para ${status}`,
        );
      }
      /*
       * O guard acima olha só o destino, e isso não basta.
       *
       * `review` é o único estado que um agente escreve — mas uma tarefa **já
       * fechada** movida para `review` sai de `done`/`dropped` e perde o
       * `closedAt` logo abaixo. Um `POST /tasks/:id/review` numa tarefa que
       * você marcou `done` reabriria, pelo agente, um estado que a T9 reserva
       * para você. Fechar é seu, e **reabrir também é**.
       */
      if (actor === "agent" && CLOSED.has(current.status)) {
        throw new DomainError(
          "BLOCKED",
          `a tarefa está ${current.status} — reabrir é seu, como fechar`,
        );
      }
      if (status === "dropped" && !options.reason?.trim()) {
        // Sem motivo, `dropped` é indistinguível de esquecimento — e o arquivo
        // existe justamente para quem foi procurar de propósito.
        throw new DomainError("INVALID_ARGUMENT", "descartar uma tarefa pede um motivo");
      }
      if (current.status === status) return current;

      const [row] = await withConstraints(
        () =>
          db
            .update(task)
            .set({
              status,
              reason: status === "dropped" ? (options.reason ?? null) : current.reason,
              closedAt: CLOSED.has(status) ? (current.closedAt ?? new Date()) : null,
              updatedAt: new Date(),
            })
            .where(eq(task.id, id))
            .returning(),
        { "check:task_status": { code: "INVALID_ARGUMENT", message: `estado inválido: ${status}` } },
      );
      return row!;
    },

    async attachWorktree(id, worktreeId) {
      const current = await require_(id);
      const checkout = await db.query.worktree.findFirst({ where: eq(worktree.id, worktreeId) });
      if (!checkout) throw new DomainError("NOT_FOUND", `checkout ${worktreeId} não existe`);
      if (checkout.projectId !== current.projectId) {
        throw new DomainError("INVALID_ARGUMENT", "o checkout é de outro projeto");
      }

      const [row] = await db
        .update(task)
        .set({ worktreeId, updatedAt: new Date() })
        .where(eq(task.id, id))
        .returning();
      return row!;
    },

    async remove(id) {
      await require_(id);
      const attached = await db.query.session.findFirst({ where: eq(session.taskId, id) });
      if (attached) {
        // Apagar levaria junto o único rastro de que a sessão existiu para
        // alguma coisa. `dropped` guarda o custo e o motivo — e é reversível.
        throw new DomainError(
          "BLOCKED",
          "a tarefa já tem sessões; descarte-a em vez de apagar",
        );
      }
      await db.delete(task).where(eq(task.id, id));
    },
  };
}
