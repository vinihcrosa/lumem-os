import { join } from "node:path";

import { DESKTOP_CONFIG_FILE, desktopDataDir, parseDesktopConfig, type DesktopConfig } from "@lumem/shared";

import { createCommands, type Commands } from "./commands.js";
import type { Rect, WindowConstructor } from "./electron-api.js";
import { buildMenu, statusLine, type MenuEntry } from "./menu.js";
import { createPoller, type Poller } from "./poll.js";
import { trayState, type Snapshot, type TrayState } from "./tray-state.js";
import { createWindows, type Windows } from "./windows.js";

/** O canal por onde a página `Lumem parado` pede o `lumem start` (o `preload.ts` o chama). */
export const START_CHANNEL = "lumem:start";

interface ImageLike {
  setTemplateImage(value: boolean): void;
}

interface TrayLike {
  setImage(image: never): void;
  setToolTip(text: string): void;
  setContextMenu(menu: never): void;
  popUpContextMenu(menu: never): void;
  getBounds(): Rect;
  on(event: string, listener: (...args: never[]) => void): unknown;
}

/**
 * O Electron que o `startApp` usa. Só o que ele chama: o `index.ts` passa o de verdade e o
 * compilador confere que cabe; a suíte passa um dublê e nunca carrega o Electron.
 */
export interface ElectronApi {
  app: {
    /** `false` em `electron .`: o app instalado é o único que se registra no login. */
    readonly isPackaged: boolean;
    setName(name: string): void;
    setPath(name: "userData", path: string): void;
    getAppPath(): string;
    requestSingleInstanceLock(): boolean;
    whenReady(): Promise<unknown>;
    quit(): void;
    on(event: string, listener: (...args: never[]) => void): unknown;
    setLoginItemSettings(settings: { openAtLogin: boolean }): void;
    dock?: { hide(): void } | undefined;
  };
  Tray: new (image: never) => TrayLike;
  Menu: { buildFromTemplate(template: MenuEntry[]): unknown };
  nativeImage: { createFromPath(path: string): ImageLike };
  BrowserWindow: WindowConstructor;
  shell: { openExternal(url: string): Promise<void> };
  ipcMain: {
    handle(channel: string, handler: (event: { senderFrame?: { url: string } | null }) => unknown): void;
  };
  screen: { getDisplayMatching(rect: Rect): { workArea: Rect } };
  dialog: { showErrorBox(title: string, content: string): void };
}

export interface AppDeps {
  electron: ElectronApi;
  platform: NodeJS.Platform;
  argv: readonly string[];
  home: string;
  env: { XDG_CONFIG_HOME?: string | undefined };
  /** `null` quando o arquivo não existe. */
  readFile(path: string): string | null;
  request?: typeof fetch;
  /** Roda e espera. @returns o código de saída. */
  exec(command: string, args: string[], env: Record<string, string>): Promise<number>;
  now(): number;
}

export interface AppHandle {
  tray: TrayLike;
  windows: Windows;
  poller: Poller;
}

/**
 * Os argumentos com que o CLI chama o binário (`lumem menubar open` e `uninstall`).
 * Quem os recebe pode ser um segundo processo, e o Electron o entrega à instância viva.
 */
const FLAG_PANEL = "--panel";
const FLAG_UNINSTALL = "--uninstall";

