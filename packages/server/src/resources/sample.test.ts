import { describe, expect, it, vi } from "vitest";

import type { ProcessRow } from "./process-table.js";
import { createResourceSampler, type ResourceSamplerOptions } from "./sample.js";

/**
 * O amostrador de recursos (`038`, C46 e C48–C50).
 *
 * O relógio, o relógio de parede do intervalo e a leitura da tabela são de
 * mentira, e os três andam juntos: `advance` empurra o tempo e dispara o que estava
 * armado, na ordem, sem `sleep` e sem timer de verdade.
 */

const MB = 1024 * 1024;

const row = (pid: number, ppid: number, mb: number, cpuSeconds: number, command: string): ProcessRow => ({
  pid,
  ppid,
  rssBytes: mb * MB,
  cpuSeconds,
  command,
});

/** Nove processos: oito descem do daemon, um (o `Safari`) não. */
const TREE = (cpu: (pid: number) => number): ProcessRow[] => [
  row(100, 1, 200, cpu(100), "/opt/node/bin/node"), // o daemon
  row(200, 100, 50, cpu(200), "/opt/node/bin/claude-agent-acp"), // adaptador A
  row(201, 200, 400, cpu(201), "/opt/node/bin/node"),
  row(202, 201, 10, cpu(202), "/usr/bin/git"),
  row(300, 100, 60, cpu(300), "/opt/node/bin/codex-acp"), // adaptador B
  row(400, 100, 8, cpu(400), "/bin/zsh"), // um PTY
  row(401, 400, 30, cpu(401), "/usr/bin/vim"),
  row(402, 400, 120, cpu(402), "/opt/node/bin/node"),
  row(999, 1, 1000, cpu(999), "/Applications/Safari"),
];

const TRACKED = {
  daemonPid: 100,
  agents: [
    { pid: 200, sessionId: "ses-a" },
    { pid: 300, sessionId: "ses-b" },
  ],
  terminals: [{ pid: 400, sessionId: "ses-shell" }],
};

interface Harness {
  sampler: ReturnType<typeof createResourceSampler>;
  /** Quantas vezes a tabela de processos foi lida. */
  reads: () => number;
  advance(ms: number): Promise<void>;
  setNow(ms: number): void;
}

