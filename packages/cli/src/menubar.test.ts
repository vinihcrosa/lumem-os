import { describe, expect, it } from "vitest";

import { DESKTOP_PLATFORMS, desktopPackageName, type DesktopPlatform, type InstallCommand } from "@lumem/shared";

import { menubar, takeDesktopAlong, type DesktopDeps } from "./menubar.js";
import type { ExecResult, ServiceHost } from "./service.js";

/**
 * `lumem menubar install`, `open` e `uninstall` (`038` Parte 4), com o gerenciador de pacotes,
 * `ditto`, `rm` e o disco dublados — o mesmo desenho da instalação do adaptador: nenhum
 * `npm install` de verdade, nenhum `~/Applications` de verdade. Quem instala o pacote
 * publicado é o `pnpm smoke:install --only desktop`.
 *
 * Uma lista só, cronológica, recebe comandos **e** escritas: a ordem (instalar antes de
 * copiar, remover o item de login antes de apagar o app) é metade do que os checks afirmam.
 */

const LUMEM = "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs";
const SCOPE_DIR = "/opt/node/lib/node_modules/@vinihcrosa";
const VERSION = "0.7.0";
const ORIGIN = "http://127.0.0.1:4317";

interface Run {
  deps: DesktopDeps;
  events: string[];
  out: string[];
  err: string[];
  files: Map<string, string>;
  launched: string[];
}

interface RunOptions {
  platform?: string;
  arch?: string;
  manager?: DesktopDeps["manager"];
  installCode?: number;
  /** Já há um pacote do app instalado (o caso de `uninstall` e `open`). */
  installed?: boolean;
  /** Cada metade de `installed` sozinha: o pacote no disco, e o `.app` copiado (só no macOS). */
  pkg?: boolean;
  app?: boolean;
  /** O gerenciador saiu 0 e não deixou o pacote no disco. */
  leavesNothing?: boolean;
  /** Comandos (`"ditto -x -k …"`) que saem com este resultado em vez de 0. */
  exec?: Record<string, ExecResult>;
  /** O `lumem` resolvido, quando não é o de sempre. */
  lumem?: string;
  env?: NodeJS.ProcessEnv;
  /** O que `/proc/sys` diz; um caminho que não está aqui não existe na máquina. */
  sysctl?: Record<string, string>;
}

function setup(options: RunOptions = {}): Run {
  const platform = options.platform ?? "darwin";
  const arch = options.arch ?? "arm64";
  const events: string[] = [];
  const files = new Map<string, string>();
  const launched: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const existing = new Set<string>();
  const key = `${platform}-${arch}` as DesktopPlatform;
  const lumem = options.lumem ?? LUMEM;
  const packageDir = `${lumem.replace(/\/lumem-os\/bin\/lumem\.mjs$/, "")}/lumem-desktop-${key}`;
  if (options.pkg ?? options.installed === true) existing.add(packageDir);
  if (options.app ?? (options.installed === true && platform === "darwin")) existing.add("/Users/ana/Applications/Lumem.app");

  const host: ServiceHost = {
    platform: platform as NodeJS.Platform,
    uid: 501,
    home: "/Users/ana",
    nodePath: "/opt/node/bin/node",
    lumemPath: lumem,
    path: "/usr/bin",
    exec: async (command, args): Promise<ExecResult> => {
      const line = [command, ...args].join(" ");
      events.push(line);
      return options.exec?.[line] ?? { code: 0, stdout: "", stderr: "" };
    },
    read: (path) => files.get(path) ?? options.sysctl?.[path] ?? null,
    exists: (path) => existing.has(path) || files.has(path),
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
    now: () => 0,
    sleep: async () => {},
  };

  const deps: DesktopDeps = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    host,
    arch,
    env: options.env ?? {},
    version: VERSION,
    manager: options.manager ?? "npm",
    where: { stateDir: "/Users/ana/.lumem", origin: ORIGIN },
    install: async (command: InstallCommand) => {
      events.push(`install ${command.command} ${command.args.join(" ")}`);
      if (
        (options.installCode ?? 0) === 0 &&
        options.leavesNothing !== true &&
        command.args.some((arg) => arg.includes("lumem-desktop"))
      ) {
        existing.add(packageDir);
      }
      return options.installCode ?? 0;
    },
    launch: (command, args) => {
      launched.push([command, ...args].join(" "));
    },
  };
  return { deps, events, out, err, files, launched };
}