function readConfig(deps: AppDeps, dataDir: string): DesktopConfig | null {
  const raw = deps.readFile(join(dataDir, DESKTOP_CONFIG_FILE));
  if (raw === null) return null;
  try {
    return parseDesktopConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * O app de barra do Lumem (`038` Parte 4), decidido em módulos puros e ligado aqui.
 *
 * Pequeno de propósito: cada decisão (o ícone, o menu, as janelas, a trava de navegação,
 * os comandos) mora num módulo que uma suíte prova com o Electron dublado; este arquivo só
 * as liga — e o e2e prova a ligação com o Electron de verdade.
 *
 * @returns `null` quando não há o que rodar: outra cópia já está de pé, o CLI pediu para
 * remover o item de login, ou falta o `lumem-desktop.json`.
 */
export async function startApp(deps: AppDeps): Promise<AppHandle | null> {
  const { electron, platform, argv, home } = deps;
  const { app } = electron;

  app.setName("Lumem");
  // A pasta é calculada por quem escreve o arquivo (o CLI), e este app a **adota**: dois
  // cálculos do mesmo caminho é como um instala e o outro lê em outro lugar.
  const dataDir = desktopDataDir({ platform, home, env: deps.env });
  app.setPath("userData", dataDir);

  // Uma só cópia: dois ícones na barra são a falha visível de um app aberto duas vezes.
  // Quem chega depois entrega os argumentos à viva (`second-instance`) e sai — e é por isso
  // que o `--uninstall` vem **depois**: com uma cópia rodando é ela que precisa sair.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }
  if (argv.includes(FLAG_UNINSTALL)) {
    removeLoginItemAndQuit(electron);
    return null;
  }

  const config = readConfig(deps, dataDir);
  if (config === null) {
    electron.dialog.showErrorBox("Lumem", "Não achei o lumem-desktop.json. Rode `lumem menubar install`.");
    app.quit();
    return null;
  }

  // Um app de bandeja continua vivo sem janela nenhuma. Sem este handler o Electron sai
  // quando a última fecha.
  app.on("window-all-closed", () => {});
  await app.whenReady();
  return await boot(deps, config);
}

function removeLoginItemAndQuit({ app }: ElectronApi): void {
  app.setLoginItemSettings({ openAtLogin: false });
  app.quit();
}

async function boot(deps: AppDeps, config: DesktopConfig): Promise<AppHandle> {
  const { electron, platform, argv, home } = deps;
  const { app } = electron;
  const request = deps.request ?? fetch;
  const assets = join(app.getAppPath(), "assets");

  if (platform === "darwin") {
    // Um app de barra de menus não tem ícone no Dock, e abre sozinho quando a pessoa entra
    // — o app **instalado**: `electron .` registraria o Electron do `node_modules` no login.
    app.dock?.hide();
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  }

  let poller: Poller | undefined;
  const windows = createWindows({
    BrowserWindow: electron.BrowserWindow,
    shell: electron.shell,
    origin: config.origin,
    stoppedPage: join(assets, "stopped.html"),
    preload: join(app.getAppPath(), "dist", "preload.cjs"),
    isUp: async () => (await poller?.refresh())?.reachable === true,
    workArea: (bounds) => electron.screen.getDisplayMatching(bounds).workArea,
    now: deps.now,
  });

  const commands: Commands = createCommands({ config, home, exec: deps.exec });
  const onLinux = platform !== "darwin";

  let redraw: (snapshot: Snapshot) => void = () => {};
  let shown = "";
  poller = createPoller({
    origin: config.origin,
    request,
    onSnapshot: (snapshot) => {
      // Só redesenha quando algo que se vê mudou: a rodada de dez em dez segundos quase
      // sempre acha o mesmo daemon.
      const key = JSON.stringify(snapshot);
      if (key === shown) return;
      shown = key;
      redraw(snapshot);
    },
  });

  // O ícone só nasce depois da primeira resposta: criá-lo antes o mostraria *rodando* por
  // um instante, para um daemon que talvez nem esteja de pé.
  const first = await poller.refresh();
  const tray = new electron.Tray(imageFor(electron, assets, platform, trayState(first)) as never);
  tray.setToolTip("Lumem");

  // No macOS o ícone é um botão (painel); no Linux o `click` do StatusNotifierItem não é
  // confiável, e o menu de contexto é o caminho — e o painel, uma janela comum.
  const openPanel = (): void => {
    void (onLinux ? windows.openPanelWindow() : windows.showPanel(tray.getBounds()));
  };
  const afterCommand = async (code: number): Promise<number> => {
    await poller?.refresh();
    await windows.reloadStopped();
    return code;
  };

  let menu: unknown;
  redraw = (snapshot) => {
    tray.setImage(imageFor(electron, assets, platform, trayState(snapshot)) as never);
    tray.setToolTip(`Lumem — ${statusLine(snapshot)}`);
    menu = electron.Menu.buildFromTemplate(
      buildMenu(snapshot, {
        openPanel,
        openMain: () => void windows.openMain(),
        start: () => void commands.start().then(afterCommand),
        stop: () => void commands.stop().then(afterCommand),
        update: openPanel,
        quit: () => {
          app.quit();
        },
      }),
    );
    if (onLinux) tray.setContextMenu(menu as never);
  };
  redraw(first);

  if (!onLinux) {
    tray.on("click", ((_event: unknown, bounds: Rect) => void windows.togglePanel(bounds)) as never);
    // Com `setContextMenu` o macOS engole o clique e abre o menu: os dois só convivem se o
    // menu vier do clique direito.
    tray.on("right-click", (() => {
      if (menu !== undefined) tray.popUpContextMenu(menu as never);
    }) as never);
  }

  // `Iniciar` da página `Lumem parado`: só ela pode pedir, e a resposta diz se deu certo.
  electron.ipcMain.handle(START_CHANNEL, async (event) => {
    const url = event.senderFrame?.url;
    if (url === undefined || !windows.isStoppedPage(url)) return false;
    return (await commands.start().then(afterCommand)) === 0;
  });

  app.on("second-instance", ((_event: unknown, otherArgv: string[]) => {
    if (otherArgv.includes(FLAG_UNINSTALL)) removeLoginItemAndQuit(electron);
    else if (otherArgv.includes(FLAG_PANEL)) void windows.openPanelWindow();
  }) as never);

  poller.start(false);
  if (argv.includes(FLAG_PANEL)) void windows.openPanelWindow();
  return { tray, windows, poller };
}

/**
 * A imagem do estado. No macOS são modelos monocromáticos (a barra os pinta de claro ou
 * de escuro); no Linux, coloridos, porque não há quem inverta e o painel pode ser das duas
 * cores.
 */
function imageFor(electron: ElectronApi, assets: string, platform: NodeJS.Platform, state: TrayState) {
  const mac = platform === "darwin";
  const image = electron.nativeImage.createFromPath(join(assets, mac ? `tray-${state}.png` : `tray-${state}-linux.png`));
  image.setTemplateImage(mac);
  return image;
}