function harness(
  tables: (read: number) => ProcessRow[],
  overrides: Partial<ResourceSamplerOptions> = {},
): Harness {
  let clock = 0;
  let reads = 0;
  const armed = new Set<{ fn: () => void; ms: number; next: number }>();
  const sampler = createResourceSampler({
    read: async () => tables(reads++),
    tracked: () => TRACKED,
    describe: () => null,
    now: () => clock,
    every: (fn, ms) => {
      const timer = { fn, ms, next: clock + ms };
      armed.add(timer);
      return () => armed.delete(timer);
    },
    ...overrides,
  });
  return {
    sampler,
    reads: () => reads,
    setNow: (ms) => {
      clock = ms;
    },
    advance: async (ms) => {
      const end = clock + ms;
      for (;;) {
        const due = [...armed].filter((timer) => timer.next <= end).sort((a, b) => a.next - b.next)[0];
        if (due === undefined) break;
        clock = due.next;
        due.next += due.ms;
        due.fn();
        // A leitura é assíncrona: deixa a promessa da amostra assentar antes do próximo tique.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      clock = end;
    },
  };
}

describe("resource sampler", () => {
  it("groups the tree and keeps the five largest", async () => {
    // Cada processo gasta CPU a uma taxa fixa (em s por 5 s), e é a diferença entre
    // duas amostras que vira porcentagem — uma amostra só não tem CPU (AC 42).
    const perFiveSeconds: Record<number, number> = {
      100: 0.5, // 10,0%
      200: 0.25, // 5,0%
      201: 1, // 20,0%
      202: 0.05, // 1,0%
      300: 0.1, // 2,0%
      400: 0.05, // 1,0%
      401: 0.15, // 3,0%
      402: 0.3, // 6,0%
      999: 4, // fora de qualquer grupo
    };
    const { sampler, advance } = harness(
      (read) => TREE((pid) => 100 + read * (perFiveSeconds[pid] ?? 0)),
      { intervalMs: 5_000 },
    );

    await sampler.resources();
    await advance(5_000);
    const now = await sampler.resources();

    expect(now.groups).toEqual({
      daemon: { cpuPercent: 10, rssBytes: 200 * MB },
      // 200 + 201 + 202 + 300 = 5 + 20 + 1 + 2 por cento
      agents: { cpuPercent: 28, rssBytes: (50 + 400 + 10 + 60) * MB },
      // 400 + 401 + 402 = 1 + 3 + 6
      terminals: { cpuPercent: 10, rssBytes: (8 + 30 + 120) * MB },
    });
    // Cinco de oito, do maior para o menor; o `Safari` (1 GB) não desce do daemon.
    expect(now.top.map((entry) => [entry.pid, entry.rssBytes / MB])).toEqual([
      [201, 400],
      [100, 200],
      [402, 120],
      [300, 60],
      [200, 50],
    ]);

    // "Em uma casa decimal" (AC 40): os valores acima são inteiros, e `Math.round` os
    // acerta todos. Aqui cada taxa cai entre dois inteiros, e a soma do grupo também.
    const fractional: Record<number, number> = {
      100: 0.0777, // 1,554% -> 1,6
      200: 0.0123, // 0,246%
      201: 0.0234, // 0,468% -> 0,5
      202: 0.01, // 0,2%
      300: 0.0195, // 0,39%; o grupo soma 1,304% -> 1,3
      400: 0.0311, // 0,622%
      401: 0.0407, // 0,814%
      402: 0.02, // 0,4%; o grupo soma 1,836% -> 1,8
    };
    const rounded = harness(
      (read) => TREE((pid) => 100 + read * (fractional[pid] ?? 0)),
      { intervalMs: 5_000 },
    );

    await rounded.sampler.resources();
    await rounded.advance(5_000);
    const decimals = await rounded.sampler.resources();

    expect(decimals.groups).toEqual({
      daemon: { cpuPercent: 1.6, rssBytes: 200 * MB },
      agents: { cpuPercent: 1.3, rssBytes: (50 + 400 + 10 + 60) * MB },
      terminals: { cpuPercent: 1.8, rssBytes: (8 + 30 + 120) * MB },
    });
    expect(decimals.top.map((entry) => [entry.pid, entry.cpuPercent])).toEqual([
      [201, 0.5],
      [100, 1.6],
      [402, 0.4],
      [300, 0.4],
      [200, 0.2],
    ]);
  });

  it("computes cpu from the delta between samples", async () => {
    // Um processo com 1,0 s acumulado, e 1,5 s cinco segundos depois: 0,5 / 5 = 10,0%.
    const only = (cpu: number): ProcessRow[] => [row(100, 1, 200, cpu, "/opt/node/bin/node")];
    const seconds = [1.0, 1.5];
    const { sampler, advance } = harness((read) => only(seconds[read] ?? 1.5), { intervalMs: 5_000 });

    const first = await sampler.resources();
    expect(first.top[0]).toMatchObject({ pid: 100, cpuPercent: null });
    expect(first.groups.daemon.cpuPercent).toBeNull();

    await advance(5_000);
    const second = await sampler.resources();
    expect(second.top[0]).toMatchObject({ pid: 100, cpuPercent: 10 });
    expect(second.groups.daemon.cpuPercent).toBe(10);
  });

  it("reports a process born between samples as null, and not as a spike", async () => {
    const tables = (read: number): ProcessRow[] => [
      row(100, 1, 200, 1 + read, "/opt/node/bin/node"),
      ...(read >= 1 ? [row(101, 100, 10, 50, "/usr/bin/git")] : []),
    ];
    const { sampler, advance } = harness(tables);

    await sampler.resources();
    await advance(3_000);
    const second = await sampler.resources();

    // O `git` já chegou com 50 s acumulados: sem amostra anterior, não há taxa.
    expect(second.top.find((entry) => entry.pid === 101)?.cpuPercent).toBeNull();
    expect(second.top.find((entry) => entry.pid === 100)?.cpuPercent).toBeCloseTo(33.3, 1);
  });

  it("stops sampling when nobody asks", async () => {
    const { sampler, advance, reads, setNow } = harness(() => TREE(() => 0));

    await sampler.resources();
    expect(reads()).toBe(1);

    // Quem olha continua olhando: o tique de 3 s lê.
    await advance(9_000);
    const whileWatched = reads();
    expect(whileWatched).toBeGreaterThan(1);

    // Ninguém pergunta por 15 s: o daemon deixa de ler a tabela, e continua sem ler.
    await advance(15_000);
    const afterQuiet = reads();
    await advance(60_000);
    expect(reads()).toBe(afterQuiet);

    // A próxima pergunta volta a ler.
    setNow(200_000);
    await sampler.resources();
    expect(reads()).toBe(afterQuiet + 1);
  });

  it("starts from a clean slate after it stopped", async () => {
    // A taxa entre duas leituras com minutos no meio é a média de outra coisa: a
    // primeira amostra depois da pausa volta a ser a primeira.
    const only = (read: number): ProcessRow[] => [row(100, 1, 200, 10 * read, "/opt/node/bin/node")];
    const { sampler, advance, setNow } = harness(only);

    await sampler.resources();
    await advance(60_000);
    setNow(120_000);
    const again = await sampler.resources();

    expect(again.top[0]).toMatchObject({ pid: 100, cpuPercent: null });
  });

  it("labels the top processes by session and checkout", async () => {
    // Cinco processos, todos no `top`: o adaptador e o PTY com sessão, o adaptador
    // sem descrição, e dois que nunca foram sessão — o daemon e um filho do PTY.
    const small = (): ProcessRow[] => [
      row(100, 1, 200, 0, "/opt/node/bin/node"),
      row(200, 100, 50, 0, "/opt/node/bin/claude-agent-acp"),
      row(300, 100, 40, 0, "/opt/node/bin/codex-acp"),
      row(400, 100, 30, 0, "/bin/zsh"),
      row(401, 400, 20, 0, "/usr/bin/vim"),
    ];
    const { sampler } = harness(small, {
      describe: (root) => {
        if (root.sessionId === "ses-a") return { title: "Claude", checkout: "lumem-os/bandung" };
        if (root.sessionId === "ses-shell") return { title: "Terminal", checkout: "lumem-os/bandung" };
        return null;
      },
    });

    const { top } = await sampler.resources();
    const labelOf = (pid: number) => top.find((entry) => entry.pid === pid)?.label;

    // O adaptador e o PTY: o nome da sessão e o do checkout.
    expect(labelOf(200)).toBe("Claude · lumem-os/bandung");
    expect(labelOf(400)).toBe("Terminal · lumem-os/bandung");
    // O adaptador B não diz quem é: cai no nome do comando, e não some.
    expect(labelOf(300)).toBe("codex-acp");
    // Sem sessão — o daemon e o filho do PTY —: o nome do comando, sem caminho.
    expect(labelOf(100)).toBe("node");
    expect(labelOf(401)).toBe("vim");
  });

  it("names the session alone when the checkout is unknown", async () => {
    const { sampler } = harness(() => TREE(() => 0), {
      describe: (root) => (root.sessionId === "ses-a" ? { title: "Claude", checkout: null } : null),
    });
    // (o adaptador A tem 50 MB e é o quinto maior)

    const { top } = await sampler.resources();

    expect(top.find((entry) => entry.pid === 200)?.label).toBe("Claude");
  });

  it("rates only what two readings can rate, from any clock", async () => {
    // Uma amostra na mão de quem testa, com o relógio longe do zero: `agora − antes` só é a
    // diferença quando `antes` não é 0. Cada pid conta uma história da CPU dele.
    let tick: () => void = () => undefined;
    let clock = 1_000_000;
    const tables = [
      [row(100, 1, 200, 10, "/opt/node/bin/node"), row(101, 100, 9, 5, "/usr/bin/git"), row(102, 100, 8, 7, "/usr/bin/a")],
      [row(100, 1, 200, 10.5, "/opt/node/bin/node"), row(101, 100, 9, 5, "/usr/bin/git"), row(102, 100, 8, 6, "/usr/bin/a")],
      [row(100, 1, 200, 11, "/opt/node/bin/node"), row(101, 100, 9, 5, "/usr/bin/git"), row(102, 100, 8, 9, "/usr/bin/a")],
    ];
    const { sampler } = harness((read) => tables[read] ?? tables[2]!, {
      now: () => clock,
      every: (fn) => {
        tick = fn;
        return () => undefined;
      },
    });
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
    const rates = async () =>
      Object.fromEntries((await sampler.resources()).top.map((entry) => [entry.pid, entry.cpuPercent]));

    await sampler.resources();

    // 5 s depois: 0,5 s de CPU no `node` são 10,0%; o `git` não gastou nada, e **0%** é uma
    // medida (ele não é `null`); e o pid 102 voltou com CPU **menor** — outro processo no
    // mesmo número —, então não há taxa.
    clock += 5_000;
    tick();
    await settle();
    expect(await rates()).toEqual({ 100: 10, 101: 0, 102: null });

    // Duas leituras no mesmo instante: não há intervalo para dividir, e nada vira `Infinity`.
    tick();
    await settle();
    expect(await rates()).toEqual({ 100: null, 101: null, 102: null });
  });

  it("stops reading exactly when nobody asked for the whole idle window", async () => {
    let tick: () => void = () => undefined;
    let disarmed = 0;
    let clock = 1_000;
    const { sampler, reads } = harness(() => TREE(() => 0), {
      now: () => clock,
      every: (fn) => {
        tick = fn;
        return () => {
          disarmed += 1;
        };
      },
    });
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

    await sampler.resources();
    expect(reads()).toBe(1);

    // Um milissegundo antes dos 15 s de silêncio: ainda lê.
    clock = 1_000 + 15_000 - 1;
    tick();
    await settle();
    expect(reads()).toBe(2);
    expect(disarmed).toBe(0);

    // Nos 15 s: para, sem ler.
    clock = 1_000 + 15_000;
    tick();
    await settle();
    expect(reads()).toBe(2);
    expect(disarmed).toBe(1);
  });

  it("breaks a tie in size by the lower pid", async () => {
    const tie = (order: number[]): ProcessRow[] => [
      row(100, 1, 200, 0, "/opt/node/bin/node"),
      ...order.map((pid) => row(pid, 100, 50, 0, "/usr/bin/git")),
    ];

    for (const order of [[401, 402, 403], [403, 402, 401]]) {
      const { sampler } = harness(() => tie(order));
      const { top } = await sampler.resources();
      expect(top.map((entry) => entry.pid)).toEqual([100, 401, 402, 403]);
    }
  });

  it("arms one clock when two first questions arrive together", async () => {
    // O painel e o ícone perguntam juntos no boot: as duas esperam a mesma leitura e voltam juntas.
    // Um relógio armado por cima do outro deixa o primeiro sem quem o desarme, lendo para sempre.
    let armed = 0;
    let disarmed = 0;
    const { sampler } = harness(() => TREE(() => 0), {
      every: () => {
        armed += 1;
        return () => {
          disarmed += 1;
        };
      },
    });

    await Promise.all([sampler.resources(), sampler.resources()]);
    expect(armed).toBe(1);

    sampler.stop();
    expect(disarmed).toBe(armed);
  });

  it("ticks on a real interval when none is injected, and stop clears it", async () => {
    // O relógio de produção: um `setInterval` de verdade (aqui, o falso do vitest), e `stop` o desarma.
    vi.useFakeTimers();
    try {
      let reads = 0;
      const sampler = createResourceSampler({
        read: async () => {
          reads += 1;
          return TREE(() => 0);
        },
        tracked: () => TRACKED,
        describe: () => null,
      });

      await sampler.resources();
      expect(reads).toBe(1);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reads).toBe(2);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reads).toBe(3);

      sampler.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(reads).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks the reader only for the pids the daemon tracks, and attributes with the same answer", async () => {
    const asked: (readonly number[])[] = [];
    const { sampler } = harness(() => TREE(() => 0), {
      read: async (roots) => {
        asked.push(roots);
        return TREE(() => 0);
      },
    });

    const { groups } = await sampler.resources();

    // O daemon, os dois adaptadores e o PTY: os quatro que os managers sabem, e nada da máquina.
    expect(asked).toEqual([[100, 200, 300, 400]]);
    expect(groups.agents.rssBytes).toBe((50 + 400 + 10 + 60) * MB);
  });
});
