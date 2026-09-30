import { describe, expect, it } from "vitest";

import { createProcessTableReader, type ProcessTableHost } from "./process-table.js";

/**
 * A tabela de processos, lida das duas máquinas (`038`, C51).
 *
 * As amostras abaixo são **gravadas**, e não escritas de cabeça: a de macOS é o
 * `ps -A -o pid=,ppid=,rss=,time=,comm=` desta máquina (nomes trocados por
 * curtos), com as duas armadilhas dela — o `comm` que é caminho **com espaço** e o
 * tempo de CPU em `m:ss.cc`; a de Linux é o formato de `/proc/<pid>/stat` e
 * `/proc/<pid>/status` do kernel, com o `comm` entre parênteses que pode ter
 * espaço e até parêntese dentro. Ler `stat` por `split(" ")` erra justamente o
 * processo que tem nome composto.
 */

const PS_DARWIN = `    1     0  18544   9:43.05 /sbin/launchd
  557     1  15072   7:17.89 /usr/libexec/logd
 2391     1  35808   2:54.82 /System/Applications/Siri AI.app/Contents/MacOS/Siri AI
 4242   557 182716 123:45.67 /opt/homebrew/bin/node
 4300  4242    240   0:00.02 /bin/zsh
`;

function host(overrides: Partial<ProcessTableHost>): ProcessTableHost {
  return {
    platform: "darwin",
    exec: async () => "",
    readdir: async () => [],
    read: async () => null,
    ...overrides,
  };
}

/** `/proc/4242`: um adaptador, 12,9 s de CPU (1234 + 56 ticks de 100 Hz) e 182 716 kB residentes. */
const STAT_4242 =
  "4242 (claude-agent-ac) S 4200 4242 4242 0 -1 4194560 8561 0 0 0 1234 56 0 0 20 0 11 0 5678901 1234567890 45678 18446744073709551615 4194304 4238788 140737488346384 0 0 0 0 4096 17 0 0 0 0 0 0 6336016 6337300 21389312 140737488351443 140737488351464 140737488351464 140737488351469 0\n";
const STATUS_4242 = `Name:\tclaude-agent-ac
Umask:\t0022
State:\tS (sleeping)
Tgid:\t4242
Pid:\t4242
PPid:\t4200
VmPeak:\t 1300000 kB
VmSize:\t 1204880 kB
VmRSS:\t  182716 kB
Threads:\t11
`;

/** Um `comm` com espaço e parêntese, e 1,5 s de CPU: o caso em que o `split` erra. */
const STAT_77 =
  "77 (tmux: server (x)) S 1 77 77 0 -1 4194560 100 0 0 0 100 50 0 0 20 0 1 0 900 20000000 3000 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n";
const STATUS_77 = "Name:\ttmux: server\nVmRSS:\t    12000 kB\n";

/** Uma thread do kernel: sem `VmRSS` nenhum, e o processo some de verdade no meio. */
const STAT_2 = "2 (kthreadd) S 0 0 0 0 -1 2129984 0 0 0 0 0 3 0 0 20 0 1 0 2 0 0 18446744073709551615 0 0 0 0 0 0 0 2147483647 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n";
const STATUS_2 = "Name:\tkthreadd\nState:\tS (sleeping)\n";

describe("process table", () => {
  it("reads ps on darwin and proc on linux", async () => {
    const asked: string[] = [];
    const darwin = createProcessTableReader(
      host({
        platform: "darwin",
        exec: async (command, args) => {
          asked.push([command, ...args].join(" "));
          return PS_DARWIN;
        },
      }),
    );

    expect(await darwin()).toEqual([
      { pid: 1, ppid: 0, rssBytes: 18_544 * 1024, cpuSeconds: 583.05, command: "/sbin/launchd" },
      { pid: 557, ppid: 1, rssBytes: 15_072 * 1024, cpuSeconds: 437.89, command: "/usr/libexec/logd" },
      {
        pid: 2391,
        ppid: 1,
        rssBytes: 35_808 * 1024,
        cpuSeconds: 174.82,
        command: "/System/Applications/Siri AI.app/Contents/MacOS/Siri AI",
      },
      { pid: 4242, ppid: 557, rssBytes: 182_716 * 1024, cpuSeconds: 7425.67, command: "/opt/homebrew/bin/node" },
      { pid: 4300, ppid: 4242, rssBytes: 240 * 1024, cpuSeconds: 0.02, command: "/bin/zsh" },
    ]);
    expect(asked).toEqual(["ps -A -o pid=,ppid=,rss=,time=,comm="]);

    const files = new Map([
      ["/proc/4242/stat", STAT_4242],
      ["/proc/4242/status", STATUS_4242],
      ["/proc/77/stat", STAT_77],
      ["/proc/77/status", STATUS_77],
      ["/proc/2/stat", STAT_2],
      ["/proc/2/status", STATUS_2],
    ]);
    const linux = createProcessTableReader(
      host({
        platform: "linux",
        // Entradas que não são processo (`self`, `cpuinfo`) e um pid que sumiu
        // entre o `readdir` e a leitura (`999`): nenhum deles derruba a tabela.
        readdir: async () => ["2", "77", "4242", "self", "cpuinfo", "999"],
        read: async (path) => files.get(path) ?? null,
      }),
    );

    expect(await linux()).toEqual([
      { pid: 2, ppid: 0, rssBytes: 0, cpuSeconds: 0.03, command: "kthreadd" },
      { pid: 77, ppid: 1, rssBytes: 12_000 * 1024, cpuSeconds: 1.5, command: "tmux: server (x)" },
      { pid: 4242, ppid: 4200, rssBytes: 182_716 * 1024, cpuSeconds: 12.9, command: "claude-agent-ac" },
    ]);
  });

  it("refuses a platform it cannot read", async () => {
    const win = createProcessTableReader(host({ platform: "win32" }));

    await expect(win()).rejects.toThrow(/win32/);
  });
});
