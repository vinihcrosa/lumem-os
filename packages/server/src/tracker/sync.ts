import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, task, type TaskRow } from "../db/schema.js";
import { createTaskRepository } from "../repositories/task.js";

import type { TrackerHost, TrackerIssue } from "./TrackerHost.js";

/**
 * A issue que vira cartão, e a que mudou no meio (`028` Parte 5 — T44 e T45).
 *
 * **Polling a 60 segundos** ([Q60](../../../../docs/features/028-autonomous-orchestration/open-questions.md)),
 * e o §3.2 do [estudo](../../../../docs/project/orchestration-measurements.md) mediu que ele cabe em
 * **2,4% da cota**. O que polling custa é latência — um minuto — e não cota, e
 * para uma feature cujo caso de uso se chama *"enquanto você almoça"* isso é
 * ruído.
 *
 * A consulta é **por workspace**, e não por projeto: o que ela pergunta é *"o
 * que tem o rótulo"*, e uma pergunta responde por todos.
 */

/** O rótulo que diz *"isto é do Lumem"* (Q62). Um nome, em todo tracker. */
export const LUMEM_LABEL = "lumem";

/**
 * O corpo vira hash, e os outros dois vão inteiros.
 *
 * A assimetria é a Q63: para dizer **qual das três** mudou, estado e responsável
 * precisam do valor; o corpo só precisa responder *"mudou?"*.
 */
export function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

/** O que mudou lá desde a última leitura, ou `null`. */
export function changeOf(
  stored: Pick<TaskRow, "externalState" | "externalAssignee" | "externalBodyHash">,
  issue: TrackerIssue,
): string | null {
  /*
   * A ordem é a do §6 — *"reatribuída, fechada, descrição editada"* —, e ela
   * importa: quando duas mudam ao mesmo tempo, o cartão diz **uma** frase, e a
   * primeira da lista é a que mais muda o que você faria.
   */
  if (stored.externalAssignee !== issue.assignee) {
    return issue.assignee === null
      ? "a issue foi desatribuída no tracker"
      : "a issue foi reatribuída no tracker";
  }
  if (stored.externalState !== issue.state) {
    return issue.state === "closed"
      ? "a issue foi fechada no tracker"
      : "a issue foi reaberta no tracker";
  }
  if (stored.externalBodyHash !== bodyHash(issue.body)) {
    return "a descrição da issue mudou no tracker";
  }
  return null;
}

export interface SyncResult {
  created: number;
  blocked: number;
}

export interface SyncDeps {
  db: Db;
  host: TrackerHost;
  /** Em qual projeto a issue cai. A tarefa é de um projeto só, desde a `022`. */
  projectFor(workspaceId: string): Promise<string | null>;
}

/**
 * Uma passada por workspace.
 *
 * Ela é **idempotente por construção**: a chave externa tem índice único, e o
 * que já existe é atualizado em vez de recriado. Rodar duas vezes não cria nada
 * na segunda, que é o requisito da T44 — e não *"não duplicar"*, que seria a
 * mesma coisa dita de um jeito que permite erro.
 */
export async function syncTracker(
  { db, host, projectFor }: SyncDeps,
  workspaceId: string,
): Promise<SyncResult> {
  // Sem a chave, a feature não existe. Não é erro: é ausência, e o host já
  // devolve vazio em vez de lançar.
  if (!host.available()) return { created: 0, blocked: 0 };

  const issues = await host.labelled(LUMEM_LABEL);
  if (issues.length === 0) return { created: 0, blocked: 0 };

  const tasks = createTaskRepository(db);
  let created = 0;
  let blocked = 0;

  for (const issue of issues) {
    const existing = await db.query.task.findFirst({
      where: and(
        eq(task.workspaceId, workspaceId),
        eq(task.externalSource, host.id),
        eq(task.externalId, issue.id),
      ),
    });

    if (!existing) {
      const target = await projectFor(workspaceId);
      // Sem projeto não há onde pendurar: a tarefa é de um projeto só desde a
      // `022`, e inventar um seria o produto decidindo por você.
      if (target === null) continue;

      const row = await tasks.create({
        workspaceId,
        projectId: target,
        title: issue.title,
        body: issue.body,
        links: [issue.url],
      });
      /*
       * A tarefa cai **direto na To-Do**, que é o §6: *"o default é executar, e
       * quem quiser triagem configura"*. O `create` já nasce em `open` para
       * ator `human`, e é isso que ela é — quem pôs o rótulo foi uma pessoa.
       */
      await tasks.linkExternal(row.id, {
        source: host.id,
        id: issue.id,
        state: issue.state,
        assignee: issue.assignee,
        bodyHash: bodyHash(issue.body),
      });
      created += 1;
      continue;
    }

    const change = changeOf(existing, issue);
    if (change === null) continue;

    /*
     * Uma tarefa já bloqueada **não** é bloqueada de novo.
     *
     * Sem isto, cada passada reescreveria o motivo a cada 60 segundos — e o
     * `updated_at` junto, o que faria a tarefa parecer estar acontecendo alguma
     * coisa quando o que houve foi o daemon relendo a mesma notícia.
     */
    if (existing.blockedReason === null) {
      await tasks.setBlocked(existing.id, change);
      await tasks.setAutonomy(existing.id, "off");
      blocked += 1;
    }

    /*
     * O instantâneo é atualizado **de qualquer jeito**, inclusive quando já
     * estava bloqueada: sem isso, uma segunda mudança lá nunca seria vista —
     * a comparação continuaria sendo contra o estado de três mudanças atrás.
     *
     * **Nada é injetado no meio de um turno** (§6): o que acontece aqui é
     * escrita em tabela, e quem lê é o quadro na leitura seguinte.
     */
    await tasks.linkExternal(existing.id, {
      source: host.id,
      id: issue.id,
      state: issue.state,
      assignee: issue.assignee,
      bodyHash: bodyHash(issue.body),
    });
  }

  return { created, blocked };
}

/** O primeiro projeto do workspace. A v1 não pergunta em qual — o §6 não pede. */
export function firstProjectOf(db: Db) {
  return async (workspaceId: string): Promise<string | null> => {
    const row = await db.query.project.findFirst({
      where: eq(project.workspaceId, workspaceId),
    });
    return row?.id ?? null;
  };
}
