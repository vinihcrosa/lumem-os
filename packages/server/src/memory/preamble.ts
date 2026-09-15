import type { FastifyBaseLogger } from "fastify";

import type { AcpPreamble, AcpPreambleSource } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";

import { MemoryService } from "./MemoryService.js";
import { memoryScopeOfSession } from "./scope-of-session.js";
import { MEMORY_DIRECTIVE, memorySkill } from "./skill.js";

/**
 * O que a memória do workspace diz antes da primeira mensagem da sessão.
 *
 * Aqui é onde as três camadas do
 * [context-delivery](../../../../docs/features/007-workspace-memory/context-delivery.md)
 * viram um texto: a **diretiva** (comportamento, sempre), o **núcleo** (as
 * memórias fixadas) e a **skill** (como perguntar o resto).
 *
 * Este arquivo existe para que o `AcpManager` não precise saber o que é memória
 * e o `MemoryService` não precise saber o que é ACP. Os dois se encontram numa
 * função, e é a única coisa que atravessa a fronteira.
 */

export interface MemoryPreambleOptions {
  db: Db;
  stateDir: string;
  /** De onde o agente pergunta — o daemon é quem sabe a porta dele. */
  askUrl: string;
  /**
   * A porta de tarefas, e o teto dela (`022` T14).
   *
   * Opcional: sem ela o parágrafo não entra, e o preâmbulo custa exatamente o
   * que custava antes desta feature.
   */
  tasks?: { url: string; budget: number };
  /**
   * A base da porta de parecer (`028` Parte 7 — T53).
   *
   * O daemon passa a raiz; o parágrafo só nasce quando **esta** sessão serve uma
   * tarefa que está em `review` — que é o único momento em que ela existe.
   */
  reviewBaseUrl?: string;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export function createMemoryPreamble({
  db,
  stateDir,
  askUrl,
  tasks,
  reviewBaseUrl,
  log,
}: MemoryPreambleOptions): AcpPreambleSource {
  return async (session): Promise<AcpPreamble | null> => {
    /*
     * Sessão que o daemon não registrou não recebe núcleo.
     *
     * A destilação de fim de sessão (PR 07) sobe um agente sem linha no banco:
     * ela não é um trabalho seu, e injetar diretriz de comportamento nela seria
     * pedir que ela obedecesse regras sobre um trabalho que não está fazendo —
     * pagando o núcleo de novo, para nada.
     */
    const row = await createSessionRepository(db).findById(session.id);
    if (row === undefined) return null;

    const memory = new MemoryService({ db, stateDir, ...(log ? { log } : {}) });
    const scope = await memoryScopeOfSession(db, session.id);
    const core = await memory.core(scope);

    /*
     * A porta do parecer só aparece **no turno de revisão**.
     *
     * Derivada, e não configurada: a sessão aponta para a tarefa, e a tarefa diz
     * a etapa. Um parágrafo sobre como reprovar numa conversa de implementação
     * seria custo em toda sessão para instruir ninguém.
     */
    const serving =
      reviewBaseUrl === undefined || row.taskId === null
        ? undefined
        : await db.query.task.findFirst({ where: (one, { eq }) => eq(one.id, row.taskId!) });
    const review =
      serving?.status === "review"
        ? { url: `${reviewBaseUrl}/${serving.id}/findings` }
        : undefined;

    /*
     * Nada fixado **e** nada no acervo: não existe porta de memória para
     * apontar, e um bloco explicando uma memória vazia é custo puro em toda
     * sessão. Assim que a primeira memória existe, a diretiva e a skill passam a
     * valer — mesmo sem nada fixado, porque a porta passou a existir.
     *
     * **Menos quando há parecer a entregar** (`028` Parte 7), e este `&&` é o
     * defeito que quase foi para produção: a porta do revisor viajava dentro do
     * preâmbulo de memória, então um workspace **sem memória nenhuma** — que é
     * todo workspace novo — deixava o revisor sem saber que ela existe. Ele
     * escreveria o parecer na conversa, como antes, e o portão não leria nada.
     */
    const acervo = memory.visible(scope).visible.length;
    if (core.entries.length === 0 && acervo === 0 && review === undefined) return null;

    // Só os projetos do workspace da sessão: o mapa é do que ela enxerga, e
    // listar projeto de outro workspace seria a lista crescendo por um motivo
    // que não tem nada a ver com esta conversa.
    const projects =
      scope.workspaceId === undefined
        ? []
        : (await createProjectRepository(db).listByWorkspace(scope.workspaceId)).map(
            (project) => project.name,
          );

    /*
     * Com memória vazia e parecer a entregar, a diretiva de memória sai: ela
     * manda consultar um acervo que não existe. O que fica é a porta.
     */
    const vazia = core.entries.length === 0 && acervo === 0;
    const parts = vazia ? [] : [MEMORY_DIRECTIVE];
    if (core.text !== "") parts.push(core.text.trimEnd());
    parts.push(
      memorySkill({
        askUrl,
        sessionId: session.id,
        projects,
        ...(tasks === undefined ? {} : { tasks }),
        ...(review === undefined ? {} : { review }),
        hasMemory: !vazia,
      }).trimEnd(),
    );

    return { text: `${parts.join("\n\n")}\n`, entries: core.entries.length };
  };
}
