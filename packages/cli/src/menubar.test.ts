import { describe, expect, it } from "vitest";

import { DESKTOP_PLATFORMS, desktopPackageName, type DesktopPlatform, type InstallCommand } from "@lumem/shared";

import { menubar, type DesktopDeps } from "./menubar.js";
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
  env?: NodeJS.ProcessEnv;
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
  const packageDir = `${SCOPE_DIR}/lumem-desktop-${key}`;
  if (options.installed === true) existing.add(packageDir);
  if (options.installed === true && platform === "darwin") existing.add("/Users/ana/Applications/Lumem.app");

  const host: ServiceHost = {
    platform: platform as NodeJS.Platform,
    uid: 501,
    home: "/Users/ana",
    nodePath: "/opt/node/bin/node",
    lumemPath: LUMEM,
    path: "/usr/bin",
    exec: async (command, args): Promise<ExecResult> => {
      events.push([command, ...args].join(" "));
      return { code: 0, stdout: "", stderr: "" };
    },
    read: (path) => files.get(path) ?? null,
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
      if ((options.installCode ?? 0) === 0 && command.args.some((arg) => arg.includes("lumem-desktop"))) {
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

  it("uses the manager that owns the copy", async () => {
    const run = setup({ platform: "linux", arch: "x64", installed: true, manager: "pnpm" });

    await menubar("uninstall", run.deps);

    expect(run.events).toContain("install pnpm remove --global @vinihcrosa/lumem-desktop-linux-x64");
  });

  it("keeps the app when the manager refuses to remove the package", async () => {
    const run = setup({ platform: "darwin", installed: true, installCode: 7 });

    expect(await menubar("uninstall", run.deps)).toBe(7);

    // Nada mais foi tocado: o pacote continua, então o app continua com o que precisa.
    expect(run.events.filter((line) => !line.startsWith("install "))).toEqual([]);
  });
});
