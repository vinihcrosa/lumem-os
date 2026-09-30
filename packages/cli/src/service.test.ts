import { describe, expect, it } from "vitest";

import {
  installService,
  restartService,
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
  /** Caminhos que existem no disco sem serem arquivo lido (um symlink de pacote, por exemplo). */
  existing?: readonly string[];
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
    exists: (path) => (options.existing ?? []).includes(path) || files.has(path),
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

function programArguments(xml: string): unknown {
  return (parsePlist(xml) as { ProgramArguments: unknown }).ProgramArguments;
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

  it("records the stable package path under a versioned store", async () => {
    const global = "/Users/ana/Library/pnpm/global/5";
    const versioned = `${global}/.pnpm/@vinihcrosa+lumem-os@0.6.1/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`;
    const stable = `${global}/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs`;
    const stateDir = "/Users/ana/.lumem";
    const unitPath = "/Users/ana/.config/systemd/user/lumem.service";

    // pnpm, com o symlink do pacote no prefixo global: o caminho que não muda de versão.
    const withLink = fake({ lumemPath: versioned, existing: [stable] });
    await installService(withLink.host, spec());
    expect(programArguments(withLink.files.get(PLIST)!)).toEqual([
      "/opt/node/bin/node",
      stable,
      "run",
    ]);
    const linuxWithLink = fake({ platform: "linux", lumemPath: versioned, existing: [stable] });
    await installService(linuxWithLink.host, spec({ stateDir }));
    expect(linuxWithLink.files.get(unitPath)).toContain(`ExecStart=/opt/node/bin/node ${stable} run\n`);

    // Sem o symlink, o único caminho que existe é o resolvido.
    const withoutLink = fake({ lumemPath: versioned });
    await installService(withoutLink.host, spec());
    expect(programArguments(withoutLink.files.get(PLIST)!)).toEqual([
      "/opt/node/bin/node",
      versioned,
      "run",
    ]);

    // O symlink existe, mas o caminho **não é** o do pacote do Lumem na loja: outro pacote, ou
    // um arquivo com sufixo (`lumem.mjs.bak`), não é reapontado para o symlink do Lumem.
    for (const lumemPath of [
      `${versioned}.bak`,
      `${global}/.pnpm/outro@1.0.0/node_modules/outro/bin/lumem.mjs`,
    ]) {
      const other = fake({ lumemPath, existing: [stable] });
      await installService(other.host, spec());
      expect(programArguments(other.files.get(PLIST)!), lumemPath).toEqual(["/opt/node/bin/node", lumemPath, "run"]);
    }

    // npm: o `bin/lumem.mjs` resolvido já não muda de versão, e fica como está.
    const npm = fake({ existing: [stable] });
    await installService(npm.host, spec());
    expect(programArguments(npm.files.get(PLIST)!)).toEqual([
      "/opt/node/bin/node",
      "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs",
      "run",
    ]);
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
    // O motivo diz **qual** supervisor falta: cada plataforma tem o seu, e "não responde" sem
    // dizer qual manda a pessoa procurar o que não existe na máquina dela.
    const cases: { name: string; options: FakeOptions; why: string }[] = [
      { name: "launchctl sem sessão de usuário", options: { failing: ["launchctl print gui/501"] }, why: "o launchd não responde" },
      {
        name: "systemctl --user falhando",
        options: { platform: "linux", failing: ["systemctl --user show-environment"] },
        why: "o `systemctl --user` não responde",
      },
      { name: "plataforma sem supervisor", options: { platform: "win32" }, why: "não há supervisor para win32" },
    ];

    for (const { name, options, why } of cases) {
      const { host, events, files } = fake(options);

      const result = await installService(host, spec());

      expect(result, name).toEqual({
        ok: false,
        reason: expect.stringContaining("lumem run"),
      });
      expect(result.ok ? "" : result.reason, name).toContain(why);
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

describe("installService, step by step", () => {
  it("stops at the first systemd step that fails, and says which one", async () => {
    // A unit está ativa (o padrão do dublê), então os três passos existem. Cada um falhando,
    // sozinho, recusa e não deixa o seguinte rodar.
    const steps = [
      { failing: "systemctl --user daemon-reload", names: "daemon-reload", after: ["enable --now", "restart"] },
      { failing: "systemctl --user enable --now lumem.service", names: "enable --now", after: ["restart"] },
      { failing: "systemctl --user restart lumem.service", names: "restart", after: [] as string[] },
    ];

    for (const { failing, names, after } of steps) {
      const { host, events } = fake({ platform: "linux", failing: [failing] });

      const result = await installService(host, spec());

      // O passo vem **antes** do que o sistema disse (o dublê repete o comando na saída de erro, e
      // um `toContain` sobre o motivo inteiro passaria mesmo sem o rótulo do passo).
      expect(result, names).toEqual({ ok: false, reason: expect.stringContaining(names) });
      expect(result.ok ? "" : result.reason, names).toBe(`\`${failing.replace(" lumem.service", "")}\` falhou: falhou: ${failing}`);
      for (const later of after) {
        expect(events.some((event) => event.includes(later)), `${names}: ${later} não roda`).toBe(false);
      }
    }

    // E com os três passando, os três rodam, nessa ordem.
    const all = fake({ platform: "linux" });
    expect(await installService(all.host, spec())).toEqual({ ok: true, file: UNIT });
    expect(all.events.filter((event) => event.startsWith("systemctl --user") && !/is-active|show-environment/.test(event))).toEqual([
      "systemctl --user daemon-reload",
      "systemctl --user enable --now lumem.service",
      "systemctl --user restart lumem.service",
    ]);
  });

  it("explains a failure with stderr first, then stdout, then the exit code", async () => {
    const cases = [
      { name: "stderr", stdout: "saída", stderr: "  erro do launchctl \n", says: "falhou: erro do launchctl" },
      { name: "stdout", stdout: " só a saída \n", stderr: "   ", says: "falhou: só a saída" },
      { name: "neither", stdout: "", stderr: "", says: "falhou: saiu com 5" },
    ];

    for (const { name, stdout, stderr, says } of cases) {
      const { host } = fake();
      const exec = host.exec;
      host.exec = async (command, args) => {
        const result = await exec(command, args);
        return command === "launchctl" && args[0] === "bootstrap" ? { code: 5, stdout, stderr } : result;
      };

      const result = await installService(host, spec());

      expect(result, name).toEqual({ ok: false, reason: expect.stringContaining(says) });
      // Aparado, e sem o que vem depois: o motivo termina no detalhe.
      expect(result.ok ? "" : result.reason, name).toMatch(new RegExp(`${says}$`));
      expect(result.ok ? "" : result.reason, name).toMatch(/^`launchctl bootstrap` falhou: /);
    }
  });

  it("writes what XML and systemd read as syntax, and reads it back the same", async () => {
    // Um PATH de quem tem apóstrofo no nome de usuário, e aspas, perderia essas letras se o
    // escape as trocasse por nada.
    const mac = fake({ path: `/Users/o'brien/bin:/a"b&c<d>` });
    await installService(mac.host, spec());
    const plist = parsePlist(mac.files.get(PLIST)!) as { EnvironmentVariables: { PATH: string } };
    expect(plist.EnvironmentVariables.PATH).toBe(`/Users/o'brien/bin:/a"b&c<d>`);

    // systemd: `%` e `$` dobram; aspas e barra invertida pedem aspas e escape; espaço pede aspas.
    const lumem = "/opt/lumem/bin/lumem.mjs";
    const words = [
      { node: "/opt/100%/node", word: "/opt/100%%/node" },
      { node: "/opt/$HOME/node", word: "/opt/$$HOME/node" },
      { node: "/opt/my node/node", word: '"/opt/my node/node"' },
      { node: '/opt/a"b\\c/node', word: '"/opt/a\\"b\\\\c/node"' },
    ];
    for (const { node, word } of words) {
      const linux = fake({ platform: "linux", nodePath: node, lumemPath: lumem });
      await installService(linux.host, spec());
      expect(linux.files.get(UNIT), node).toContain(`ExecStart=${word} ${lumem} run\n`);
    }

    // `Environment=`: a atribuição inteira entre aspas quando o valor as pede.
    const envs = [
      { path: "/Users/John Doe/bin:/usr/bin", line: 'Environment="PATH=/Users/John Doe/bin:/usr/bin"' },
      { path: '/a"b', line: 'Environment="PATH=/a\\"b"' },
      { path: "/a\\b", line: 'Environment="PATH=/a\\\\b"' },
      { path: "/100% sure", line: 'Environment="PATH=/100%% sure"' },
      { path: "/plain/bin", line: "Environment=PATH=/plain/bin" },
    ];
    for (const { path, line } of envs) {
      const linux = fake({ platform: "linux", path });
      await installService(linux.host, spec());
      expect(linux.files.get(UNIT), path).toContain(`\n${line}\n`);
    }
  });
});

describe("restartService", () => {
  it("names the command that failed, per supervisor", async () => {
    const mac = fake({ failing: ["launchctl kickstart -k gui/501/tech.cazimi.lumem"] });
    expect(await restartService(mac.host, IDENTITY)).toEqual({
      ok: false,
      reason: expect.stringContaining("`launchctl kickstart -k gui/501/tech.cazimi.lumem` falhou"),
    });

    const linux = fake({ platform: "linux", failing: ["systemctl --user restart lumem.service"] });
    expect(await restartService(linux.host, IDENTITY)).toEqual({
      ok: false,
      reason: expect.stringContaining("`systemctl --user restart lumem.service` falhou"),
    });

    // E o que dá certo é só `ok`.
    expect(await restartService(fake().host, IDENTITY)).toEqual({ ok: true });
  });

  it("runs nothing where there is no supervisor", async () => {
    const { host, events } = fake({ platform: "win32" });

    expect(await restartService(host, IDENTITY)).toEqual({
      ok: false,
      reason: "não há supervisor para win32",
    });
    expect(events).toEqual([]);
  });
});

describe("stopService where there is no supervisor", () => {
  it("runs neither launchctl nor systemctl, and touches no file", async () => {
    const { host, events, files } = fake({ platform: "win32" });

    // Nada carregado, e nada respondendo: parar é o que já está.
    expect(await stopService(host, spec(), async () => false)).toEqual({ ok: true });
    expect(events).toEqual([]);
    expect(files.size).toBe(0);

    // Respondendo, o que responde não é serviço (não há serviço aqui).
    expect(await stopService(host, spec(), async () => true)).toEqual({
      ok: false,
      reason: expect.stringContaining("não roda como serviço"),
    });
    expect(events).toEqual([]);
  });
});
