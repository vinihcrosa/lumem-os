import { describe, expect, it } from "vitest";

import { createProcessTableReader, type ProcessTableHost } from "./process-table.js";

/**
 * A tabela de processos, lida das duas máquinas (`038`, C51).
 *
 * As amostras abaixo são **gravadas**, e não escritas de cabeça. As de macOS são as duas
 * passadas do `ps` desta máquina — `ps -A -o pid=,ppid=` (os elos) e `ps -x -o
 * pid=,ppid=,rss=,time=,comm= -p <pids>` (só a árvore; nomes trocados por curtos), com as
 * duas armadilhas dela: o `comm` que é caminho **com espaço** e o tempo de CPU em
 * `m:ss.cc`. A de Linux é o `/proc/<pid>/stat` e o
 * `/proc/<pid>/status` de um kernel Linux aarch64, gravados em 2026-09-30 num contêiner
 * `node:22-slim` (o `node` depois de 1,5 s de laço, e um `sleep` copiado para um
 * arquivo chamado `a b) (c`, o `comm` com espaço e parêntese) e, do `kthreadd`, num
 * `docker run --pid=host alpine:3` (uma thread do kernel, sem `VmRSS`). O `stat` está
 * inteiro; o `status` está cortado — o do `node` e o do `sleep` depois de `Threads`, o do
 * `kthreadd` depois de `Groups` —, sempre depois das linhas que o leitor usa: `PPid` e
 * `VmRSS`. Ler `stat` por `split(" ")` erra justamente o processo que tem nome composto.
 */

/** A primeira passada: a máquina inteira, dois números por linha. */
const PS_LINKS_DARWIN = `    1     0
  548     1
  557     1
 2391     1
 4242   557
 4300  4242
 4400  4300
 7000     1
`;

/** A segunda passada, como o `ps` a imprimiria para **todos** os pids acima que têm linha. */
const PS_DARWIN = `    1     0  18544   9:43.05 /sbin/launchd
  557     1  15072   7:17.89 /usr/libexec/logd
 2391     1  35808   2:54.82 /System/Applications/Siri AI.app/Contents/MacOS/Siri AI
 4242   557 182716 123:45.67 /opt/homebrew/bin/node
 4300  4242    240   0:00.02 /bin/zsh
 4400  4300   1200   0:00.10 /usr/bin/git
`;

/**
 * Um `ps` de mentira com as duas formas: a primeira passada devolve os elos, e a segunda
 * só as linhas de `PS_DARWIN` dos pids pedidos em `-p` — como o `ps` de verdade, que
 * imprime quem existe e cala sobre quem não.
 */
function psHost(calls: string[]): ProcessTableHost {
  return host({
    platform: "darwin",
    exec: async (command, args) => {
      calls.push([command, ...args].join(" "));
      const asked = args.indexOf("-p");
      if (asked === -1) return PS_LINKS_DARWIN;
      const pids = new Set((args[asked + 1] ?? "").split(","));
      return PS_DARWIN.split("\n")
        .filter((line) => pids.has(line.trim().split(/\s+/)[0] ?? ""))
        .map((line) => `${line}\n`)
        .join("");
    },
  });
}

function host(overrides: Partial<ProcessTableHost>): ProcessTableHost {
  return {
    platform: "darwin",
    exec: async () => "",
    readdir: async () => [],
    read: async () => null,
    ...overrides,
  };
}

/** `/proc/10`: o `node`, 1,52 s de CPU (151 + 1 ticks de 100 Hz) e 49 356 kB residentes. */
const STAT_10 =
  "10 (node) S 1 1 1 0 -1 4194560 2844 0 397 0 151 1 0 0 20 0 7 0 970 765280256 12307 18446744073709551615 4194304 107596645 281474847404160 0 0 0 0 16781312 83458 0 0 0 17 4 0 0 0 0 0 107726736 108007120 403988480 281474847407617 281474847407923 281474847407923 281474847408100 0\n";