describe("lumem menubar install", () => {
  it("installs the package of each supported platform", async () => {
    // As quatro, cada uma com o pacote dela na versão exata do daemon (`LUMEM_VERSION`), e o
    // `lumem-desktop.json` com o que o app não consegue descobrir sozinho.
    for (const key of DESKTOP_PLATFORMS) {
      const [platform, arch] = key.split("-") as [string, string];
      const run = setup({ platform, arch });

      expect(await menubar("install", run.deps), key).toBe(0);

      expect(run.events, key).toContain(`install npm install --global ${desktopPackageName(key)}@${VERSION}`);
      const dataDir =
        platform === "darwin" ? "/Users/ana/Library/Application Support/Lumem" : "/Users/ana/.config/Lumem";
      expect(JSON.parse(run.files.get(`${dataDir}/lumem-desktop.json`) ?? "null"), key).toEqual({
        node: "/opt/node/bin/node",
        lumem: LUMEM,
        stateDir: "/Users/ana/.lumem",
        origin: ORIGIN,
        // O `PATH` do terminal: o `Iniciar` do app o passa ao `lumem start`.
        path: "/usr/bin",
      });
      // Instalar vem antes de gravar: um pacote que não instalou não deixa arquivo de app.
      expect(run.events.findIndex((line) => line.startsWith("install ")), key).toBeLessThan(
        run.events.findIndex((line) => line === `write ${dataDir}/lumem-desktop.json`),
      );
    }
  });

  it("rewrites lumem-desktop.json on every install", async () => {
    // A porta 9: o arquivo é do CLI, e cada `install` o refaz com o `node`, o `lumem`, o `PATH`
    // e a origem de agora. Um app que segue lendo o de uma instalação velha roda o `lumem`
    // que já não existe.
    const run = setup({ platform: "darwin" });
    const file = "/Users/ana/Library/Application Support/Lumem/lumem-desktop.json";
    run.files.set(
      file,
      JSON.stringify({ node: "/velho/node", lumem: "/velho/lumem.mjs", stateDir: "/velho", origin: "http://127.0.0.1:1", path: "/bin" }),
    );

    expect(await menubar("install", run.deps)).toBe(0);

    expect(JSON.parse(run.files.get(file) ?? "null")).toEqual({
      node: "/opt/node/bin/node",
      lumem: LUMEM,
      stateDir: "/Users/ana/.lumem",
      origin: ORIGIN,
      path: "/usr/bin",
    });
  });

  it("installs with the manager that owns the running copy", async () => {
    const run = setup({ manager: "pnpm" });

    expect(await menubar("install", run.deps)).toBe(0);

    expect(run.events).toContain(`install pnpm add --global @vinihcrosa/lumem-desktop-darwin-arm64@${VERSION}`);
  });

  it("puts the app where the desktop finds it", async () => {
    // macOS: o `.app` sai do zip do pacote — `ditto` e não `cp`, porque o `.app` tem
    // symlinks que o npm não guarda e a assinatura depende deles.
    const mac = setup({ platform: "darwin", arch: "arm64" });
    expect(await menubar("install", mac.deps)).toBe(0);

    expect(mac.events).toContain("rm -rf /Users/ana/Applications/Lumem.app");
    expect(mac.events).toContain(
      `ditto -x -k ${SCOPE_DIR}/lumem-desktop-darwin-arm64/Lumem.zip /Users/ana/Applications`,
    );
    expect(mac.events.indexOf("rm -rf /Users/ana/Applications/Lumem.app")).toBeLessThan(
      mac.events.findIndex((line) => line.startsWith("ditto ")),
    );
    // Nada de `.desktop` no macOS.
    expect([...mac.files.keys()].some((path) => path.endsWith(".desktop"))).toBe(false);

    // Linux: dois `.desktop`. O do menu de aplicativos abre o painel como janela; o do
    // autostart só sobe o ícone.
    const linux = setup({ platform: "linux", arch: "x64" });
    expect(await menubar("install", linux.deps)).toBe(0);

    const executable = `${SCOPE_DIR}/lumem-desktop-linux-x64/app/lumem-desktop`;
    const launcher = linux.files.get("/Users/ana/.local/share/applications/lumem.desktop") ?? "";
    const autostart = linux.files.get("/Users/ana/.config/autostart/lumem.desktop") ?? "";
    expect(launcher).toContain("[Desktop Entry]");
    expect(launcher).toContain(`Exec="${executable}" --panel`);
    expect(autostart).toContain(`Exec="${executable}"\n`);
    expect(autostart).not.toContain("--panel");
    expect(linux.events.some((line) => line.startsWith("ditto"))).toBe(false);

    // Os dois arquivos, inteiros: o do menu não leva a chave do autostart (ela o ligaria no
    // login), e ambos apontam o ícone para dentro do pacote.
    const icon = `${SCOPE_DIR}/lumem-desktop-linux-x64/icon.png`;
    const entry = (exec: string) =>
      `[Desktop Entry]\nType=Application\nName=Lumem\nComment=O painel do Lumem\nExec=${exec}\nIcon=${icon}\nTerminal=false\nCategories=Development;\nStartupWMClass=Lumem\n`;
    expect(launcher).toBe(entry(`"${executable}" --panel`));
    expect(autostart).toBe(`${entry(`"${executable}"`)}X-GNOME-Autostart-enabled=true\n`);

    // macOS: a pasta `~/Applications` existe antes do `ditto` — numa conta nova ela não existe.
    expect(mac.events.indexOf("mkdir /Users/ana/Applications")).toBeGreaterThanOrEqual(0);
    expect(mac.events.indexOf("mkdir /Users/ana/Applications")).toBeLessThan(
      mac.events.indexOf("rm -rf /Users/ana/Applications/Lumem.app"),
    );
  });

  it("quotes an executable path that the .desktop would read as syntax", async () => {
    // `Exec=` lê `"`, `` ` ``, `$` e `\` como sintaxe; o caminho do pacote é de quem instalou.
    const lumem = '/opt/we"ird $x `y` z\\w/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs';
    const run = setup({ platform: "linux", arch: "x64", lumem });

    expect(await menubar("install", run.deps)).toBe(0);

    const launcher = run.files.get("/Users/ana/.local/share/applications/lumem.desktop") ?? "";
    const scope = '/opt/we\\"ird \\$x \\`y\\` z\\\\w/node_modules/@vinihcrosa';
    expect(launcher).toContain(`Exec="${scope}/lumem-desktop-linux-x64/app/lumem-desktop" --panel\n`);
  });

  it("adds no-sandbox only where the kernel refuses the sandbox", async () => {
    // O Chromium só sobe o sandbox por user namespaces sem privilégio; onde o kernel os nega o
    // app aborta ao abrir. Então a flag vai **só** onde o kernel nega, e a saída diz por quê.
    const USERNS = "/proc/sys/kernel/unprivileged_userns_clone";
    const APPARMOR = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
    // Os 9 estados do AC 78: cada botão em `0`, `1` ou ausente. A tabela é o conjunto inteiro, e
    // não os exemplos: as rodadas 3 e 4 da verificação acharam, cada uma, uma detecção que deixava
    // um botão decidir sozinho e passava numa tabela que só tinha os casos nomeados.
    const cases: { name: string; sysctl: Record<string, string>; refused: boolean; says: string }[] = [
      { name: "userns absent, apparmor absent", sysctl: {}, refused: false, says: "" },
      { name: "userns absent, apparmor 0", sysctl: { [APPARMOR]: "0\n" }, refused: false, says: "" },
      { name: "userns absent, apparmor 1", sysctl: { [APPARMOR]: "1\n" }, refused: true, says: "apparmor_restrict_unprivileged_userns=1" },
      { name: "userns 1, apparmor absent", sysctl: { [USERNS]: "1\n" }, refused: false, says: "" },
      { name: "userns 1, apparmor 0", sysctl: { [USERNS]: "1\n", [APPARMOR]: "0\n" }, refused: false, says: "" },
      // O kernel do Ubuntu 23.10 em diante, o que o runner do `release.yml` mediu.
      { name: "userns 1, apparmor 1 (Ubuntu 23.10+)", sysctl: { [USERNS]: "1\n", [APPARMOR]: "1\n" }, refused: true, says: "apparmor_restrict_unprivileged_userns=1" },
      { name: "userns 0, apparmor absent", sysctl: { [USERNS]: "0\n" }, refused: true, says: "unprivileged_userns_clone=0" },
      { name: "userns 0, apparmor 0", sysctl: { [USERNS]: "0\n", [APPARMOR]: "0\n" }, refused: true, says: "unprivileged_userns_clone=0" },
      { name: "userns 0, apparmor 1", sysctl: { [USERNS]: "0\n", [APPARMOR]: "1\n" }, refused: true, says: "unprivileged_userns_clone=0" },
    ];
    const executable = `${SCOPE_DIR}/lumem-desktop-linux-x64/app/lumem-desktop`;

    for (const { name, sysctl, refused, says } of cases) {
      const run = setup({ platform: "linux", arch: "x64", sysctl });

      expect(await menubar("install", run.deps), name).toBe(0);

      const launcher = run.files.get("/Users/ana/.local/share/applications/lumem.desktop") ?? "";
      const autostart = run.files.get("/Users/ana/.config/autostart/lumem.desktop") ?? "";
      const said = run.out.filter((line) => line.includes("--no-sandbox"));
      if (refused) {
        expect(launcher, name).toContain(`Exec="${executable}" --no-sandbox --panel\n`);
        expect(autostart, name).toContain(`Exec="${executable}" --no-sandbox\n`);
        expect(said, name).toHaveLength(1);
        expect(said[0], name).toContain(says);
      } else {
        expect(launcher, name).toContain(`Exec="${executable}" --panel\n`);
        expect(autostart, name).toContain(`Exec="${executable}"\n`);
        expect(launcher + autostart, name).not.toContain("--no-sandbox");
        expect(said, name).toEqual([]);
      }
    }
  });

  it("says where the app is, per platform", async () => {
    const mac = setup({ platform: "darwin" });
    await menubar("install", mac.deps);
    expect(mac.out.at(-1)).toBe("app em /Users/ana/Applications/Lumem.app; o ícone está na barra de menus.");

    const linux = setup({ platform: "linux", arch: "x64" });
    await menubar("install", linux.deps);
    expect(linux.out.at(-1)).toBe("app instalado; o ícone está na bandeja e o autostart está ligado.");
  });

  it("fails and opens nothing when the manager leaves no package behind", async () => {
    const run = setup({ leavesNothing: true });

    expect(await menubar("install", run.deps)).toBe(1);

    expect(run.err.join("\n")).toContain(`instalou, mas o pacote não está em ${SCOPE_DIR}/lumem-desktop-darwin-arm64`);
    expect(run.events.some((line) => line.startsWith("write "))).toBe(false);
    expect(run.launched).toEqual([]);
  });

  it("fails and opens nothing when the app cannot be copied, and says why", async () => {
    const ditto = `ditto -x -k ${SCOPE_DIR}/lumem-desktop-darwin-arm64/Lumem.zip /Users/ana/Applications`;

    const withReason = setup({ exec: { [ditto]: { code: 1, stdout: "", stderr: " sem espaço no disco \n" } } });
    expect(await menubar("install", withReason.deps)).toBe(1);
    expect(withReason.err).toContain("não consegui copiar o app para /Users/ana/Applications/Lumem.app: sem espaço no disco");
    expect(withReason.launched).toEqual([]);
    expect(withReason.out.join("\n")).not.toContain("app em ");

    const withCode = setup({ exec: { [ditto]: { code: 9, stdout: "", stderr: "" } } });
    expect(await menubar("install", withCode.deps)).toBe(1);
    expect(withCode.err).toContain("não consegui copiar o app para /Users/ana/Applications/Lumem.app: ditto saiu com 9");
  });

  it("starts the app after installing it", async () => {
    const mac = setup({ platform: "darwin" });
    await menubar("install", mac.deps);
    expect(mac.launched).toEqual(["open /Users/ana/Applications/Lumem.app"]);

    const linux = setup({ platform: "linux", arch: "arm64" });
    await menubar("install", linux.deps);
    expect(linux.launched).toEqual([`${SCOPE_DIR}/lumem-desktop-linux-arm64/app/lumem-desktop`]);
  });

  it("refuses an unsupported platform", async () => {
    for (const [platform, arch] of [
      ["win32", "x64"],
      ["linux", "ia32"],
    ] as const) {
      const run = setup({ platform, arch });

      expect(await menubar("install", run.deps), `${platform}-${arch}`).toBe(1);

      // Nada foi instalado nem escrito, e a mensagem diz as quatro que existem.
      expect(run.events).toEqual([]);
      expect(run.err.join("\n")).toContain(`${platform}-${arch}`);
      for (const key of DESKTOP_PLATFORMS) expect(run.err.join("\n")).toContain(key);
    }
  });

  it("says so, and exits 1, when the manager cannot even start", async () => {
    const run = setup();
    run.deps.install = async () => {
      throw new Error("spawn npm ENOENT");
    };

    expect(await menubar("install", run.deps)).toBe(1);

    expect(run.err).toContain("não consegui rodar o npm: spawn npm ENOENT");
    expect(run.events.some((line) => line.startsWith("write "))).toBe(false);
    expect(run.launched).toEqual([]);
  });

  it("returns the manager's code and writes nothing when the install fails", async () => {
    const run = setup({ installCode: 13 });

    expect(await menubar("install", run.deps)).toBe(13);

    expect(run.err.join("\n")).toContain("13");
    expect(run.events.some((line) => line.startsWith("write "))).toBe(false);
    expect(run.launched).toEqual([]);
  });
});

