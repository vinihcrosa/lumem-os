import { describe, expect, it } from "vitest";

import {
  installService,
  serviceIdentity,
  stopService,
  type ExecResult,
  type ServiceHost,
  type ServiceSpec,
} from "./service.js";

/**
 * O escritor de serviço, com `launchctl`, `systemctl` e o disco dublados — o mesmo
 * desenho da instalação do adaptador (`npm` dublado, nenhum `npm install` de
 * verdade). Nenhum supervisor de verdade roda na suíte; quem o exercita é o
 * `pnpm smoke:service`.
 *
 * Uma lista só, cronológica, recebe os comandos **e** as escritas: a ordem entre
 * "escrever o arquivo" e "carregá-lo" é metade do que os checks afirmam.
 */

interface Fake {
  host: ServiceHost;
  /** Comandos e escritas, na ordem em que aconteceram. */
  events: string[];
  files: Map<string, string>;
}

interface FakeOptions {
  platform?: NodeJS.Platform;
  /** Os comandos (`"launchctl print gui/501"`) que saem com código diferente de 0. */
  failing?: readonly string[];
  files?: Record<string, string>;
  path?: string;
  nodePath?: string;
  lumemPath?: string;
}

function fake(options: FakeOptions = {}): Fake {
  const events: string[] = [];
  const files = new Map(Object.entries(options.files ?? {}));
  let clock = 0;
  const host: ServiceHost = {
    platform: options.platform ?? "darwin",
    uid: 501,
    home: "/Users/ana",
    nodePath: options.nodePath ?? "/opt/node/bin/node",
    lumemPath: options.lumemPath ?? "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs",
    path: options.path ?? "/usr/local/bin:/Users/ana/.nvm/versions/node/v22.17.1/bin:/usr/bin",
    exec: async (command, args): Promise<ExecResult> => {
      const line = [command, ...args].join(" ");
      events.push(line);
      const failed = (options.failing ?? []).includes(line);
      return { code: failed ? 1 : 0, stdout: "", stderr: failed ? `falhou: ${line}` : "" };
    },
    read: (path) => files.get(path) ?? null,
    write: (path, content) => {
      events.push(`write ${path}`);
      files.set(path, content);
    },
    mkdir: (path) => {
      events.push(`mkdir ${path}`);
    },
    remove: (path) => {
      events.push(`remove ${path}`);
      files.delete(path);
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return { host, events, files };
}

const IDENTITY = serviceIdentity({});

function spec(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return { ...IDENTITY, stateDir: "/Users/ana/.lumem", env: {}, ...overrides };
}

const PLIST = "/Users/ana/Library/LaunchAgents/tech.cazimi.lumem.plist";
const UNIT = "/Users/ana/.config/systemd/user/lumem.service";

/**
 * Lê o plist como dado, e não como texto: o teste é sobre o que o launchd vai
 * entender, e um `toContain` sobre XML passaria com a chave no lugar errado.
 * Cobre só o que o arquivo usa — `dict`, `array`, `string`, `true` e `false`.
 */
function parsePlist(xml: string): unknown {
  const tokens = [...xml.matchAll(/<(\/?)(dict|array|key|string|true|false)\s*(\/?)>([^<]*)/g)];
  let cursor = 0;

  const unescape = (raw: string) =>
    raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

  function value(): unknown {
    const token = tokens[cursor++]!;
    const name = token[2]!;
    if (name === "true") return true;
    if (name === "false") return false;
    if (name === "string") {
      const text = unescape(token[4] ?? "");
      if (token[3] !== "/") cursor += 1; // </string>
      return token[3] === "/" ? "" : text;
    }
    if (name === "array") {
      const items: unknown[] = [];
      while (!(tokens[cursor]![1] === "/" && tokens[cursor]![2] === "array")) items.push(value());
      cursor += 1;
      return items;
    }
    const entries: Record<string, unknown> = {};
    while (!(tokens[cursor]![1] === "/" && tokens[cursor]![2] === "dict")) {
      const key = tokens[cursor++]!;
      const text = unescape(key[4] ?? "");
      cursor += 1; // </key>
      entries[text] = value();
    }
    cursor += 1;
    return entries;
  }

  return value();
}

describe("installService", () => {
  it("writes the launchd plist with the caller's PATH", async () => {
    const { host, events, files } = fake();

    const result = await installService(host, spec());

    expect(result).toEqual({ ok: true, file: PLIST });
    expect(parsePlist(files.get(PLIST)!)).toEqual({
      Label: "tech.cazimi.lumem",
      ProgramArguments: [
        "/opt/node/bin/node",
        "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs",
        "run",
      ],
      // Só as duas: o padrão não pode vazar porta, host nem state dir para o arquivo.
      EnvironmentVariables: {
        PATH: "/usr/local/bin:/Users/ana/.nvm/versions/node/v22.17.1/bin:/usr/bin",
        LUMEM_SUPERVISOR: "launchd",
      },
      KeepAlive: true,
      RunAtLoad: true,
      StandardOutPath: "/Users/ana/.lumem/daemon.log",
      StandardErrorPath: "/Users/ana/.lumem/daemon.log",
    });
    // O launchd não cria o diretório do log: sem ele o serviço nem sobe.
    expect(events).toContain("mkdir /Users/ana/.lumem");
    expect(events.indexOf(`write ${PLIST}`)).toBeLessThan(
      events.indexOf(`launchctl bootstrap gui/501 ${PLIST}`),
    );
  });

  it("writes the systemd unit and enables it", async () => {
    const { host, events, files } = fake({
      platform: "linux",
      path: "/usr/bin:/home/ana/.nvm/bin",
      failing: ["systemctl --user is-active lumem.service"],
    });

    const result = await installService(host, spec({ stateDir: "/home/ana/.lumem" }));
    const unitPath = "/Users/ana/.config/systemd/user/lumem.service";

    expect(result).toEqual({ ok: true, file: unitPath });
    const unit = files.get(unitPath)!;
    expect(unit).toContain("ExecStart=/opt/node/bin/node /opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs run\n");
    expect(unit).toContain("Environment=PATH=/usr/bin:/home/ana/.nvm/bin\n");
    expect(unit).toContain("Environment=LUMEM_SUPERVISOR=systemd\n");
    expect(unit).toContain("Restart=always\n");
    expect(unit).toContain("RestartSec=2\n");
    expect(unit).toContain("StandardOutput=append:/home/ana/.lumem/daemon.log\n");

    const systemctl = events.filter((event) => event.startsWith("systemctl") || event.startsWith("write"));
    expect(systemctl.slice(-3)).toEqual([
      `write ${unitPath}`,
      "systemctl --user daemon-reload",
      "systemctl --user enable --now lumem.service",
    ]);
  });

  it("rewrites an existing service file before loading it", async () => {
    // Um `nvm use` depois do primeiro `lumem start`: o arquivo velho aponta para
    // um `node` que já não está no PATH de quem chama.
    const stale = "<plist>PATH antigo, node antigo</plist>";
    const { host, events, files } = fake({
      files: { [PLIST]: stale },
      path: "/novo/bin:/usr/bin",
      nodePath: "/novo/bin/node",
      lumemPath: "/novo/lib/lumem.mjs",
    });

    await installService(host, spec());

    const rewritten = parsePlist(files.get(PLIST)!) as {
      ProgramArguments: string[];
      EnvironmentVariables: { PATH: string };
    };
    expect(files.get(PLIST)).not.toContain("antigo");
    expect(rewritten.ProgramArguments).toEqual(["/novo/bin/node", "/novo/lib/lumem.mjs", "run"]);
    expect(rewritten.EnvironmentVariables.PATH).toBe("/novo/bin:/usr/bin");
    expect(events.indexOf(`write ${PLIST}`)).toBeLessThan(
      events.indexOf(`launchctl bootstrap gui/501 ${PLIST}`),
    );
  });

  it("carries the port, host and state dir the caller asked for", async () => {
    // O serviço executa `lumem run` sem argumento nenhum, então o que a pessoa
    // pediu na linha de `lumem start` só chega ao daemon pelo ambiente do arquivo.
    const { host, files } = fake();

    await installService(
      host,
      spec({ stateDir: "/tmp/estado", env: { LUMEM_PORT: "5000", LUMEM_STATE_DIR: "/tmp/estado" } }),
    );

    const plist = parsePlist(files.get(PLIST)!) as { EnvironmentVariables: Record<string, string> };
    expect(plist.EnvironmentVariables).toMatchObject({
      LUMEM_PORT: "5000",
      LUMEM_STATE_DIR: "/tmp/estado",
      LUMEM_SUPERVISOR: "launchd",
    });
  });

  it("escapes what XML and systemd read as syntax", async () => {
    const mac = fake({ path: "/a&b:/c<d>" });
    await installService(mac.host, spec());
    const plist = parsePlist(mac.files.get(PLIST)!) as { EnvironmentVariables: { PATH: string } };
    expect(plist.EnvironmentVariables.PATH).toBe("/a&b:/c<d>");

    const linux = fake({ platform: "linux", nodePath: "/opt/meu node/bin/node", path: "/100%/bin" });
    await installService(linux.host, spec());
    const unit = linux.files.get(UNIT)!;
    expect(unit).toContain('ExecStart="/opt/meu node/bin/node" ');
    expect(unit).toContain("Environment=PATH=/100%%/bin\n");
  });

  it("reloads a service that is already loaded instead of failing to bootstrap it", async () => {
    // `launchctl bootstrap` de um serviço carregado é erro; e o PATH novo só vale
    // depois de o daemon subir de novo.
    const { host, events } = fake();

    await installService(host, spec());

    const bootout = events.indexOf("launchctl bootout gui/501/tech.cazimi.lumem");
    expect(bootout).toBeGreaterThan(-1);
    expect(bootout).toBeLessThan(events.indexOf(`launchctl bootstrap gui/501 ${PLIST}`));
  });

  it("does not bootout a service that is not loaded", async () => {
    const { host, events } = fake({ failing: ["launchctl print gui/501/tech.cazimi.lumem"] });

    await installService(host, spec());

    expect(events.some((event) => event.startsWith("launchctl bootout"))).toBe(false);
    expect(events).toContain(`launchctl bootstrap gui/501 ${PLIST}`);
  });

  it("restarts a unit that is already active, so the new environment applies", async () => {
    const { host, events } = fake({ platform: "linux" });

    await installService(host, spec());

    expect(events.at(-1)).toBe("systemctl --user restart lumem.service");
  });

  it("names the launchctl error when the load fails", async () => {
    const { host } = fake({
      failing: ["launchctl bootstrap gui/501 " + PLIST, "launchctl print gui/501/tech.cazimi.lumem"],
    });

    const result = await installService(host, spec());

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining(`falhou: launchctl bootstrap gui/501 ${PLIST}`),
    });
  });

  it("uses a non-default label and unit when the environment overrides them", async () => {
    // O `smoke:service` sobe um serviço de teste sem tocar no `tech.cazimi.lumem`
    // de quem o roda; os padrões acima continuam sendo os do check.
    const identity = serviceIdentity({ LUMEM_SERVICE_LABEL: "tech.cazimi.lumem-smoke", LUMEM_SERVICE_UNIT: "lumem-smoke.service" });
    const mac = fake();
    await installService(mac.host, { ...spec(), ...identity });
    expect(mac.files.has("/Users/ana/Library/LaunchAgents/tech.cazimi.lumem-smoke.plist")).toBe(true);
    expect(mac.events).toContain("launchctl bootstrap gui/501 /Users/ana/Library/LaunchAgents/tech.cazimi.lumem-smoke.plist");

    const linux = fake({ platform: "linux" });
    await installService(linux.host, { ...spec(), ...identity });
    expect(linux.events).toContain("systemctl --user enable --now lumem-smoke.service");
  });
});

