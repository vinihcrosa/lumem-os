/**
 * Quanto custa medir a árvore de processos (`038`, C61).
 *
 *     pnpm measure:resources                    os passos, um depois do outro
 *     pnpm measure:resources --only <passo>     um só
 *
 * Passos: `ten-sessions`.
 *
 * É o experimento 3 da fase 0 virado gate: a meta era *"medir a árvore a cada 3 s com
 * 10 sessões abertas custa menos de 1% de CPU do daemon"* — hoje a cada 5 s (o C61, 2026-09-30) —, e um número escrito num
 * documento envelhece sem ninguém notar. Aqui o número é **medido**, e o script sai 0
 * só abaixo do limite.
 *
 * **O que se mede.** Este processo faz o papel do daemon: um `PtyManager` e um
 * `AcpManager` de verdade, com dez sessões abertas — cinco agentes (o ACP falso do e2e,
 * um `node` de verdade por sessão, sem gastar um token) e cinco shells —, e o amostrador
 * de recursos de produção lendo a tabela **de verdade** (`ps` no macOS, `/proc` no
 * Linux). Uma amostra por vez, a cada `SAMPLE_INTERVAL_MS` (5 s), exatamente o caminho que o relógio do
 * amostrador percorre — no macOS, as **duas** passadas do `ps`: os elos da máquina inteira
 * e depois só a árvore (ver `process-table.ts`).
 *
 * **O que conta como custo** são as duas CPUs que a leitura gasta: a deste processo
 * (`process.cpuUsage` em volta de cada amostra, que já inclui lançar o `ps` e ler a
 * saída) e a dos `ps`, que rodam **fora** dele — o Node não enxerga a CPU de um filho, e
 * o macOS não a dá de outro jeito, então ela é medida à parte com o `time -p` do sistema — em
 * lote de 50 amostras, porque o `time` trunca cada leitura para 10 ms (ver `cpuOfTimeOutput`).
 * O que se repete no lote são **os comandos que a última leitura de fato lançou** (gravados no
 * `exec` do leitor, com os PIDs da árvore de verdade), e não uma cópia escrita aqui: se a
 * leitura mudar, a medida muda junto.
 * No Linux a leitura é do próprio processo, e não há filho.
 *
 * **Por que amostra a amostra, e não o processo inteiro numa janela.** Um processo
 * `tsx` parado gasta 0,6% a 0,9% de CPU só por existir (medido: nenhum código nosso
 * rodando), e um número que carrega essa linha de base seria ruído maior que o sinal.
 * Medir só o que a amostra gasta deixa a linha de base de fora — que é onde ela
 * pertence: o daemon de verdade não roda sob `tsx`.
 *
 * **E recusa medir nada** quando não viu as dez sessões ou quando não conseguiu medir o
 * `ps`: saída 2, e não 0 — um script que passa porque a medição ficou vazia é o teste
 * verde que não testa.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AcpManager } from "../acp/AcpManager.js";
import { openTestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createLiveResources } from "../resources/live.js";
import {
  createProcessTableReader,
  nodeProcessTableHost,
  type ProcessTableReader,
} from "../resources/process-table.js";
import { SAMPLE_INTERVAL_MS } from "../resources/sample.js";

/** O limite da meta: 1% de um núcleo. */
export const LIMIT_PERCENT = 1;

/** Dez amostras: sobra para a primeira, fria, não pesar na média. */
const SAMPLES = 10;
const AGENTS = 5;
const SHELLS = 5;

const FAKE_AGENT = fileURLToPath(new URL("../../../../e2e/support/fake-acp-agent.mjs", import.meta.url));

export interface Measurement {
  samples: number;
  intervalMs: number;
  /** A CPU deste processo em todas as amostras, em ms. */
  nodeCpuMs: number;
  /** A CPU dos `ps` lançados, em ms; `0` onde a leitura não lança filho, `null` se não deu para medir. */
  childCpuMs: number | null;
  /** Só para ler: o tempo de parede de cada amostra, o que o `ps` demora numa máquina ocupada. */
  wallMs: number;
  /** Linhas que a última leitura devolveu: a árvore do Lumem, e não a máquina inteira. */
  processes: number;
}

/** A CPU gasta por amostra, em ms, ou `null` quando faltou medir o filho. */
export function costPerSampleMs({ samples, nodeCpuMs, childCpuMs }: Measurement): number | null {
  return childCpuMs === null ? null : (nodeCpuMs + childCpuMs) / samples;
}

/** O custo como parte de um núcleo, em %: uma amostra a cada `intervalMs`. */
export function costPercent(measurement: Measurement): number | null {
  const perSample = costPerSampleMs(measurement);
  return perSample === null ? null : (perSample / measurement.intervalMs) * 100;
}

