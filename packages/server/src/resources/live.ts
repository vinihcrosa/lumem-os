import { eq } from "drizzle-orm";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { project, session, worktree } from "../db/schema.js";
import type { PtyManager } from "../pty/PtyManager.js";
import type { ProcessRoot } from "./attribute.js";
import { createProcessTableReader, type ProcessTableReader } from "./process-table.js";
import {
  createResourceSampler,
  type ResourceSampler,
  type ResourceSamplerOptions,
  type SessionDescription,
} from "./sample.js";

/** `projeto/worktree`, ou só o projeto quando a sessão é do projeto; `null` sem linha no banco. */
function checkoutOf(db: Db, sessionId: string): { checkout: string | null; scriptName: string | null } | null {
  const row = db.select().from(session).where(eq(session.id, sessionId)).get();
  if (row === undefined) return null;

  const scopeProject = (projectId: string): string | null =>
    db.select({ name: project.name }).from(project).where(eq(project.id, projectId)).get()?.name ?? null;

  if (row.scopeType === "project") {
    return { checkout: scopeProject(row.scopeId), scriptName: row.scriptName };
  }
  const branch = db
    .select({ name: worktree.name, projectId: worktree.projectId })
    .from(worktree)
    .where(eq(worktree.id, row.scopeId))
    .get();
  const owner = branch === undefined ? null : scopeProject(branch.projectId);
  const checkout = branch === undefined ? null : owner === null ? branch.name : `${owner}/${branch.name}`;
  return { checkout, scriptName: row.scriptName };
}

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * O amostrador ligado ao daemon: os PIDs vêm dos dois managers, e o rótulo do banco.
 *
 * O agente se chama pelo id do catálogo (`claude` → `Claude`), que só o manager sabe;
 * o terminal se chama `Terminal`, ou o nome do script (`Run`) — as abas que a pessoa
 * já vê. O onde é o do banco, por projeto e worktree, e só é lido para os cinco do `top`.
 */
export function createLiveResources({
  db,
  ptyManager,
  acpManager,
  read = createProcessTableReader(),
  daemonPid = process.pid,
  ...rest
}: {
  db: Db;
  ptyManager: Pick<PtyManager, "livePids">;
  acpManager: Pick<AcpManager, "liveProcesses">;
  read?: ProcessTableReader;
  daemonPid?: number;
} & Partial<Pick<ResourceSamplerOptions, "now" | "every" | "intervalMs" | "idleAfterMs">>): ResourceSampler {
  const describe = (root: ProcessRoot): SessionDescription | null => {
    if (root.sessionId === null) return null;
    const where = checkoutOf(db, root.sessionId);
    if (root.kind === "agent") {
      const agent = acpManager.liveProcesses().find((live) => live.pid === root.pid);
      // Fora do catálogo não há como nomear o agente, e o comando é a melhor resposta.
      if (agent?.adapterId == null) return null;
      return { title: capitalized(agent.adapterId), checkout: where?.checkout ?? null };
    }
    if (where === null) return null;
    return {
      title: where.scriptName === null ? "Terminal" : capitalized(where.scriptName),
      checkout: where.checkout,
    };
  };

  return createResourceSampler({
    read,
    tracked: () => ({
      daemonPid,
      agents: acpManager.liveProcesses().map(({ pid, sessionId }) => ({ pid, sessionId })),
      terminals: ptyManager.livePids().map(({ pid, sessionId }) => ({ pid, sessionId })),
    }),
    describe,
    ...rest,
  });
}
