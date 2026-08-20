import type { Db } from "../db/index.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorktreeRepository } from "../repositories/worktree.js";

export interface MemoryScopeIds {
  workspaceId?: string;
  projectId?: string;
}

/**
 * O escopo de memória de uma sessão — quem ela enxerga.
 *
 * A sessão sabe onde está (projeto ou worktree); a memória pergunta em termos de
 * workspace e projeto. Esta é a tradução, e ela mora num lugar só porque duas
 * respostas diferentes para "o que esta sessão enxerga" seriam duas memórias
 * diferentes valendo ao mesmo tempo.
 *
 * **Worktree herda o projeto dela**, e é a única leitura possível: uma branch de
 * trabalho não é outro repositório, e memória de projeto que não valesse na
 * worktree não valeria em lugar nenhum — é lá que o trabalho acontece.
 *
 * Sessão que não existe, ou cujo escopo sumiu, devolve `{}`: sem escopo, o que
 * se enxerga é só o global. Recusar aqui faria uma pergunta de leitura falhar
 * por causa de um id velho, e a memória global é uma resposta legítima.
 */
export async function memoryScopeOfSession(db: Db, sessionId: string): Promise<MemoryScopeIds> {
  const row = await createSessionRepository(db).findById(sessionId);
  if (row === undefined) return {};

  const projects = createProjectRepository(db);
  const projectId =
    row.scopeType === "project"
      ? row.scopeId
      : (await createWorktreeRepository(db).findById(row.scopeId))?.projectId;
  if (projectId === undefined) return {};

  const project = await projects.findById(projectId);
  if (project === undefined) return {};
  return { workspaceId: project.workspaceId, projectId: project.id };
}
