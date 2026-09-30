import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import type { PtyManager } from "../pty/PtyManager.js";
import type { ProcessRoot } from "./attribute.js";
import { createProcessTableReader, type ProcessTableReader } from "./process-table.js";
import { agentTitle, capitalized, sessionPlace } from "./session-place.js";
import {
  createResourceSampler,
  type ResourceSampler,
  type ResourceSamplerOptions,
  type SessionDescription,
} from "./sample.js";

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
    const where = sessionPlace(db, root.sessionId);
    if (root.kind === "agent") {
      const agent = acpManager.liveProcesses().find((live) => live.pid === root.pid);
      // Fora do catálogo não há como nomear o agente, e o comando é a melhor resposta.
      if (agent?.adapterId == null) return null;
      return { title: agentTitle(agent.adapterId), checkout: where?.checkout ?? null };
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
