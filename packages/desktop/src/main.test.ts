import { describe, expect, it, vi } from "vitest";

import type { DesktopConfig } from "@lumem/shared";

import type { WindowLike, WindowOptions } from "./electron-api.js";
import { startApp, type ElectronApi } from "./main.js";
import type { MenuEntry } from "./menu.js";

const CONFIG: DesktopConfig = {
  node: "/opt/node/bin/node",
  lumem: "/opt/lumem/bin/lumem.mjs",
  stateDir: "/Users/ana/.lumem",
  origin: "http://127.0.0.1:4317",
  path: "/usr/bin",
};

const HEALTH = { ok: true, version: "0.6.1", supervised: true, protocolVersion: 1 };
const STATUS = { updateAvailable: false, attention: false };

type Listener = (...args: never[]) => void;

function trpc(data: unknown): Response {
  return new Response(JSON.stringify({ result: { data } }), { status: 200 });
}

/** O Electron dublado do app inteiro: o suficiente para o `startApp` rodar sem janela alguma. */
function fakeElectron() {
  const trays: FakeTray[] = [];
  const windows: FakeBrowserWindow[] = [];
  const appListeners = new Map<string, Listener[]>();
  const handlers = new Map<string, (event: { senderFrame?: { url: string } | null }) => unknown>();
  const login: unknown[] = [];
  const paths: Record<string, string> = {};
  const errors: string[] = [];
  let lock = true;
  let quit = 0;
  let docks = 0;
  const flags = { packaged: true };

  class FakeTray {
    image: unknown;
    menu: MenuEntry[] | undefined;
    popped: MenuEntry[][] = [];
    toolTip = "";
    listeners = new Map<string, Listener[]>();
    constructor(image: unknown) {
      this.image = image;
      trays.push(this);
    }
    setImage(image: unknown) {
      this.image = image;
    }
    setToolTip(value: string) {
      this.toolTip = value;
    }
    setContextMenu(menu: { template: MenuEntry[] }) {
      this.menu = menu.template;
    }
    popUpContextMenu(menu: { template: MenuEntry[] }) {
      this.popped.push(menu.template);
    }
    getBounds() {
      return { x: 1000, y: 0, width: 22, height: 24 };
    }
    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args);
    }
  }

  class FakeBrowserWindow implements WindowLike {
    loaded: string[] = [];
    visible = false;
    constructor(readonly options: WindowOptions) {
      windows.push(this);
    }
    webContents = {
      on: () => {},
      setWindowOpenHandler: () => {},
      loadURL: async () => {},
      getURL: () => "",
    };
    async loadURL(url: string) {
      this.loaded.push(url);
    }
    async loadFile(path: string) {
      this.loaded.push(`file:${path}`);
    }
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    focus() {}
    restore() {}
    isVisible() {
      return this.visible;
    }
    isMinimized() {
      return false;
    }
    isDestroyed() {
      return false;
    }
    setPosition() {}
    on() {}
  }

  const electron: ElectronApi = {
    app: {
      get isPackaged() {
        return flags.packaged;
      },
      setName: () => {},
      setPath: (name, value) => {
        paths[name] = value;
      },
      getAppPath: () => "/app",
      requestSingleInstanceLock: () => lock,
      whenReady: async () => {},
      quit: () => {
        quit += 1;
      },
      on: (event, listener) => {
        appListeners.set(event, [...(appListeners.get(event) ?? []), listener]);
      },
      setLoginItemSettings: (settings) => {
        login.push(settings);
      },
      dock: {
        hide: () => {
          docks += 1;
        },
      },
    },
    Tray: FakeTray as unknown as ElectronApi["Tray"],
    Menu: { buildFromTemplate: (template: MenuEntry[]) => ({ template }) } as unknown as ElectronApi["Menu"],
    nativeImage: {
      createFromPath: (path: string) => ({ path, template: false, setTemplateImage(value: boolean) { this.template = value; } }),
    } as unknown as ElectronApi["nativeImage"],
    BrowserWindow: FakeBrowserWindow as unknown as ElectronApi["BrowserWindow"],
    shell: { openExternal: async () => {} },
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 24, width: 1440, height: 876 } }) },
    dialog: {
      showErrorBox: (title, content) => {
        errors.push(`${title}: ${content}`);
      },
    },
  };

  return {
    electron,
    trays,
    windows,
    handlers,
    login,
    paths,
    errors,
    appListeners,
    docks: () => docks,
    quits: () => quit,
    unpackaged: () => {
      flags.packaged = false;
    },
    denyLock: () => {
      lock = false;
    },
  };
}

interface Options {
  platform?: NodeJS.Platform;
  argv?: string[];
  config?: DesktopConfig | null;
  status?: unknown;
  health?: unknown;
}