/**
 * `ok` abaixo do limite, `over` no limite ou acima, e `invalid` quando a medição não
 * mediu — o filho ficou sem medida, ou as dez sessões não estavam na árvore.
 */
export function verdictOf(measurement: Measurement, sawSessions: boolean): "ok" | "over" | "invalid" {
  const percent = costPercent(measurement);
  if (!sawSessions || percent === null) return "invalid";
  return percent < LIMIT_PERCENT ? "ok" : "over";
}

/** Quantas amostras (todas as passadas do `ps` de uma leitura) rodam dentro de **uma** medição do `time -p`. */
const PS_RUNS = 50;

/**
 * `user` mais `sys` do que o `time -p` imprime, em ms, ou `null` se a saída não é essa.
 *
 * O `time` do sistema **trunca** cada um dos dois para centésimos de segundo (`tv_usec / 10000`):
 * um `ps` de 5 ms de usuário e 20 de sistema sai `0.00` e `0.02`. Medido sozinho, cada `ps` perde
 * em média ~10 ms — a metade do custo dele — e o número sai bom demais (0,4–0,6% onde o custo real
 * é ~0,9%, com a mesma tabela). Por isso o `ps` é medido **em lote** (ver `childCpuOfPsMs`).
 */
export function cpuOfTimeOutput(stderr: string): number | null {
  const user = /^user\s+([\d.]+)/m.exec(stderr)?.[1];
  const system = /^sys\s+([\d.]+)/m.exec(stderr)?.[1];
  if (user === undefined || system === undefined) return null;
  return (Number(user) + Number(system)) * 1000;
}

/** Um argumento entre aspas simples, para o `sh` que repete o comando. */
const quoted = (argument: string): string => `'${argument.replaceAll("'", "'\\''")}'`;

/**
 * Quanto de CPU os `ps` **de uma amostra** gastam, em ms, medido pelo `time -p` do sistema
 * sobre `PS_RUNS` repetições seguidas de **todos** os `commands` dentro de um `sh`: a truncagem
 * do `time` (10 ms) cai uma vez sobre o lote, e dividida por 50 some — cada `ps` sozinho
 * perderia ~10 ms do que gasta. A saída dos `ps` vai para o pipe deste processo, como no
 * daemon, e não para `/dev/null`.
 *
 * `null` quando não há comando a repetir, ou a saída do `time` não é a que se espera (não há
 * `/usr/bin/time` na máquina).
 */
