import { basename } from "node:path";

import { attribute, type ProcessRoot, type ResourceGroup, type TrackedPids } from "./attribute.js";
import type { ProcessRow, ProcessTableReader } from "./process-table.js";

/**
 * O que os três grupos e os maiores processos estão gastando agora (`038`, Parte 3).
 *
 * **Só enquanto alguém olha** (AC 43): ler a tabela de processos de uma máquina cheia
 * a cada 3 s, para sempre, é custo de um painel que quase nunca está aberto. A pergunta
 * é o que arma o relógio, e 15 s sem pergunta o desarma — a próxima recomeça, e
 * recomeça **sem amostra anterior**, porque a taxa de CPU entre duas leituras
 * distantes de minutos é média de outra coisa.
 */

export const SAMPLE_INTERVAL_MS = 3_000;
export const IDLE_AFTER_MS = 15_000;
const TOP_SIZE = 5;

export interface GroupUsage {
  /** Soma dos processos que já têm taxa; `null` enquanto nenhum tem (a primeira amostra). */
  cpuPercent: number | null;
  rssBytes: number;
}

export interface TopProcess {
  label: string;
  pid: number;
  cpuPercent: number | null;
  rssBytes: number;
}

export interface Resources {
  groups: Record<ResourceGroup, GroupUsage>;
  top: TopProcess[];
  /** ISO, e não `Date`: o tRPC daqui não tem transformador. */
  sampledAt: string;
}

/** Quem é a sessão de uma raiz, para o rótulo: o agente ou o terminal, e onde ela roda. */
export interface SessionDescription {
  title: string;
  /** `projeto/worktree`, ou só `projeto`; `null` quando a sessão não tem onde. */
  checkout: string | null;
}

export interface ResourceSamplerOptions {
  read: ProcessTableReader;
  tracked: () => TrackedPids;
  describe: (root: ProcessRoot) => SessionDescription | null;
  now?: () => number;
  /** Arma `fn` a cada `ms` e devolve quem desarma. O padrão é um `setInterval` que não segura o processo. */
  every?: (fn: () => void, ms: number) => () => void;
  intervalMs?: number;
  idleAfterMs?: number;
}

export interface ResourceSampler {
  /** A última amostra; lê a tabela na hora quando o relógio estava desarmado. */
  resources(): Promise<Resources>;
  /** Desarma o relógio: o daemon que está saindo não deixa um `ps` para trás. */
  stop(): void;
}

function realEvery(fn: () => void, ms: number): () => void {
  const timer = setInterval(fn, ms);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function createResourceSampler({
  read,
  tracked,
  describe,
  now = Date.now,
  every = realEvery,
  intervalMs = SAMPLE_INTERVAL_MS,
  idleAfterMs = IDLE_AFTER_MS,
}: ResourceSamplerOptions): ResourceSampler {
  let disarm: (() => void) | null = null;
  let lastAskedAt = 0;
  let latest: Resources | null = null;
  let inFlight: Promise<void> | null = null;
  /** A CPU acumulada de cada processo na amostra anterior, e quando ela foi tirada. */
  let previous: { at: number; cpu: Map<number, number> } | null = null;

  function labelOf(row: ProcessRow, root: ProcessRoot): string {
    // Só a **raiz** — o adaptador, o PTY — é a sessão. O `git` que ela lançou é `git`, e
    // três linhas iguais no `top` não diriam qual delas é o processo pesado.
    if (root.pid === row.pid) {
      const session = describe(root);
      if (session !== null) {
        return session.checkout === null ? session.title : `${session.title} · ${session.checkout}`;
      }
    }
    return basename(row.command);
  }

  function cpuPercentOf(row: ProcessRow, at: number): number | null {
    if (previous === null) return null;
    const before = previous.cpu.get(row.pid);
    const wall = (at - previous.at) / 1000;
    // Sem amostra dele antes, ou com a CPU **menor** (o pid foi reaproveitado por
    // outro processo): não há taxa, e "0%" seria afirmar o que ninguém mediu.
    if (before === undefined || wall <= 0 || row.cpuSeconds < before) return null;
    return ((row.cpuSeconds - before) / wall) * 100;
  }

  async function sampleOnce(): Promise<void> {
    const table = await read();
    const at = now();
    const owners = attribute(table, tracked());

    const groups: Record<ResourceGroup, { cpu: number | null; rssBytes: number }> = {
      daemon: { cpu: null, rssBytes: 0 },
      agents: { cpu: null, rssBytes: 0 },
      terminals: { cpu: null, rssBytes: 0 },
    };
    const processes: (TopProcess & { root: ProcessRoot; row: ProcessRow })[] = [];
    for (const row of table) {
      const owner = owners.get(row.pid);
      if (owner === undefined) continue;
      const cpu = cpuPercentOf(row, at);
      const group = groups[owner.group];
      group.rssBytes += row.rssBytes;
      if (cpu !== null) group.cpu = (group.cpu ?? 0) + cpu;
      processes.push({
        label: "",
        pid: row.pid,
        cpuPercent: cpu === null ? null : round1(cpu),
        rssBytes: row.rssBytes,
        root: owner.root,
        row,
      });
    }

    // O rótulo só para quem entra no `top`: é a parte que pergunta ao banco.
    const top = processes
      .sort((a, b) => b.rssBytes - a.rssBytes || a.pid - b.pid)
      .slice(0, TOP_SIZE)
      .map(({ root, row, ...entry }) => ({ ...entry, label: labelOf(row, root) }));

    previous = { at, cpu: new Map(table.map((row) => [row.pid, row.cpuSeconds])) };
    const usage = (group: ResourceGroup): GroupUsage => ({
      cpuPercent: groups[group].cpu === null ? null : round1(groups[group].cpu),
      rssBytes: groups[group].rssBytes,
    });
    latest = {
      groups: { daemon: usage("daemon"), agents: usage("agents"), terminals: usage("terminals") },
      top,
      sampledAt: new Date(at).toISOString(),
    };
  }

  /** Uma leitura por vez: a pergunta que chega no meio de uma espera por ela. */
  function sample(): Promise<void> {
    inFlight ??= sampleOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function tick(): void {
    if (now() - lastAskedAt >= idleAfterMs) {
      stop();
      return;
    }
    // Uma leitura que falha num tique não derruba o daemon nem o relógio: a pergunta
    // seguinte devolve a última boa, e o `ps` que voltar a andar recomeça.
    sample().catch(() => undefined);
  }

  function stop(): void {
    disarm?.();
    disarm = null;
    // Sem isto a primeira amostra depois de uma pausa calcularia a taxa sobre minutos.
    previous = null;
  }

  return {
    async resources() {
      lastAskedAt = now();
      if (disarm === null) {
        await sample();
        // Duas primeiras perguntas juntas esperam a mesma leitura e voltam juntas: a segunda
        // a chegar não arma outro relógio por cima do primeiro, que ficaria sem quem o desarme.
        disarm ??= every(tick, intervalMs);
      }
      if (latest === null) await sample();
      return latest!;
    },
    stop,
  };
}
