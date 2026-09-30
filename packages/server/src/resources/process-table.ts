import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

/**
 * A tabela de processos da máquina (`038`, Parte 3).
 *
 * Sem dependência nativa nova (ADR de 2026-08-30): no macOS é uma chamada ao `ps`, e
 * no Linux são dois arquivos por processo em `/proc`. Cada um vira a mesma linha, e é
 * o que o resto de `resources/` conhece — quem atribui e quem amostra não sabem de
 * qual sistema ela veio.
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

export type ProcessTableReader = () => Promise<readonly ProcessRow[]>;

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

/**
 * A saída de `ps -A -o pid=,ppid=,rss=,time=,comm=`.
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

async function readProc(host: ProcessTableHost): Promise<ProcessRow[]> {
  const rows: ProcessRow[] = [];
  for (const entry of await host.readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await host.read(`/proc/${entry}/stat`);
    if (stat === null) continue;
    const parsed = parseProcStat(stat);
    if (parsed === null) continue;
    const status = (await host.read(`/proc/${entry}/status`)) ?? "";
    rows.push({ pid: Number(entry), rssBytes: parseProcRss(status), ...parsed });
  }
  return rows;
}

export function createProcessTableReader(host: ProcessTableHost = nodeProcessTableHost()): ProcessTableReader {
  return async () => {
    if (host.platform === "darwin") {
      return parsePs(await host.exec("ps", ["-A", "-o", "pid=,ppid=,rss=,time=,comm="]));
    }
    if (host.platform === "linux") return await readProc(host);
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