async function childCpuOfPsMs(commands: readonly (readonly string[])[]): Promise<number | null> {
  if (commands.length === 0) return null;
  const once = commands.map((command) => command.map(quoted).join(" ")).join("; ");
  const loop = `i=0; while [ "$i" -lt ${String(PS_RUNS)} ]; do ${once}; i=$((i+1)); done`;
  const stderr = await new Promise<string | null>((done) => {
    execFile(
      "/usr/bin/time",
      ["-p", "/bin/sh", "-c", loop],
      { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
      (error, _stdout, output) => {
        done(error === null ? output : null);
      },
    );
  });
  const total = stderr === null ? null : cpuOfTimeOutput(stderr);
  return total === null ? null : total / PS_RUNS;
}

/** O custo de uma amostra, multiplicado pelas `samples` amostras: o que `Measurement.childCpuMs` guarda. */
const perSampleOrNull = (psMs: number | null, samples: number): number | null =>
  psMs === null ? null : psMs * samples;

async function tenSessions(): Promise<{ measurement: Measurement; sawSessions: boolean }> {
  const cwd = mkdtempSync(join(tmpdir(), "lumem-measure-"));
  const database = openTestDb();
  const ptyManager = new PtyManager();
  const acpManager = new AcpManager({ isAvailable: () => true });

  try {
    for (let index = 0; index < AGENTS; index += 1) {
      await acpManager.spawn({ command: process.execPath, args: [FAKE_AGENT], cwd });
    }
    for (let index = 0; index < SHELLS; index += 1) {
      ptyManager.spawn({ command: "/bin/sh", args: ["-c", "sleep 3600"], cwd });
    }

    // O `exec` do leitor grava o que lança: o que o lote do `time` repete é isso, com os PIDs
    // da árvore de verdade, e não um `ps` que este arquivo escreveu por conta própria.
    const host = nodeProcessTableHost();
    let launched: string[][] = [];
    const reader = createProcessTableReader({
      ...host,
      exec: (command, args) => {
        launched.push([command, ...args]);
        return host.exec(command, args);
      },
    });
    let processes = 0;
    let lastRead: string[][] = [];
    const read: ProcessTableReader = async (roots) => {
      launched = [];
      const table = await reader(roots);
      lastRead = launched;
      processes = table.length;
      return table;
    };
    const sampler = createLiveResources({ db: database.db, ptyManager, acpManager, read });

    // A leitura fria (o primeiro `ps` da máquina paga cache) fica fora da conta, e os
    // filhos assentam o que iniciar custa: o handshake, o `sleep`.
    await sampler.resources();
    sampler.stop();
    await sleep(SAMPLE_INTERVAL_MS);

    let nodeCpuMs = 0;
    let wallMs = 0;
    let seen = await sampler.resources();
    for (let index = 0; index < SAMPLES; index += 1) {
      await sleep(SAMPLE_INTERVAL_MS);
      // `stop` antes: cada `resources()` percorre o caminho inteiro de uma amostra — ler,
      // atribuir, rotular —, que é o que o relógio faz a cada tique.
      sampler.stop();
      const cpuBefore = process.cpuUsage();
      const startedAt = performance.now();
      seen = await sampler.resources();
      wallMs += performance.now() - startedAt;
      const cpu = process.cpuUsage(cpuBefore);
      nodeCpuMs += (cpu.user + cpu.system) / 1000;
    }
    sampler.stop();

    return {
      measurement: {
        samples: SAMPLES,
        intervalMs: SAMPLE_INTERVAL_MS,
        nodeCpuMs,
        // No Linux a leitura é `/proc`, dentro deste processo: não há filho para somar.
        childCpuMs: process.platform === "darwin" ? perSampleOrNull(await childCpuOfPsMs(lastRead), SAMPLES) : 0,
        wallMs,
        processes,
      },
      // As dez sessões estão na árvore: dos dois lados, alguém gasta memória.
      sawSessions: seen.groups.agents.rssBytes > 0 && seen.groups.terminals.rssBytes > 0,
    };
  } finally {
    await acpManager.killAll();
    await ptyManager.killAll();
    database.cleanup();
    rmSync(cwd, { recursive: true, force: true });
  }
}

const STEP_NAMES = ["ten-sessions"] as const;
type StepName = (typeof STEP_NAMES)[number];

const format = (value: number, digits = 1): string => value.toFixed(digits).replace(".", ",");

/** Roda um passo e devolve o código de saída: 0 abaixo do limite, 1 acima, 2 sem medir. */
async function run(name: StepName): Promise<number> {
  console.log(
    `\n▸ ${name}: ${String(AGENTS)} agentes e ${String(SHELLS)} shells, uma amostra a cada ${String(SAMPLE_INTERVAL_MS / 1000)} s`,
  );
  const { measurement, sawSessions } = await tenSessions();
  const percent = costPercent(measurement);

  console.log(`  ${String(measurement.samples)} amostras, numa árvore de ${String(measurement.processes)} processos`);
  console.log(
    `  CPU por amostra: ${format(measurement.nodeCpuMs / measurement.samples, 2)} ms do daemon` +
      (measurement.childCpuMs === null
        ? ", ps sem medida"
        : ` + ${format(measurement.childCpuMs / measurement.samples, 2)} ms do ps`),
  );
  console.log(`  (parede: ${format(measurement.wallMs / measurement.samples)} ms por amostra, numa máquina ocupada)`);

  if (verdictOf(measurement, sawSessions) === "invalid" || percent === null) {
    console.error(
      sawSessions
        ? "  a medição não mediu: o CPU do ps não pôde ser lido (falta /usr/bin/time?)."
        : "  a medição não mediu: o amostrador não viu as dez sessões.",
    );
    return 2;
  }
  console.log(`  custo: ${format(percent, 2)}% de um núcleo (limite: ${String(LIMIT_PERCENT)}%)`);
  const ok = verdictOf(measurement, sawSessions) === "ok";
  console.log(ok ? "  ✓ dentro do limite" : "  ✗ acima do limite");
  return ok ? 0 : 1;
}

function chosenSteps(argv: readonly string[]): StepName[] {
  const at = argv.indexOf("--only");
  if (at === -1) return [...STEP_NAMES];
  const wanted = argv[at + 1];
  const known = STEP_NAMES.find((name) => name === wanted);
  if (known === undefined) {
    console.error(`passo desconhecido: ${wanted ?? "(nenhum)"}. Os passos: ${STEP_NAMES.join(", ")}.`);
    process.exit(2);
  }
  return [known];
}

async function main(): Promise<void> {
  let worst = 0;
  for (const name of chosenSteps(process.argv.slice(2))) worst = Math.max(worst, await run(name));
  process.exit(worst);
}

// Só como programa: os testes importam `verdictOf` sem rodar dez sessões.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
