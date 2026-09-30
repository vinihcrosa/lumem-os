import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

/**
 * A tabela de processos **da árvore do Lumem** (`038`, Parte 3).
 *
 * Sem dependência nativa nova (ADR de 2026-08-30): no macOS é o `ps`, e no Linux são
 * arquivos de `/proc`. Cada um vira a mesma linha, e é o que o resto de `resources/`
 * conhece — quem atribui e quem amostra não sabem de qual sistema ela veio.
 *
 * **Duas passadas**, porque o custo de uma amostra (C61) é o do `ps`, e ele cresce com o
 * que pede: a primeira lê **só os elos pai–filho** da máquina inteira (um `pid` e um
 * `ppid` por processo), daí se monta a árvore dos PIDs que o daemon rastreia, e a
 * segunda pede memória, CPU acumulada e comando **só dos processos da árvore** — dezenas,
 * e não as centenas da máquina. Um processo que some entre as duas passadas não volta:
 * a segunda só devolve quem ainda existe.
 */
export interface ProcessRow {
  pid: number;
  ppid: number;
  rssBytes: number;
  /** CPU **acumulada** do processo (usuário mais sistema), em segundos. */
  cpuSeconds: number;
  /** O nome do executável — no macOS o caminho inteiro, no Linux o `comm` do kernel. */
  command: string;
}

/**
 * Lê a árvore de quem desce de `roots` (os PIDs rastreados, eles inclusive). Uma raiz que
 * já morreu não aparece; o que a leitura devolve pode ter mais linhas do que o necessário,
 * mas nunca uma de fora da árvore que ela conhece.
 */
export type ProcessTableReader = (roots: readonly number[]) => Promise<readonly ProcessRow[]>;

/** Um elo da primeira passada: de quem o processo é filho. */
interface ParentLink {
  pid: number;
  ppid: number;
}

/** O que a leitura pede ao sistema: separado para a suíte gravar as saídas em vez de rodá-las. */
export interface ProcessTableHost {
  platform: NodeJS.Platform;
  exec(command: string, args: readonly string[]): Promise<string>;
  readdir(path: string): Promise<string[]>;
  /** `null` quando o arquivo não existe — um processo some entre o `readdir` e a leitura. */
  read(path: string): Promise<string | null>;
}

/** O `CLK_TCK` de todo Linux que roda Node: `utime` e `stime` vêm em centésimos de segundo. */
const CLOCK_TICKS_PER_SECOND = 100;

/**
 * `[[dd-]hh:]mm:ss[.cc]` para segundos, ou `null` se não for isso.
 *
 * Arredondado em centésimos: é a resolução do `ps`, e é o que faz `45.67 + 7380` dar
 * o `7425.67` que a pessoa leu, e não um decimal de ponto flutuante.
 */
function parseCpuTime(text: string): number | null {
  const match = /^(?:(\d+)-)?([\d:]+(?:\.\d+)?)$/.exec(text);
  if (match === null) return null;
  const days = Number(match[1] ?? 0);
  const fields = (match[2] ?? "").split(":").map(Number);
  if (fields.some((field) => Number.isNaN(field))) return null;
  let seconds = 0;
  for (const field of fields) seconds = seconds * 60 + field;
  return Math.round((days * 86_400 + seconds) * 100) / 100;
}

/** A saída de `ps -A -o pid=,ppid=` (a primeira passada no macOS): dois números por linha. */
function parsePsLinks(output: string): ParentLink[] {
  const links: ParentLink[] = [];
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (match !== null) links.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return links;
}

/** Os PIDs de `roots` e de todos que descem deles, dentre os `links` que existem agora. */
function treeOf(links: readonly ParentLink[], roots: readonly number[]): number[] {
  const alive = new Set<number>();
  const childrenOf = new Map<number, number[]>();
  for (const { pid, ppid } of links) {
    alive.add(pid);
    const siblings = childrenOf.get(ppid);
    if (siblings === undefined) childrenOf.set(ppid, [pid]);
    else siblings.push(pid);
  }
  // Com `seen`, o `ppid` que volta (o pid 0 é pai de si mesmo no macOS) não vira um laço.
  const seen = new Set<number>();
  const queue = roots.filter((pid) => alive.has(pid));
  for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    queue.push(...(childrenOf.get(pid) ?? []));
  }
  return [...seen];
}

/**
 * A saída de `ps -o pid=,ppid=,rss=,time=,comm= -p <pids>` (a segunda passada no macOS).
 *
 * `comm` é a **última** coluna de propósito: no macOS ele é o caminho do executável, e
 * `/Applications/Google Drive.app/…/Google Drive` tem espaço. Tudo depois dos quatro
 * números é o comando. Linha que não tem essa forma é ignorada, e não derruba a tabela.
 */
