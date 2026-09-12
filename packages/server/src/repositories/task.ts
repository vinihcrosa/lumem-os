import { newId } from "@lumem/shared";
import { and, desc, eq, ne, sql } from "drizzle-orm";

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

/**
 * Em ordem de quadro (`028` §4), com os dois que não são coluna nas pontas:
 * `proposed` é a fila de Propostas da `022`, e `dropped` sai do quadro.
 */
export const TASK_STATUSES = [
  "proposed",
  "backlog",
  "open",
  "in_progress",
  "review",
  "testing",
  "ready_to_merge",
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
 *
 * **Os três estados da `028` entraram nomeados, e não pelo `ELSE`** (T3). O
 * `ELSE` existe para `dropped`, que saiu do fluxo; cair nele poria
 * `ready_to_merge` — *a esteira acabou, falta você* — atrás de uma tarefa
 * descartada. `ready_to_merge` passa até na frente de `review` pelo critério que
 * a lista já usava: o que espera **você** vem antes do que espera a máquina.
 * A ordem relativa dos quatro estados originais não mudou.
 */
const STATUS_RANK = sql`CASE ${task.status}
  WHEN 'ready_to_merge' THEN 0
  WHEN 'review' THEN 1
  WHEN 'testing' THEN 2
  WHEN 'in_progress' THEN 3
  WHEN 'proposed' THEN 4
  WHEN 'open' THEN 5
  WHEN 'backlog' THEN 6
  WHEN 'done' THEN 7
  ELSE 8 END`;

/**
 * O que cada ator pode escrever.
 *
 * **`done` é humano** (T9): ele fecha custo, fecha a worktree como candidata a
 * remoção, e alimenta "o que este workspace fez". Um agente que se declara
 * pronto está em `review`, que é a palavra certa para o que ele sabe.
 *
 * `in_progress` não está aqui de propósito: ele é **derivado** do primeiro
 * prompt de uma sessão ligada à tarefa, e quem o escreve nesse caminho é o
 * observador de eventos (T6) — não um pedido do agente.
 *
 * **Esta é a única lista, e é do agente.** Você não tem allowlist: tudo que
 * está em `TASK_STATUSES` passa, `in_progress` incluído — que é o que faz
 * *"arrastar para qualquer coluna, sempre"* (`028` §4, Q3) funcionar sem
 * exceção nenhuma. Um `in_progress` posto por você e a derivação não colidem:
 * `tasks/progress.ts` é `WHERE status = 'open'`, então ela nunca toca o que já
 * está lá.
 *
 * **Os três estados da `028` ficam de fora** (T4). `Testing` e `Ready to Merge`
 * são etapas que *a máquina* move — e "a máquina" é o **daemon**, observando
 * fato verificável, nunca o agente dizendo que chegou lá. Um agente que se
 * declara pronto continua dizendo `review`, que é a palavra certa para o que
 * ele sabe. `backlog` é seu pelo mesmo motivo que `open` é: as duas pontas da
 * fila são consentimento.
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
  /**
   * O gesto do quadro: a coluna de destino **e** o lugar nela (`028` §4.3, T5).
   *
   * Separado do `setStatus` porque são duas perguntas diferentes. `setStatus`
   * responde *"em que etapa isto está"* — é por onde o agente diz `review` e
   * por onde você descarta com motivo. `move` responde *"onde eu soltei"*, e só
   * o quadro faz essa pergunta. Uma procedure só teria que fingir que `index` é
   * opcional em metade das chamadas.
   */
  move(
    id: string,
    target: { status: TaskStatus; index: number; actor?: TaskActor; reason?: string },
  ): Promise<TaskRow>;
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

  /** O próximo ordinal livre da coluna — onde quem chega sem arrastar encosta. */
  async function endOfColumn(workspaceId: string, status: TaskStatus): Promise<number> {
    const rows = await db
      .select({ position: task.position })
      .from(task)
      .where(and(eq(task.workspaceId, workspaceId), eq(task.status, status)))
      .orderBy(desc(task.position))
      .limit(1);
    return rows[0] === undefined ? 0 : rows[0].position + 1;
  }

  /**
   * O que o `setStatus` e o `move` compartilham: quem pode escrever o quê.
   *
   * Extraído porque ter a regra em dois lugares é ter duas regras — e a segunda
   * a divergir seria a do arrasto, que é a que o agente não deveria alcançar.
   */
  function requireMayWrite(current: TaskRow, status: TaskStatus, actor: TaskActor, reason?: string) {
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
    if (status === "dropped" && !reason?.trim()) {
      // Sem motivo, `dropped` é indistinguível de esquecimento — e o arquivo
      // existe justamente para quem foi procurar de propósito.
      throw new DomainError("INVALID_ARGUMENT", "descartar uma tarefa pede um motivo");
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
      // Quem chega sem arrastar encosta no fim da coluna — a ordem de chegada
      // do §4.3, que é o default e o único que não precisa de gesto.
      const position = await endOfColumn(input.workspaceId, status);
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
              position,
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
        // `position` desempata **dentro** da faixa, e o `STATUS_RANK` continua
        // decidindo entre faixas (T5). São as duas ordens do §4.3: entre colunas
        // manda a regra, dentro da coluna manda você. `updatedAt` fica como
        // último critério, para quem nunca arrastou e chegou no mesmo instante.
        .orderBy(STATUS_RANK, task.position, desc(task.updatedAt));
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
      requireMayWrite(current, status, actor, options.reason);
      if (current.status === status) return current;

      // Trocar de coluna sem dizer onde soltou encosta no fim dela. É o que
      // `review` vindo do agente faz, e é o que a ordem de chegada do §4.3 diz
      // para quem nunca arrastou.
      const position = await endOfColumn(current.workspaceId, status);
      const [row] = await withConstraints(
        () =>
          db
            .update(task)
            .set({
              status,
              position,
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

    async move(id, target) {
      const actor = target.actor ?? "human";
      const current = await require_(id);
      requireMayWrite(current, target.status, actor, target.reason);

      // Síncrona, como toda transação deste repositório: `better-sqlite3` recusa
      // um callback que devolve promessa, e a alternativa seria a renumeração
      // acontecer **fora** do atomismo — que é exatamente o que ela precisa ter.
      db.transaction((tx) => {
        // A coluna de destino, em ordem, **sem** o cartão que está chegando —
        // tanto faz se ele vem de outra coluna ou está só sendo reordenado
        // dentro desta. Um caso, e não dois.
        const column = tx
          .select({ id: task.id })
          .from(task)
          .where(
            and(
              eq(task.workspaceId, current.workspaceId),
              eq(task.status, target.status),
              ne(task.id, id),
            ),
          )
          .orderBy(task.position)
          .all();

        const ids = column.map((row) => row.id);
        // `index` além do fim encosta no fim: o quadro manda o índice em que o
        // ponteiro estava, e recusar por um pixel seria recusar o gesto.
        const at = Math.min(Math.max(target.index, 0), ids.length);
        ids.splice(at, 0, id);

        // Ordinal contíguo, reescrito inteiro. A coluna do quadro tem dezenas de
        // cartões, não milhares — e o preço disto é **não** ter rebalanceamento,
        // que é o que a aritmética de ponto médio cobra mais tarde e em silêncio.
        for (const [position, rowId] of ids.entries()) {
          tx
            .update(task)
            .set(
              rowId === id
                ? {
                    position,
                    status: target.status,
                    reason: target.status === "dropped" ? (target.reason ?? null) : current.reason,
                    closedAt: CLOSED.has(target.status) ? (current.closedAt ?? new Date()) : null,
                    updatedAt: new Date(),
                  }
                : { position },
            )
            .where(eq(task.id, rowId))
            .run();
        }
      });

      return require_(id);
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
