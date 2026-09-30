import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

/**
 * `lumem logs` (`038` Parte 1): o fim de `<stateDir>/daemon.log`, e com `-f` o que
 * for escrito depois.
 *
 * Lê o disco de verdade — o teste aponta para um arquivo temporário. O que
 * entra por parâmetro é o **relógio** (`sleep`) e a **interrupção**, porque é
 * neles que um `-f` sem fim deixaria de ser testável.
 */

export const LOG_TAIL_LINES = 200;

/** As últimas `count` linhas de `text`, sem a linha vazia que o `\n` final deixa. */
export function lastLines(text: string, count: number): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.slice(-count);
}

export interface LogsOptions {
  path: string;
  follow: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
  interrupt: AbortSignal;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
}

export async function logs({
  path,
  follow,
  out,
  err,
  interrupt,
  sleep,
  pollMs = 250,
}: LogsOptions): Promise<number> {
  let content: Buffer;
  try {
    content = readFileSync(path);
  } catch {
    err(`não achei o log do daemon em ${path}. O Lumem já subiu como serviço (\`lumem start\`)?`);
    return 1;
  }
  for (const line of lastLines(content.toString("utf8"), LOG_TAIL_LINES)) out(line);
  if (!follow) return 0;

  let offset = content.length;
  let carry = "";
  // Uma leitura pode terminar no meio de um caractere de dois bytes.
  const decoder = new StringDecoder("utf8");
  while (!interrupt.aborted) {
    await sleep(pollMs);
    const size = safeSize(path);
    // O arquivo encolheu: alguém o truncou ou o trocou. Recomeçar do início é o
    // que `tail -F` faz, e o contrário seria ficar mudo para sempre.
    if (size < offset) {
      offset = 0;
      carry = "";
    }
    if (size === offset) continue;

    carry += decoder.write(readRange(path, offset, size));
    offset = size;
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) out(line);
  }
  return 0;
}

function safeSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function readRange(path: string, start: number, end: number): Buffer {
  const buffer = Buffer.alloc(end - start);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  return buffer;
}