describe("installService without a supervisor", () => {
  it("refuses without a supervisor and names lumem run", async () => {
    const cases: { name: string; options: FakeOptions }[] = [
      { name: "launchctl sem sessão de usuário", options: { failing: ["launchctl print gui/501"] } },
      {
        name: "systemctl --user falhando",
        options: { platform: "linux", failing: ["systemctl --user show-environment"] },
      },
      { name: "plataforma sem supervisor", options: { platform: "win32" } },
    ];

    for (const { name, options } of cases) {
      const { host, events, files } = fake(options);

      const result = await installService(host, spec());

      expect(result, name).toEqual({ ok: false, reason: expect.stringContaining("lumem run") });
      // Nada escrito, nada carregado: recusar não deixa rastro.
      expect(files.size, name).toBe(0);
      expect(
        events.filter((event) => event.startsWith("write") || event.startsWith("mkdir") || /bootstrap|enable|daemon-reload/.test(event)),
        name,
      ).toEqual([]);
    }
  });
});

describe("stopService", () => {
  const down = async () => false;

  it("stop unloads the service and leaves no login item", async () => {
    const mac = fake({ files: { [PLIST]: "<plist/>" } });

    expect(await stopService(mac.host, spec(), down)).toEqual({ ok: true });

    expect(mac.events).toContain("launchctl bootout gui/501/tech.cazimi.lumem");
    expect(mac.files.has(PLIST)).toBe(false);

    const linux = fake({ platform: "linux", files: { [UNIT]: "[Service]" } });

    expect(await stopService(linux.host, spec(), down)).toEqual({ ok: true });

    expect(linux.events).toContain("systemctl --user disable --now lumem.service");
  });

  it("says so when the daemon that answers is not the service", async () => {
    // `lumem run` num terminal: não há o que descarregar, e esperar 10 s por um
    // processo que nada vai derrubar é só demora.
    const { host, events } = fake({ failing: ["launchctl print gui/501/tech.cazimi.lumem"] });

    const result = await stopService(host, spec(), async () => true);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("não roda como serviço") });
    expect(host.now()).toBe(0);
    expect(events).not.toContain("launchctl bootout gui/501/tech.cazimi.lumem");
  });

  it("fails when the daemon still answers after ten seconds", async () => {
    const { host } = fake({ files: { [PLIST]: "<plist/>" } });
    const waited: number[] = [];
    let polls = 0;
    const up = async () => {
      polls += 1;
      waited.push(host.now());
      return true;
    };

    const result = await stopService(host, spec(), up);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("10 s") });
    expect(Math.max(...waited)).toBeLessThanOrEqual(10_000);
    expect(polls).toBeGreaterThan(1);
  });

  it("succeeds as soon as the daemon stops answering, not at the deadline", async () => {
    const { host } = fake({ files: { [PLIST]: "<plist/>" } });
    let answers = 3;
    const up = async () => answers-- > 0;

    expect(await stopService(host, spec(), up)).toEqual({ ok: true });

    expect(host.now()).toBeLessThan(10_000);
  });
});
