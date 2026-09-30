import { adapterById } from "@lumem/shared";
import { and, count, eq } from "drizzle-orm";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { agentConfig, project, session, worktree } from "../db/schema.js";

/**
 * Onde uma sessão roda e como o painel a chama (`038`, Parte 3).
 *
 * Um só lugar para o `Claude · lumem-os/bandung` do `top` de recursos e da lista de
 * turnos: se cada um montasse o próprio nome, a mesma sessão apareceria com dois.
 */
export interface SessionPlace {
  /** `projeto/worktree`, ou só o projeto quando a sessão é do projeto; `null` sem o registro. */
  checkout: string | null;
  scriptName: string | null;
  /** O nome da configuração de agente, quando a sessão é de agente. */
  agentName: string | null;
}

export const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** `null` quando não há linha de sessão: um probe não tem, e o processo cai no nome do comando. */
export function sessionPlace(db: Db, sessionId: string): SessionPlace | null {
  const row = db.select().from(session).where(eq(session.id, sessionId)).get();
  if (row === undefined) return null;

  const projectName = (projectId: string): string | null =>
    db.select({ name: project.name }).from(project).where(eq(project.id, projectId)).get()?.name ?? null;

  const agentName =
    row.agentConfigId === null
      ? null
      : (db
          .select({ name: agentConfig.name })
          .from(agentConfig)
          .where(eq(agentConfig.id, row.agentConfigId))
          .get()?.name ?? null);
  const base = { scriptName: row.scriptName, agentName };

  if (row.scopeType === "project") return { ...base, checkout: projectName(row.scopeId) };

  const branch = db
    .select({ name: worktree.name, projectId: worktree.projectId })
    .from(worktree)
    .where(eq(worktree.id, row.scopeId))
    .get();
  if (branch === undefined) return { ...base, checkout: null };
  const owner = projectName(branch.projectId);
  return { ...base, checkout: owner === null ? branch.name : `${owner}/${branch.name}` };
}

/** O agente como a pessoa o chama: o id do catálogo (`claude`) com inicial maiúscula. */
export function agentTitle(agentName: string | null): string {
  if (agentName === null) return "Agente";
  return capitalized(adapterById(agentName)?.id ?? agentName);
}

export interface LiveTurn {
  sessionId: string;
  label: string;
  /** ISO, e não `Date`: o tRPC daqui não tem transformador. */
  startedAt: string;
}

/**
 * O que está rodando agora, para o painel: os turnos em voo, nomeados, e quantos
 * shells estão abertos (o que uma atualização fecha).
 *
 * Só o `shell`: o script de projeto que está rodando já **impede** a atualização, e
 * contá-lo aqui diria que ela fecha o que ela nem começa a fechar.
 */
export function liveSessions(
  db: Db,
  acpManager: Pick<AcpManager, "liveTurns">,
): { turns: LiveTurn[]; openTerminals: number } {
  const turns = acpManager.liveTurns().map(({ sessionId, startedAt }) => {
    const place = sessionPlace(db, sessionId);
    const title = agentTitle(place?.agentName ?? null);
    return {
      sessionId,
      label: place?.checkout == null ? title : `${title} · ${place.checkout}`,
      startedAt: startedAt.toISOString(),
    };
  });
  const [open] = db
    .select({ open: count() })
    .from(session)
    .where(and(eq(session.kind, "shell"), eq(session.state, "running")))
    .all();
  return { turns, openTerminals: open?.open ?? 0 };
}
