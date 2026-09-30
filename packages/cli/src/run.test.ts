import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Health } from "./port.js";
import { run, type RunDeps } from "./run.js";
import type { ExecResult, ServiceHost } from "./service.js";

let out: string[];
let err: string[];

interface FakeHost {
  host: ServiceHost;
  /** Comandos e escritas, na ordem. */
  events: string[];
  files: Map<string, string>;
}

/**
 * Um sistema de mentira: `launchctl` e o disco dublados, e um relógio que só
 * anda quando alguém dorme — o teste de "15 s" não espera 15 s.
 */
function fakeHost(options: { failing?: readonly string[]; files?: Record<string, string> } = {}): FakeHost {
  const events: string[] = [];
  const files = new Map(Object.entries(options.files ?? {}));
  let clock = 0;
  const host: ServiceHost = {
    platform: "darwin",
    uid: 501,
    home: "/Users/ana",
    nodePath: "/opt/node/bin/node",
    lumemPath: "/opt/lumem/bin/lumem.mjs",
    path: "/usr/bin",
    exec: async (command, args): Promise<ExecResult> => {
      const line = [command, ...args].join(" ");
      events.push(line);
      const failed = (options.failing ?? []).includes(line);
      return { code: failed ? 1 : 0, stdout: "", stderr: "" };
    },
    read: (path) => files.get(path) ?? null,
    exists: (path) => files.has(path),
    write: (path, content) => {
      events.push(`write ${path}`);
      files.set(path, content);
    },
    mkdir: () => {},
    remove: (path) => {
      files.delete(path);
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return { host, events, files };
}

const NOT_LOADED = ["launchctl print gui/501/tech.cazimi.lumem"];
const LOG = "/Users/ana/.lumem/daemon.log";

function deps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
    version: "0.1.0",
    startDaemon: vi.fn(async () => {}),
    probe: async () => ({ kind: "free" }),
    health: async () => ({ kind: "free" }),
    // Nunca o launchctl de quem roda a suíte.
    service: fakeHost().host,
    interrupt: new AbortController().signal,
    open: vi.fn(() => true),
    upgrade: vi.fn(async () => 0),
    menubar: vi.fn(async () => 0),
    ...overrides,
  };
}

beforeEach(() => {
  out = [];
  err = [];
});