describe("lumem menubar open", () => {
  it("opens the panel as a window through the installed app", async () => {
    // Para o GNOME sem a extensão de AppIndicator: sem ícone, o painel é uma janela.
    const mac = setup({ platform: "darwin", installed: true });
    expect(await menubar("open", mac.deps)).toBe(0);
    expect(mac.launched).toEqual(["/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --panel"]);

    const linux = setup({ platform: "linux", arch: "x64", installed: true });
    expect(await menubar("open", linux.deps)).toBe(0);
    expect(linux.launched).toEqual([`${SCOPE_DIR}/lumem-desktop-linux-x64/app/lumem-desktop --panel`]);
  });

  it("says how to install when the app is not there", async () => {
    const run = setup({ platform: "darwin", installed: false });

    expect(await menubar("open", run.deps)).toBe(1);

    expect(run.err.join("\n")).toContain("lumem menubar install");
    expect(run.launched).toEqual([]);

    // "Sem o pacote **ou** sem o `.app`" é uma disjunção: cada metade sozinha recusa, e só as duas
    // presentes abrem. No Linux só há o pacote.
    const cells = [
      { platform: "darwin", arch: "arm64", pkg: true, app: true, opens: true },
      { platform: "darwin", arch: "arm64", pkg: true, app: false, opens: false },
      { platform: "darwin", arch: "arm64", pkg: false, app: true, opens: false },
      { platform: "darwin", arch: "arm64", pkg: false, app: false, opens: false },
      { platform: "linux", arch: "x64", pkg: true, app: false, opens: true },
      { platform: "linux", arch: "x64", pkg: false, app: false, opens: false },
    ];
    for (const { platform, arch, pkg, app, opens } of cells) {
      const name = `${platform} pacote=${String(pkg)} app=${String(app)}`;
      const cell = setup({ platform, arch, pkg, app });

      expect(await menubar("open", cell.deps), name).toBe(opens ? 0 : 1);

      expect(cell.launched.length, name).toBe(opens ? 1 : 0);
      expect(cell.err.join("\n").includes("lumem menubar install"), name).toBe(!opens);
    }
  });
});