const STATUS_10 = `Name:\tnode
Umask:\t0022
State:\tS (sleeping)
Tgid:\t10
Ngid:\t0
Pid:\t10
PPid:\t1
TracerPid:\t0
Uid:\t0\t0\t0\t0
Gid:\t0\t0\t0\t0
FDSize:\t64
Groups:\t0 
NStgid:\t10
NSpid:\t10
NSpgid:\t1
NSsid:\t1
Kthread:\t0
VmPeak:\t  812624 kB
VmSize:\t  747344 kB
VmLck:\t       0 kB
VmPin:\t       0 kB
VmHWM:\t   49356 kB
VmRSS:\t   49356 kB
RssAnon:\t    8832 kB
RssFile:\t   40524 kB
RssShmem:\t       0 kB
VmData:\t   51088 kB
VmStk:\t     132 kB
VmExe:\t  100980 kB
VmLib:\t    4380 kB
VmPTE:\t     548 kB
VmSwap:\t       0 kB
HugetlbPages:\t       0 kB
CoreDumping:\t0
THP_enabled:\t1
untag_mask:\t0xffffffffffffff
Threads:\t7
`;

/** `/proc/9`: um `comm` com espaço e parêntese — o caso em que o `split` erra — e 940 kB residentes. */
const STAT_9 =
  "9 (a b) (c) S 1 1 1 0 -1 4194304 113 0 0 0 0 0 0 0 20 0 1 0 970 2281472 235 18446744073709551615 187650137325568 187650137356368 281474676811344 0 0 0 0 6 0 1 0 0 17 1 0 0 0 0 0 187650137455760 187650137457272 187651209682944 281474676813617 281474676813633 281474676813633 281474676813803 0\n";
const STATUS_9 = `Name:\ta b) (c
Umask:\t0022
State:\tS (sleeping)
Tgid:\t9
Ngid:\t0
Pid:\t9
PPid:\t1
TracerPid:\t0
Uid:\t0\t0\t0\t0
Gid:\t0\t0\t0\t0
FDSize:\t64
Groups:\t0 
NStgid:\t9
NSpid:\t9
NSpgid:\t1
NSsid:\t1
Kthread:\t0
VmPeak:\t    2228 kB
VmSize:\t    2228 kB
VmLck:\t       0 kB
VmPin:\t       0 kB
VmHWM:\t     940 kB
VmRSS:\t     940 kB
RssAnon:\t       0 kB
RssFile:\t     940 kB
RssShmem:\t       0 kB
VmData:\t     220 kB
VmStk:\t     132 kB
VmExe:\t      32 kB
VmLib:\t    1744 kB
VmPTE:\t      44 kB
VmSwap:\t       0 kB
HugetlbPages:\t       0 kB
CoreDumping:\t0
THP_enabled:\t1
untag_mask:\t0xffffffffffffff
Threads:\t1
`;

/** `/proc/2`: uma thread do kernel, sem `VmRSS` nenhum e sem CPU de usuário nem de sistema. */
const STAT_2 =
  "2 (kthreadd) S 0 0 0 0 -1 2129984 0 0 0 0 0 0 0 0 20 0 1 0 0 0 0 18446744073709551615 0 0 0 0 0 0 0 2147483647 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n";
const STATUS_2 = `Name:\tkthreadd
Umask:\t0022
State:\tS (sleeping)
Tgid:\t2
Ngid:\t0
Pid:\t2
PPid:\t0
TracerPid:\t0
Uid:\t0\t0\t0\t0
Gid:\t0\t0\t0\t0
FDSize:\t64
Groups:\t 
`;