function parsePs(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (match === null) continue;
    const cpuSeconds = parseCpuTime(match[4] ?? "");
    if (cpuSeconds === null) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      // O `ps` do macOS dá o `rss` em kB.
      rssBytes: Number(match[3]) * 1024,
      cpuSeconds,
      command: match[5] ?? "",
    });
  }
  return rows;
}

/**
 * `/proc/<pid>/stat`: `pid (comm) estado ppid … utime stime …`.
 *
 * O `comm` fica entre parênteses e pode ter espaço e parêntese dentro (`tmux: server`),
 * então o corte é no **último** `)`: o que vem depois tem campos fixos. Nesse resto o
 * índice 1 é o `ppid`, e 11 e 12 são `utime` e `stime`.
 */
function parseProcStat(stat: string): { ppid: number; cpuSeconds: number; command: string } | null {
  const open = stat.indexOf("(");
  const close = stat.lastIndexOf(")");
  if (open === -1 || close === -1) return null;
  const rest = stat.slice(close + 2).trim().split(/\s+/);
  const ppid = Number(rest[1]);
  const ticks = Number(rest[11]) + Number(rest[12]);
  if (Number.isNaN(ppid) || Number.isNaN(ticks)) return null;
  return {
    ppid,
    cpuSeconds: ticks / CLOCK_TICKS_PER_SECOND,
    command: stat.slice(open + 1, close),
  };
}

/** `VmRSS:` de `/proc/<pid>/status`, em bytes. Thread do kernel não tem a linha: zero. */
function parseProcRss(status: string): number {
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
  return match === null ? 0 : Number(match[1]) * 1024;
}

/**
 * No Linux o `stat` já traz o elo, a CPU e o comando: a primeira passada lê só ele, de
 * todos; o `status` (só para a memória) é da segunda, e só de quem está na árvore.
 */
async function readProc(host: ProcessTableHost, roots: readonly number[]): Promise<ProcessRow[]> {
  const everyone: (ParentLink & { cpuSeconds: number; command: string })[] = [];
  for (const entry of await host.readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await host.read(`/proc/${entry}/stat`);
    if (stat === null) continue;
    const parsed = parseProcStat(stat);
    if (parsed !== null) everyone.push({ pid: Number(entry), ...parsed });
  }

  const inTree = new Set(treeOf(everyone, roots));
  const rows: ProcessRow[] = [];
  for (const entry of everyone) {
    if (!inTree.has(entry.pid)) continue;
    const status = await host.read(`/proc/${entry.pid}/status`);
    // Sem `status` o processo morreu entre as duas passadas. Thread do kernel **tem** o
    // arquivo, só não tem a linha de memória.
    if (status !== null) rows.push({ ...entry, rssBytes: parseProcRss(status) });
  }
  return rows;
}

/**
 * O `-x` na segunda passada **não muda quem volta** — o `-p` com ou sem ele devolve os mesmos
 * pids, de qualquer usuário e com ou sem terminal (medido com 103 pids) — e muda o custo: no
 * macOS, `ps -p a,b` (dois pids ou mais) sem `-x` gasta ~28 ms de CPU de sistema mesmo para 13
 * processos, e com ele ~2 ms. Um pid só não sofre disso, mas a árvore nunca é um só (o daemon e
 * a sessão já são dois). A razão é a medida, e não a página do `ps`: se um `ps` futuro mudar, quem cobra é a C61.
 */
async function readPs(host: ProcessTableHost, roots: readonly number[]): Promise<ProcessRow[]> {
  const tree = treeOf(parsePsLinks(await host.exec("ps", ["-A", "-o", "pid=,ppid="])), roots);
  // `ps -p` sem nenhum pid é erro, e uma árvore vazia não tem o que pedir.
  if (tree.length === 0) return [];
  return parsePs(await host.exec("ps", ["-x", "-o", "pid=,ppid=,rss=,time=,comm=", "-p", tree.join(",")]));
}

export function createProcessTableReader(host: ProcessTableHost = nodeProcessTableHost()): ProcessTableReader {
  return async (roots) => {
    if (host.platform === "darwin") return await readPs(host, roots);
    if (host.platform === "linux") return await readProc(host, roots);
    throw new Error(`não sei ler a tabela de processos em ${host.platform}`);
  };
}

/** A máquina de verdade. */
export function nodeProcessTableHost(): ProcessTableHost {
  return {
    platform: process.platform,
    exec: (command, args) =>
      new Promise((resolve, reject) => {
        // A tabela de uma máquina cheia passa do buffer padrão de 1 MB.
        execFile(command, [...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
          if (error === null) resolve(stdout);
          else reject(error);
        });
      }),
    readdir: (path) => readdir(path),
    read: async (path) => {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
  };
}