async function boot(options: Options = {}) {
  const fake = fakeElectron();
  const asked: string[] = [];
  const exec = vi.fn(async (_command: string, _args: string[], _env: Record<string, string>) => 0);
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    asked.push(url);
    if (url.endsWith("/trpc/health")) {
      if (options.health === null) throw new Error("ECONNREFUSED");
      return trpc(options.health ?? HEALTH);
    }
    return trpc(options.status ?? STATUS);
  }) as unknown as typeof fetch;

  const config = options.config === undefined ? CONFIG : options.config;
  const handle = await startApp({
    electron: fake.electron,
    platform: options.platform ?? "darwin",
    argv: options.argv ?? ["/Applications/Lumem.app/Contents/MacOS/Lumem"],
    home: "/Users/ana",
    env: {},
    readFile: (path) => (config !== null && path.endsWith("lumem-desktop.json") ? JSON.stringify(config) : null),
    request,
    exec,
    now: () => 1_000,
  });
  return { fake, handle, asked, exec };
}

describe("o app sobe", () => {
  it("starts at login with one tray icon", async () => {
    const { fake } = await boot({ platform: "darwin" });

    expect(fake.login).toEqual([{ openAtLogin: true }]);
    expect(fake.trays).toHaveLength(1);
    // Um app de barra de menus não tem ícone no Dock.
    expect(fake.docks()).toBe(1);
  });

  it("does not register a development Electron as a login item", async () => {
    // `electron .` (o e2e, e quem desenvolve) não é o app instalado: registrá-lo poria o
    // Electron do `node_modules` no login da máquina, ligado, apontando para um caminho que o
    // próximo `pnpm install` apaga.
    const fake = fakeElectron();
    fake.unpackaged();

    await startApp({
      electron: fake.electron,
      platform: "darwin",
      argv: ["Electron"],
      home: "/Users/ana",
      env: {},
      readFile: () => JSON.stringify(CONFIG),
      request: (async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return trpc(url.endsWith("/trpc/health") ? HEALTH : STATUS);
      }) as unknown as typeof fetch,
      exec: vi.fn(async () => 0),
      now: () => 0,
    });

    expect(fake.login).toEqual([]);
    expect(fake.trays).toHaveLength(1);
  });

  it("leaves the login to the autostart file on Linux", async () => {
    // No Linux o item de login é o `.desktop` do autostart, que o CLI escreve.
    const { fake } = await boot({ platform: "linux" });

    expect(fake.login).toEqual([]);
    expect(fake.trays).toHaveLength(1);
  });

  it("takes its data directory from the same function the CLI uses", async () => {
    const { fake } = await boot({ platform: "darwin" });

    expect(fake.paths["userData"]).toBe("/Users/ana/Library/Application Support/Lumem");
  });

  it("does not start a second copy", async () => {
    // Dois ícones na barra são a falha visível de um app aberto duas vezes.
    const fake = fakeElectron();
    fake.denyLock();

    const handle = await startApp({
      electron: fake.electron,
      platform: "darwin",
      argv: ["Lumem"],
      home: "/Users/ana",
      env: {},
      readFile: () => JSON.stringify(CONFIG),
      request: vi.fn() as unknown as typeof fetch,
      exec: vi.fn(async () => 0),
      now: () => 0,
    });

    expect(handle).toBeNull();
    expect(fake.trays).toHaveLength(0);
    expect(fake.quits()).toBe(1);
  });

  it("says how to fix a missing config, and quits", async () => {
    const { fake, handle } = await boot({ config: null });

    expect(handle).toBeNull();
    expect(fake.errors.join("\n")).toContain("lumem menubar install");
    expect(fake.trays).toHaveLength(0);
    expect(fake.quits()).toBe(1);
  });

  it("removes the login item and quits on --uninstall", async () => {
    // `lumem menubar uninstall` chama o binário assim, antes de apagar o `.app`.
    const { fake, handle } = await boot({ argv: ["Lumem", "--uninstall"] });

    expect(handle).toBeNull();
    expect(fake.login).toEqual([{ openAtLogin: false }]);
    expect(fake.trays).toHaveLength(0);
    expect(fake.quits()).toBe(1);
  });

  it("leaves --uninstall to the running copy, which is the one that has to quit", async () => {
    // Com o app já de pé, o segundo processo só entrega os argumentos: a instância viva é
    // quem tira o item de login e sai (`second-instance`), e este só encerra.
    const fake = fakeElectron();
    fake.denyLock();
    await startApp({
      electron: fake.electron,
      platform: "darwin",
      argv: ["Lumem", "--uninstall"],
      home: "/Users/ana",
      env: {},
      readFile: () => JSON.stringify(CONFIG),
      request: vi.fn() as unknown as typeof fetch,
      exec: vi.fn(async () => 0),
      now: () => 0,
    });
    expect(fake.login).toEqual([]);
    expect(fake.quits()).toBe(1);

    // E a viva, ao receber o argumento, faz o que o CLI pediu.
    const alive = await boot();
    for (const listener of alive.fake.appListeners.get("second-instance") ?? []) {
      (listener as (event: unknown, argv: string[]) => void)({}, ["Lumem", "--uninstall"]);
    }
    expect(alive.fake.login).toContainEqual({ openAtLogin: false });
    expect(alive.fake.quits()).toBe(1);
  });

  it("stays alive with no window open", async () => {
    // Um app de bandeja fecha a janela e continua: sem este handler o Electron sai.
    const { fake } = await boot();

    expect(fake.appListeners.get("window-all-closed")).toHaveLength(1);
  });
});

