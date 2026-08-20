import type { FastifyBaseLogger } from "fastify";

import type { AcpPreamble, AcpPreambleSource } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { createProjectRepository } from "../repositories/project.js";

import { MemoryService } from "./MemoryService.js";
import { memoryScopeOfSession } from "./scope-of-session.js";
import { MEMORY_DIRECTIVE, memorySkill } from "./skill.js";

/**
 * O que a memória do workspace diz antes da primeira mensagem da sessão.
 *
 * Aqui é onde as três camadas do
 * [context-delivery](../../../../docs/prd/workspace-memory/context-delivery.md)
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
  log?: Pick<FastifyBaseLogger, "warn">;
}

export function createMemoryPreamble({
  db,
  stateDir,
  askUrl,
  log,
}: MemoryPreambleOptions): AcpPreambleSource {
  return async (session): Promise<AcpPreamble | null> => {
    const memory = new MemoryService({ db, stateDir, ...(log ? { log } : {}) });
    const scope = await memoryScopeOfSession(db, session.id);
    const core = await memory.core(scope);

    // Nada fixado **e** nada no acervo: não existe porta para apontar, e um
    // bloco explicando uma memória vazia é custo puro em toda sessão. Assim que
    // a primeira memória existe, a diretiva e a skill passam a valer — mesmo sem
    // nada fixado, porque a porta passou a existir.
    const acervo = memory.visible(scope).visible.length;
    if (core.entries.length === 0 && acervo === 0) return null;

    // Só os projetos do workspace da sessão: o mapa é do que ela enxerga, e
    // listar projeto de outro workspace seria a lista crescendo por um motivo
    // que não tem nada a ver com esta conversa.
    const projects =
      scope.workspaceId === undefined
        ? []
        : (await createProjectRepository(db).listByWorkspace(scope.workspaceId)).map(
            (project) => project.name,
          );

    const parts = [MEMORY_DIRECTIVE];
    if (core.text !== "") parts.push(core.text.trimEnd());
    parts.push(memorySkill({ askUrl, sessionId: session.id, projects }).trimEnd());

    return { text: `${parts.join("\n\n")}\n`, entries: core.entries.length };
  };
}
