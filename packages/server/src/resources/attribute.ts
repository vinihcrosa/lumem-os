import type { ProcessRow } from "./process-table.js";

/** Os três grupos de `system.resources`. */
export type ResourceGroup = "daemon" | "agents" | "terminals";

/** Os PIDs que o daemon **sabe** que são dele, pelos dois managers. */
export interface TrackedPids {
  daemonPid: number;
  agents: readonly { pid: number; sessionId: string }[];
  terminals: readonly { pid: number; sessionId: string }[];
}

/** O processo rastreado de que outro desce: é ele que diz qual sessão. */
export interface ProcessRoot {
  kind: "daemon" | "agent" | "terminal";
  pid: number;
  sessionId: string | null;
}

export interface Attribution {
  group: ResourceGroup;
  root: ProcessRoot;
}

const GROUP_OF_ROOT: Record<ProcessRoot["kind"], ResourceGroup> = {
  daemon: "daemon",
  agent: "agents",
  terminal: "terminals",
};

/**
 * De qual grupo é cada processo: o do ancestral rastreado **mais próximo** (`038`, AC 41).
 *
 * Mais próximo, e não "algum": um adaptador e um shell são filhos do daemon, e o neto
 * de um deles desce do daemon também. Quem responde por ele é o primeiro rastreado no
 * caminho para cima, o próprio processo inclusive. O que não desce do daemon — a
 * máquina inteira — fica fora, e o filho do daemon que ninguém rastreia (um `git`) é
 * do daemon.
 */
export function attribute(
  table: readonly ProcessRow[],
  tracked: TrackedPids,
): Map<number, Attribution> {
  const parentOf = new Map(table.map((row) => [row.pid, row.ppid]));
  const roots = new Map<number, ProcessRoot>([
    [tracked.daemonPid, { kind: "daemon", pid: tracked.daemonPid, sessionId: null }],
  ]);
  for (const agent of tracked.agents) {
    roots.set(agent.pid, { kind: "agent", pid: agent.pid, sessionId: agent.sessionId });
  }
  for (const terminal of tracked.terminals) {
    roots.set(terminal.pid, { kind: "terminal", pid: terminal.pid, sessionId: terminal.sessionId });
  }

  const result = new Map<number, Attribution>();
  for (const { pid } of table) {
    const root = nearestRoot(pid, parentOf, roots);
    if (root !== null) result.set(pid, { group: GROUP_OF_ROOT[root.kind], root });
  }
  return result;
}

function nearestRoot(
  start: number,
  parentOf: ReadonlyMap<number, number>,
  roots: ReadonlyMap<number, ProcessRoot>,
): ProcessRoot | null {
  // Um `ppid` que volta (pid reaproveitado entre duas leituras) não pode virar um laço.
  const seen = new Set<number>();
  let pid: number | undefined = start;
  while (pid !== undefined && !seen.has(pid)) {
    const root = roots.get(pid);
    if (root !== undefined) return root;
    seen.add(pid);
    pid = parentOf.get(pid);
  }
  return null;
}