describe("o ícone e o menu seguem o daemon", () => {
  it("draws the icon of the state the poll found", async () => {
    const running = await boot();
    expect(running.fake.trays[0]?.image).toMatchObject({ path: "/app/assets/tray-running.png", template: true });

    const stopped = await boot({ health: null });
    expect(stopped.fake.trays[0]?.image).toMatchObject({ path: "/app/assets/tray-stopped.png" });

    const update = await boot({ status: { updateAvailable: true, attention: false } });
    expect(update.fake.trays[0]?.image).toMatchObject({ path: "/app/assets/tray-update.png" });

    const attention = await boot({ status: { updateAvailable: false, attention: true } });
    expect(attention.fake.trays[0]?.image).toMatchObject({ path: "/app/assets/tray-attention.png" });
  });

  it("draws the colored image on Linux, where there is no template", async () => {
    const { fake } = await boot({ platform: "linux" });

    expect(fake.trays[0]?.image).toMatchObject({ path: "/app/assets/tray-running-linux.png", template: false });
  });

  it("on macOS a click toggles the panel and a right click pops the menu up", async () => {
    // Com `setContextMenu` o macOS engole o clique e mostra o menu: o painel e o menu só
    // convivem se o menu sair do clique **direito**.
    const { fake } = await boot({ platform: "darwin" });
    const tray = fake.trays[0]!;

    expect(tray.menu).toBeUndefined();
    tray.emit("click", {}, { x: 1000, y: 0, width: 22, height: 24 });
    await vi.waitFor(() => expect(fake.windows[0]?.loaded).toEqual(["http://127.0.0.1:4317/menubar"]));

    tray.emit("right-click");
    expect(tray.popped).toHaveLength(1);
    expect(tray.popped[0]?.map((item) => item.label)).toEqual([
      "Abrir painel",
      "rodando · v0.6.1",
      "Abrir o Lumem",
      "Parar",
      "Atualizar",
      "Sair",
    ]);
  });

  it("on Linux the context menu is the way in, and the panel is a window", async () => {
    // O `click` do StatusNotifierItem não é confiável e o menu funciona em todo lugar; e
    // sem `getBounds` de verdade não há sob o quê pendurar um painel.
    const { fake } = await boot({ platform: "linux" });
    const tray = fake.trays[0]!;

    expect(tray.menu?.map((item) => item.label)).toContain("Abrir painel");
    tray.menu?.[0]?.click?.();
    await vi.waitFor(() => expect(fake.windows).toHaveLength(1));
    expect(fake.windows[0]?.options.frame).not.toBe(false);
  });

  it("starts and stops the daemon from the menu, then reads it again", async () => {
    const { fake, exec, asked } = await boot({ platform: "linux" });
    const menu = fake.trays[0]!.menu!;
    const before = asked.length;

    menu[3]?.click?.(); // `Parar`: o daemon responde.
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
    expect(exec.mock.calls[0]?.slice(0, 2)).toEqual([CONFIG.node, [CONFIG.lumem, "stop"]]);
    // Sem esperar dez segundos para o ícone refletir o que acabou de acontecer.
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(before));
  });

  it("shows the panel window from --panel, at boot and from a second launch", async () => {
    // `lumem menubar open`: o binário de novo, com `--panel`.
    const first = await boot({ argv: ["Lumem", "--panel"] });
    await vi.waitFor(() => expect(first.fake.windows[0]?.loaded).toEqual(["http://127.0.0.1:4317/menubar"]));

    const later = await boot();
    expect(later.fake.windows).toHaveLength(0);
    for (const listener of later.fake.appListeners.get("second-instance") ?? []) {
      (listener as (event: unknown, argv: string[]) => void)({}, ["Lumem", "--panel"]);
    }
    await vi.waitFor(() => expect(later.fake.windows).toHaveLength(1));
  });
});

describe("o botão Iniciar da página local", () => {
  it("starts the daemon for the stopped page, and for nobody else", async () => {
    const { fake, exec } = await boot({ health: null });
    const start = fake.handlers.get("lumem:start");
    expect(start).toBeDefined();

    const fromStoppedPage = { senderFrame: { url: "file:///app/assets/stopped.html" } };
    expect(await start?.(fromStoppedPage)).toBe(true);
    expect(exec.mock.calls[0]?.slice(0, 2)).toEqual([CONFIG.node, [CONFIG.lumem, "start"]]);

    // Uma página do daemon — ou qualquer outra — não liga nada por aqui.
    exec.mockClear();
    expect(await start?.({ senderFrame: { url: "http://127.0.0.1:4317/menubar" } })).toBe(false);
    expect(await start?.({ senderFrame: null })).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("says it did not work when the start failed", async () => {
    const { fake, exec } = await boot({ health: null });
    exec.mockResolvedValueOnce(1);

    const start = fake.handlers.get("lumem:start");
    expect(await start?.({ senderFrame: { url: "file:///app/assets/stopped.html" } })).toBe(false);
  });
});