describe("lumem menubar uninstall", () => {
  it("uninstall leaves nothing behind", async () => {
    // macOS: o app tira o **próprio** item de login (`--uninstall`) antes de o `.app` ir
    // embora — depois de apagado, não há quem o tire.
    const mac = setup({ platform: "darwin", installed: true });
    mac.files.set("/Users/ana/Library/Application Support/Lumem/lumem-desktop.json", "{}");
    expect(await menubar("uninstall", mac.deps)).toBe(0);

    const login = mac.events.indexOf("/Users/ana/Applications/Lumem.app/Contents/MacOS/Lumem --uninstall");
    const pkg = mac.events.indexOf("install npm uninstall --global @vinihcrosa/lumem-desktop-darwin-arm64");
    const app = mac.events.indexOf("rm -rf /Users/ana/Applications/Lumem.app");
    expect(pkg).toBeGreaterThanOrEqual(0);
    expect(login).toBeGreaterThanOrEqual(0);
    expect(app).toBeGreaterThan(login);
    expect(mac.events).toContain("rm -rf /Users/ana/Library/Application Support/Lumem");

    // Linux: o item de login é o `.desktop` do autostart, e o outro é o do menu.
    const linux = setup({ platform: "linux", arch: "arm64", installed: true });
    linux.files.set("/Users/ana/.local/share/applications/lumem.desktop", "x");
    linux.files.set("/Users/ana/.config/autostart/lumem.desktop", "x");
    expect(await menubar("uninstall", linux.deps)).toBe(0);

    expect(linux.events).toContain("install npm uninstall --global @vinihcrosa/lumem-desktop-linux-arm64");
    expect(linux.events).toContain("remove /Users/ana/.local/share/applications/lumem.desktop");
    expect(linux.events).toContain("remove /Users/ana/.config/autostart/lumem.desktop");
    expect(linux.files.size).toBe(0);
  });

  it("does not ask an app that is not there to remove its own login item", async () => {
    // O pacote está e o `.app` nunca foi copiado: não há quem tirar o item de login, e rodar o
    // binário que não existe seria um erro a mais. O resto da limpeza segue.
    const run = setup({ platform: "darwin", pkg: true, app: false });

    expect(await menubar("uninstall", run.deps)).toBe(0);

    expect(run.events.some((line) => line.endsWith("--uninstall"))).toBe(false);
    expect(run.events).toContain("rm -rf /Users/ana/Applications/Lumem.app");
    expect(run.events).toContain("rm -rf /Users/ana/Library/Application Support/Lumem");
  });

  it("uses the manager that owns the copy", async () => {
    const run = setup({ platform: "linux", arch: "x64", installed: true, manager: "pnpm" });

    await menubar("uninstall", run.deps);

    expect(run.events).toContain("install pnpm remove --global @vinihcrosa/lumem-desktop-linux-x64");
  });

  it("keeps the app when the manager refuses to remove the package", async () => {
    const run = setup({ platform: "darwin", installed: true, installCode: 7 });

    expect(await menubar("uninstall", run.deps)).toBe(7);
    expect(run.err).toContain("o npm saiu com 7; o app continua instalado.");

    // Nada mais foi tocado: o pacote continua, então o app continua com o que precisa.
    expect(run.events.filter((line) => !line.startsWith("install "))).toEqual([]);
  });
});

describe("lumem upgrade taking the app along", () => {
  it("fails and says why when the app cannot be copied again", async () => {
    const ditto = `ditto -x -k ${SCOPE_DIR}/lumem-desktop-darwin-arm64/Lumem.zip /Users/ana/Applications`;
    const run = setup({ installed: true, exec: { [ditto]: { code: 1, stdout: "", stderr: "sem espaço" } } });

    expect(await takeDesktopAlong(run.deps)).toBe(1);

    expect(run.err).toContain("não consegui copiar o app para /Users/ana/Applications/Lumem.app: sem espaço");
    expect(run.out).not.toContain("app atualizado.");

    // Copiou: diz que atualizou.
    const fine = setup({ installed: true });
    expect(await takeDesktopAlong(fine.deps)).toBe(0);
    expect(fine.out.at(-1)).toBe("app atualizado.");
  });
});