describe("process table", () => {
  it("reads ps on darwin and proc on linux", async () => {
    const asked: string[] = [];
    const darwin = createProcessTableReader(psHost(asked));

    // A tabela de 8 linhas tem quatro de fora: o `launchd` (pai dos dois), o `548` e o `7000`
    // (irmãos sem relação). Só descem do `logd` e do `Siri AI` os cinco abaixo, e são só
    // esses que a segunda passada pede.
    expect(await darwin([557, 2391])).toEqual([
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
      { pid: 4400, ppid: 4300, rssBytes: 1200 * 1024, cpuSeconds: 0.1, command: "/usr/bin/git" },
    ]);
    expect(asked).toEqual([
      "ps -A -o pid=,ppid=",
      "ps -x -o pid=,ppid=,rss=,time=,comm= -p 557,2391,4242,4300,4400",
    ]);

    const files = new Map([
      ["/proc/10/stat", STAT_10],
      ["/proc/10/status", STATUS_10],
      ["/proc/9/stat", STAT_9],
      ["/proc/9/status", STATUS_9],
      ["/proc/2/stat", STAT_2],
      ["/proc/2/status", STATUS_2],
    ]);
    const linux = createProcessTableReader(
      host({
        platform: "linux",
        // Entradas que não são processo (`self`, `cpuinfo`) e um pid que sumiu
        // entre o `readdir` e a leitura (`999`): nenhum deles derruba a tabela.
        readdir: async () => ["2", "9", "10", "self", "cpuinfo", "999"],
        read: async (path) => files.get(path) ?? null,
      }),
    );

    expect(await linux([2, 9, 10])).toEqual([
      { pid: 2, ppid: 0, rssBytes: 0, cpuSeconds: 0, command: "kthreadd" },
      { pid: 9, ppid: 1, rssBytes: 940 * 1024, cpuSeconds: 0, command: "a b) (c" },
      { pid: 10, ppid: 1, rssBytes: 49_356 * 1024, cpuSeconds: 1.52, command: "node" },
    ]);
  });

  it("asks the second ps pass only for the tree, never the whole machine", async () => {
    const asked: string[] = [];
    const darwin = createProcessTableReader(psHost(asked));

    // A raiz é o `node`: o `zsh` e o `git` descem dele, o `logd` (pai) e o resto, não.
    expect((await darwin([4242])).map((row) => row.pid)).toEqual([4242, 4300, 4400]);
    expect(asked[1]).toBe("ps -x -o pid=,ppid=,rss=,time=,comm= -p 4242,4300,4400");
    // A primeira passada não pede `rss`, `time` nem `comm`: é o que a torna barata.
    expect(asked[0]).toBe("ps -A -o pid=,ppid=");
  });

  it("leaves out a process that died between the two ps passes", async () => {
    const asked: string[] = [];
    const darwin = createProcessTableReader(
      host({
        platform: "darwin",
        exec: async (command, args) => {
          asked.push([command, ...args].join(" "));
          // Na primeira passada o `4300` existia; na segunda o `ps` só imprime o `4242`.
          if (!args.includes("-p")) return PS_LINKS_DARWIN;
          return "  557     1  15072   7:17.89 /usr/libexec/logd\n 4242   557 182716 123:45.67 /opt/homebrew/bin/node\n";
        },
      }),
    );

    const rows = await darwin([557]);

    expect(asked[1]).toBe("ps -x -o pid=,ppid=,rss=,time=,comm= -p 557,4242,4300,4400");
    expect(rows.map((row) => row.pid)).toEqual([557, 4242]);
  });

  it("drops a root that is gone, does not loop on a parent that points back, and runs one ps when the tree is empty", async () => {
    const asked: string[] = [];
    const darwin = createProcessTableReader(
      host({
        platform: "darwin",
        exec: async (command, args) => {
          asked.push([command, ...args].join(" "));
          // `0 0`: o pid 0 é o pai de si mesmo. `11 12` e `12 11` são um ciclo de pids reaproveitados.
          return args.includes("-p") ? "" : "    0     0\n   11    12\n   12    11\n   30     1\n";
        },
      }),
    );

    // Raiz morta (`99`): nada a pedir, e a segunda passada nem roda.
    expect(await darwin([99])).toEqual([]);
    expect(asked).toEqual(["ps -A -o pid=,ppid="]);

    // Raízes vivas em laço: terminam, e cada pid é pedido uma vez.
    asked.length = 0;
    await darwin([0, 11]);
    expect(asked[1]).toBe("ps -x -o pid=,ppid=,rss=,time=,comm= -p 0,11,12");
  });

  it("reads the Linux status file only for the tree, and never a process that died before it", async () => {
    const reads: string[] = [];
    const files = new Map([
      ["/proc/9/stat", STAT_9],
      ["/proc/9/status", STATUS_9],
      ["/proc/10/stat", STAT_10],
      ["/proc/10/status", STATUS_10],
      // Um filho do `9` que tem `stat` na primeira passada e já não tem `status` na segunda.
      ["/proc/31/stat", STAT_10.replace("10 (node) S 1", "31 (node) S 9")],
      // E um neto dele, que o `31` sumido não impede de aparecer.
      ["/proc/32/stat", STAT_10.replace("10 (node) S 1", "32 (node) S 9")],
      ["/proc/32/status", STATUS_10],
    ]);
    const linux = createProcessTableReader(
      host({
        platform: "linux",
        readdir: async () => ["9", "10", "31", "32"],
        read: async (path) => {
          reads.push(path);
          return files.get(path) ?? null;
        },
      }),
    );

    const rows = await linux([9]);

    expect(rows.map((row) => row.pid)).toEqual([9, 32]);
    expect(reads.filter((path) => path.endsWith("/status"))).toEqual([
      "/proc/9/status",
      "/proc/31/status",
      "/proc/32/status",
    ]);
  });

  it("reads every time format ps prints, and skips what it cannot read", async () => {
    // `[[dd-]hh:]mm:ss[.cc]`: os dias valem 86 400 s, com um ou mais dígitos, e a fração é
    // opcional. Cada linha abaixo é uma forma que o `ps` imprime ou uma que ele nunca imprimiria.
    const output = [
      "  10     1    100 2-03:04:05 /bin/days",
      "  11     1    100 12-01:00:00 /bin/two-digit-days",
      "  12     1    100 1:02:03 /bin/hours-without-fraction",
      "  13     1    100 0:05 /bin/seconds-only",
      "  14     1    100 0:01.50   /bin/with  spaces inside and two spaces before",
      "", // linha em branco
      "lixo 15 1 100 0:01.00 /bin/junk-before",
      "  16     1    100 0:01.00junk /bin/junk-after-time",
      "  17     1    100 x:yy /bin/not-a-time",
      "  19     1    100 abc1:02.00 /bin/junk-before-time",
      "  18     1    100 n/a /bin/no-time",
    ].join("\n");
    const links = "    1     0\n   10     1\n   11     1\n   12     1\n   13     1\n   14     1\n";
    const darwin = createProcessTableReader(
      host({ platform: "darwin", exec: async (_command, args) => (args.includes("-p") ? output : links) }),
    );

    expect((await darwin([1])).map((entry) => [entry.pid, entry.cpuSeconds, entry.command])).toEqual([
      [10, 2 * 86_400 + 3 * 3_600 + 4 * 60 + 5, "/bin/days"],
      [11, 12 * 86_400 + 3_600, "/bin/two-digit-days"],
      [12, 3_723, "/bin/hours-without-fraction"],
      [13, 5, "/bin/seconds-only"],
      [14, 1.5, "/bin/with  spaces inside and two spaces before"],
    ]);

    // /proc: só entrada de pid (`12abc` e `abc12` não são), só `stat` inteiro, e o
    // `readdir` é o de `/proc`. `ppid` ou CPU que não são número, e o parêntese que falta,
    // tiram o processo da tabela — sem derrubar os outros.
    const good = STAT_10;
    const tail = "S 1 1 1 0 -1 4194560 2844 0 397 0 151 1 0 0 20 0 7 0 970";
    const files = new Map<string, string>([
      ["/proc/10/stat", good],
      ["/proc/10/status", STATUS_10],
      ["/proc/12abc/stat", good],
      ["/proc/abc12/stat", good],
      ["/proc/20/stat", `20 (no-ppid) S notanumber 1 1 0 -1 4194560 2844 0 397 0 151 1 0 0 20 0 7 0 970\n`],
      ["/proc/21/stat", `21 (no-ticks) S 1 1 1 0 -1 4194560 2844 0 397 0 abc 1 0 0 20 0 7 0 970\n`],
      ["/proc/22/stat", `22 (short) S 1 1 1\n`],
      ["/proc/23/stat", `23 node ${tail}\n`],
      // Sem `)`: o `(` sozinho não delimita o `comm`, e o resto ainda teria números de sobra.
      ["/proc/24/stat", "( 0 1 2 3 4 5 6 7 8 9 10 11 12 13\n"],
      // Sem `(`: só o `)` existe.
      ["/proc/25/stat", "25 node) S 1 1 1 0 -1 4194560 2844 0 397 0 151 1 0 0 20 0 7 0 970\n"],
      // O `stat` existe e o `status` sumiu: o processo morreu entre as duas passadas, e não entra.
      ["/proc/26/stat", STAT_10.replace("10 (node)", "26 (node)")],
    ]);
    const asked: string[] = [];
    const linux = createProcessTableReader(
      host({
        platform: "linux",
        readdir: async (path) => {
          asked.push(path);
          return ["10", "12abc", "abc12", "20", "21", "22", "23", "24", "25", "26"];
        },
        read: async (path) => files.get(path) ?? null,
      }),
    );

    expect(
      (await linux([10, 12, 20, 21, 22, 23, 24, 25, 26])).map((entry) => [entry.pid, entry.command, entry.rssBytes]),
    ).toEqual([[10, "node", 49_356 * 1024]]);
    expect(asked).toEqual(["/proc"]);
  });

  it("refuses a platform it cannot read", async () => {
    const win = createProcessTableReader(host({ platform: "win32" }));

    await expect(win([1])).rejects.toThrow(/win32/);
  });
});