describe("lumem run", () => {
  it("sobe o daemon e imprime o endereço antes de qualquer log", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run(["run"], deps({ startDaemon }))).toBe(0);

    expect(startDaemon).toHaveBeenCalledOnce();
    expect(out[0]).toBe("Lumem v0.1.0 — http://127.0.0.1:4317");
  });

  it("passa porta, host e state dir para o daemon pelo ambiente", async () => {
    // É assim que o daemon lê configuração — no load do módulo, uma vez. Escrever
    // depois do import não teria efeito nenhum.
    const env: NodeJS.ProcessEnv = {};
    const startDaemon = vi.fn(async () => {
      expect(env["LUMEM_PORT"]).toBe("5000");
      expect(env["LUMEM_HOST"]).toBe("127.0.0.1");
      expect(env["LUMEM_STATE_DIR"]).toBe("/tmp/lumem");
    });

    await run(["run", "--port", "5000", "--state-dir", "/tmp/lumem"], deps({ env, startDaemon }));

    expect(startDaemon).toHaveBeenCalledOnce();
  });

  it("com um Lumem já na porta, aponta para ele e não sobe um segundo", async () => {
    // Dois daemons no mesmo ~/.lumem são dois escritores no mesmo SQLite.
    const startDaemon = vi.fn(async () => {});
    const probe = async () => ({ kind: "lumem" as const, version: "0.1.0" });

    expect(await run(["run"], deps({ startDaemon, probe }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(out[0]).toContain("já tem um Lumem em http://127.0.0.1:4317");
  });

  it("com outra coisa na porta, falha dizendo o que fazer", async () => {
    const startDaemon = vi.fn(async () => {});
    const probe = async () => ({ kind: "other" as const });

    expect(await run(["run"], deps({ startDaemon, probe }))).toBe(1);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--port");
  });

  it("nunca escolhe outra porta sozinho", async () => {
    // URL que muda é URL que ninguém guarda (D3).
    const probe = async () => ({ kind: "other" as const });

    await run(["run"], deps({ probe }));

    expect(out.join("\n")).not.toContain("4318");
  });

  it("--open abre o navegador, e só com ele", async () => {
    const open = vi.fn(() => true);

    await run(["run"], deps({ open }));
    expect(open).not.toHaveBeenCalled();

    await run(["run", "--open"], deps({ open }));
    expect(open).toHaveBeenCalledWith({ url: "http://127.0.0.1:4317" });
  });

  it("--open com um Lumem já de pé abre o que já existe", async () => {
    const open = vi.fn(() => true);
    const probe = async () => ({ kind: "lumem" as const, version: "0.1.0" });

    await run(["run", "--open"], deps({ open, probe }));

    expect(open).toHaveBeenCalledWith({ url: "http://127.0.0.1:4317" });
  });

  it("argumento desconhecido sai com 2, sem subir nada", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run(["run", "--porta", "1"], deps({ startDaemon }))).toBe(2);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(err[0]).toContain("--porta");
  });

  it("help e version não sobem daemon", async () => {
    const startDaemon = vi.fn(async () => {});

    expect(await run(["help"], deps({ startDaemon }))).toBe(0);
    expect(await run(["version"], deps({ startDaemon }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(out[1]).toBe("0.1.0");
  });
});

describe("lumem upgrade", () => {
  it("não sobe daemon, e usa a versão que está rodando como ponto de partida", async () => {
    const startDaemon = vi.fn(async () => {});
    const upgrade = vi.fn(async () => 0);

    expect(await run(["upgrade"], deps({ startDaemon, upgrade }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(upgrade).toHaveBeenCalledWith(
      expect.objectContaining({ current: "0.1.0", check: false, origin: "http://127.0.0.1:4317" }),
    );
  });

  it("--check chega no upgrade, e o código dele é o código do comando", async () => {
    const upgrade = vi.fn(async () => 1);

    expect(await run(["upgrade", "--check"], deps({ upgrade }))).toBe(1);

    expect(upgrade).toHaveBeenCalledWith(expect.objectContaining({ check: true }));
  });

  it("olha o daemon na porta configurada, e não na de sempre", async () => {
    // Quem roda em outra porta é quem mais precisa da linha de "reinicie".
    const upgrade = vi.fn(async () => 0);

    await run(["upgrade"], deps({ upgrade, env: { LUMEM_PORT: "5000" } }));

    expect(upgrade).toHaveBeenCalledWith(expect.objectContaining({ origin: "http://127.0.0.1:5000" }));
  });
});

describe("lumem upgrade e o serviço (038)", () => {
  it("entrega ao upgrade o sistema e a identidade do serviço", async () => {
    // A fiação: o `upgrade` só reinicia o que **este** `run` lhe apresenta. Sem esta
    // linha o `upgrade.ts` passa em todos os casos dele e o comando de verdade nunca
    // reinicia nada.
    const upgrade = vi.fn(async () => 0);
    const { host } = fakeHost();

    await run(
      ["upgrade"],
      deps({ upgrade, service: host, env: { LUMEM_SERVICE_LABEL: "tech.cazimi.lumem-smoke" } }),
    );

    expect(upgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        service: { host, identity: { label: "tech.cazimi.lumem-smoke", unit: "lumem.service" } },
      }),
    );
  });
});

describe("lumem menubar (038)", () => {
  it("entrega ao menubar a ação, o sistema e onde o daemon está", async () => {
    // A fiação, como a do `upgrade`: o app grava o `stateDir` e a origem que **este**
    // `run` resolveu — flag, ambiente, padrão — e nunca uns próprios.
    const menubar = vi.fn(async () => 0);
    const { host } = fakeHost();

    expect(
      await run(
        ["menubar", "install", "--port", "5000", "--state-dir", "/tmp/lumem-x"],
        deps({ menubar, service: host, version: "0.7.0" }),
      ),
    ).toBe(0);

    expect(menubar).toHaveBeenCalledWith(
      "install",
      expect.objectContaining({
        host,
        version: "0.7.0",
        where: { stateDir: "/tmp/lumem-x", origin: "http://127.0.0.1:5000" },
      }),
    );
  });

  it("o código do comando é o código do menubar", async () => {
    expect(await run(["menubar", "open"], deps({ menubar: vi.fn(async () => 1) }))).toBe(1);
  });

  it("entrega ao upgrade o app de desktop", async () => {
    const upgrade = vi.fn(async () => 0);
    const { host } = fakeHost();

    await run(["upgrade"], deps({ upgrade, service: host, env: { XDG_CONFIG_HOME: "/x" } }));

    expect(upgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        desktop: { host, arch: process.arch, env: expect.objectContaining({ XDG_CONFIG_HOME: "/x" }) },
      }),
    );
  });
});

describe("lumem run (o primeiro plano de antes)", () => {
  it("run keeps the foreground behaviour", async () => {
    // O que `lumem` fazia antes da 038, verbo por verbo: sonda a porta, diz que
    // já tem um Lumem, recusa a porta de outro com 1 e sobe o daemon **neste
    // processo**. Nenhum comando do supervisor entra no caminho.
    const { host, events } = fakeHost();

    const startDaemon = vi.fn(async () => {});
    expect(await run(["run"], deps({ startDaemon, service: host }))).toBe(0);
    expect(startDaemon).toHaveBeenCalledOnce();
    expect(out[0]).toBe("Lumem v0.1.0 — http://127.0.0.1:4317");

    out = [];
    const second = vi.fn(async () => {});
    const occupied = async () => ({ kind: "lumem" as const, version: "0.1.0" });
    expect(await run(["run"], deps({ startDaemon: second, probe: occupied, service: host }))).toBe(0);
    expect(second).not.toHaveBeenCalled();
    expect(out[0]).toContain("já tem um Lumem em http://127.0.0.1:4317");

    const third = vi.fn(async () => {});
    const other = async () => ({ kind: "other" as const });
    expect(await run(["run"], deps({ startDaemon: third, probe: other, service: host }))).toBe(1);
    expect(third).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--port");

    expect(events).toEqual([]);
  });
});

describe("lumem start", () => {
  function lines(count: number): string {
    return Array.from({ length: count }, (_, index) => `linha ${String(index + 1)}`).join("\n") + "\n";
  }

  /** Livre até o serviço ser carregado, e um Lumem `after` sondagens depois. */
  function answersAfterLoad(fake: FakeHost, after: number) {
    let polls = 0;
    return async (): Promise<{ kind: "free" } | { kind: "lumem"; version: string }> => {
      if (!fake.events.some((event) => event.startsWith("launchctl bootstrap"))) return { kind: "free" };
      polls += 1;
      return polls >= after ? { kind: "lumem", version: "0.7.0" } : { kind: "free" };
    };
  }

  it("start waits for health and prints the log when it never answers", async () => {
    const up = fakeHost();
    expect(await run(["start"], deps({ service: up.host, probe: answersAfterLoad(up, 3) }))).toBe(0);
    expect(out.join("\n")).toContain("http://127.0.0.1:4317");
    // Saiu 0 **na primeira resposta**, e não no fim dos 15 s.
    expect(up.host.now()).toBeLessThan(15_000);

    out = [];
    const down = fakeHost({ files: { [LOG]: lines(30) } });
    const never = async () => ({ kind: "free" as const });
    expect(await run(["start"], deps({ service: down.host, probe: never }))).toBe(1);

    // As últimas 20 de 30: da 11 à 30, e nem a 10 nem nada antes.
    expect(err).toContain("linha 30");
    expect(err).toContain("linha 11");
    expect(err).not.toContain("linha 10");
    expect(down.host.now()).toBeGreaterThanOrEqual(15_000);
    expect(down.host.now()).toBeLessThan(16_000);
  });

  it("says so when the service fails and there is no log yet", async () => {
    const { host } = fakeHost();

    expect(await run(["start"], deps({ service: host, probe: async () => ({ kind: "free" }) }))).toBe(1);

    expect(err.join("\n")).toContain(LOG);
  });

  it("start refuses when another Lumem runs outside the service", async () => {
    const { host, events, files } = fakeHost({ failing: NOT_LOADED });
    const probe = async () => ({ kind: "lumem" as const, version: "0.6.1" });

    expect(await run(["start"], deps({ service: host, probe }))).toBe(1);

    expect(err.join("\n")).toContain("fora do serviço");
    expect(err.join("\n")).toContain("http://127.0.0.1:4317");
    // Recusou antes de mexer em qualquer coisa: dois daemons no mesmo estado são
    // dois escritores no mesmo SQLite.
    expect(files.size).toBe(0);
    expect(events.some((event) => event.startsWith("launchctl bootstrap"))).toBe(false);
  });

  it("refuses a port taken by something that is not a Lumem", async () => {
    const { host, files } = fakeHost();

    expect(await run(["start"], deps({ service: host, probe: async () => ({ kind: "other" }) }))).toBe(1);

    expect(err.join("\n")).toContain("--port");
    expect(files.size).toBe(0);
  });

  it("with no verb it behaves as start", async () => {
    const fake = fakeHost();
    const startDaemon = vi.fn(async () => {});

    expect(await run([], deps({ service: fake.host, probe: answersAfterLoad(fake, 1), startDaemon }))).toBe(0);

    expect(startDaemon).not.toHaveBeenCalled();
    expect(fake.events.some((event) => event.startsWith("launchctl bootstrap"))).toBe(true);
  });

  it("leaves a service that is already current alone, so `lumem` does not kill sessions", async () => {
    // `lumem` sem verbo é `start`, e quem digita o comando para *abrir* o Lumem
    // não pediu para reiniciá-lo. Reinício só quando o arquivo mudou.
    const fake = fakeHost();
    await run(["start"], deps({ service: fake.host, probe: answersAfterLoad(fake, 1) }));
    const before = fake.events.length;
    out = [];

    const running = async () => ({ kind: "lumem" as const, version: "0.7.0" });
    expect(await run(["start"], deps({ service: fake.host, probe: running }))).toBe(0);

    expect(out.join("\n")).toContain("já roda como serviço");
    expect(fake.events.slice(before).some((event) => /bootout|bootstrap/.test(event))).toBe(false);
  });

  it("reloads a running service whose file is stale", async () => {
    const fake = fakeHost({
      files: { "/Users/ana/Library/LaunchAgents/tech.cazimi.lumem.plist": "<plist>velho</plist>" },
    });
    const running = async () => ({ kind: "lumem" as const, version: "0.7.0" });

    expect(await run(["start"], deps({ service: fake.host, probe: running }))).toBe(0);

    expect(fake.events).toContain("launchctl bootout gui/501/tech.cazimi.lumem");
    expect(fake.events.some((event) => event.startsWith("launchctl bootstrap"))).toBe(true);
  });

  it("hands --port to the service through its environment, and opens the browser only with --open", async () => {
    const fake = fakeHost();
    const open = vi.fn(() => true);
    const probe = async () =>
      fake.events.some((event) => event.startsWith("launchctl bootstrap"))
        ? { kind: "lumem" as const, version: "0.7.0" }
        : { kind: "free" as const };

    expect(await run(["start", "--port", "5000", "--open"], deps({ service: fake.host, probe, open }))).toBe(0);

    const plist = fake.files.get("/Users/ana/Library/LaunchAgents/tech.cazimi.lumem.plist") ?? "";
    expect(plist).toContain("<key>LUMEM_PORT</key>\n    <string>5000</string>");
    expect(open).toHaveBeenCalledWith({ url: "http://127.0.0.1:5000" });
  });

  it("names a service with the label the environment asks for", async () => {
    const fake = fakeHost();
    const probe = async () =>
      fake.events.some((event) => event.startsWith("launchctl bootstrap"))
        ? { kind: "lumem" as const, version: "0.7.0" }
        : { kind: "free" as const };

    await run(["start"], deps({ service: fake.host, probe, env: { LUMEM_SERVICE_LABEL: "tech.cazimi.lumem-smoke" } }));

    expect(fake.files.has("/Users/ana/Library/LaunchAgents/tech.cazimi.lumem-smoke.plist")).toBe(true);
  });

  it("prints why it could not start, and names lumem run, when there is no supervisor", async () => {
    const { host, files } = fakeHost({ failing: ["launchctl print gui/501"] });

    expect(await run(["start"], deps({ service: host }))).toBe(1);

    expect(err.join("\n")).toContain("lumem run");
    expect(files.size).toBe(0);
  });
});

describe("lumem stop", () => {
  it("exits 0 when the daemon goes quiet, and 1 when it does not", async () => {
    const stopped = fakeHost({ files: { "/Users/ana/Library/LaunchAgents/tech.cazimi.lumem.plist": "<plist/>" } });
    let answers = 2;
    const fading = async () =>
      answers-- > 0 ? { kind: "lumem" as const, version: "0.7.0" } : { kind: "free" as const };

    expect(await run(["stop"], deps({ service: stopped.host, probe: fading }))).toBe(0);
    expect(stopped.events).toContain("launchctl bootout gui/501/tech.cazimi.lumem");

    const stuck = fakeHost();
    const alive = async () => ({ kind: "lumem" as const, version: "0.7.0" });

    expect(await run(["stop"], deps({ service: stuck.host, probe: alive }))).toBe(1);
    expect(err.join("\n")).toContain("10 s");
  });

  it("exits 0 when there was nothing to stop", async () => {
    const { host } = fakeHost({ failing: NOT_LOADED });

    expect(await run(["stop"], deps({ service: host, probe: async () => ({ kind: "free" }) }))).toBe(0);
  });
});

describe("lumem status", () => {
  it("status prints one line and exits 0 or 3", async () => {
    const supervised = async (): Promise<Health> => ({ kind: "lumem", version: "0.7.0", supervised: true });

    expect(await run(["status"], deps({ health: supervised }))).toBe(0);
    expect(out).toEqual(["rodando · v0.7.0 · http://127.0.0.1:4317 · supervisionado"]);

    out = [];
    const foreground = async (): Promise<Health> => ({ kind: "lumem", version: "0.7.0", supervised: false });
    expect(await run(["status", "--port", "5000"], deps({ health: foreground }))).toBe(0);
    expect(out).toEqual(["rodando · v0.7.0 · http://127.0.0.1:5000 · em primeiro plano"]);

    out = [];
    expect(await run(["status"], deps())).toBe(3);
    expect(out).toEqual(["parado · http://127.0.0.1:4317"]);
  });

  it("does not call a stranger on the port a Lumem", async () => {
    expect(await run(["status"], deps({ health: async () => ({ kind: "other" }) }))).toBe(3);

    expect(out.join("\n")).toContain("parado");
    expect(out.join("\n")).not.toContain("rodando");
  });
});

describe("lumem logs", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "lumem-cli-logs-"));
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("logs prints the last 200 lines and follows with -f", async () => {
    const file = join(stateDir, "daemon.log");
    writeFileSync(file, Array.from({ length: 250 }, (_, index) => `linha ${String(index + 1)}`).join("\n") + "\n");

    expect(await run(["logs", "--state-dir", stateDir], deps())).toBe(0);
    expect(out).toHaveLength(200);
    expect(out[0]).toBe("linha 51");
    expect(out.at(-1)).toBe("linha 250");

    // -f: a linha nasce **durante** a espera — o `sleep` é o relógio do teste, e
    // interrompe o loop depois de ver a linha, sem nenhum tempo de parede.
    out = [];
    const interrupt = new AbortController();
    let sleeps = 0;
    const service = fakeHost().host;
    service.sleep = async () => {
      sleeps += 1;
      if (sleeps === 2) appendFileSync(file, "linha 251\nlinha 25");
      if (sleeps === 3) appendFileSync(file, "2\n");
      if (out.includes("linha 252")) interrupt.abort();
    };

    expect(await run(["logs", "-f", "--state-dir", stateDir], deps({ service, interrupt: interrupt.signal }))).toBe(0);

    expect(out.slice(0, 200)).toHaveLength(200);
    // A segunda chegou em dois pedaços e saiu inteira, e nenhuma saiu repetida.
    expect(out.slice(200)).toEqual(["linha 251", "linha 252"]);
  });

  it("logs names the missing file", async () => {
    expect(await run(["logs", "--state-dir", stateDir], deps())).toBe(1);

    expect(err.join("\n")).toContain(join(stateDir, "daemon.log"));
  });

  it("looks for the log in the default state dir when none is given", async () => {
    expect(await run(["logs"], deps())).toBe(1);

    expect(err.join("\n")).toContain(LOG);
  });
});
