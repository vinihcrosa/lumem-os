import { pathToFileURL } from "node:url";

import type { Rect, WindowConstructor, WindowLike, WindowOptions } from "./electron-api.js";

/** 360×520, o tamanho do painel (`038`, AC 61). */
export const PANEL_SIZE = { width: 360, height: 520 } as const;
const MAIN_SIZE = { width: 1280, height: 860 } as const;
/** Um pouco abaixo da barra de menus, para o painel não encostar nela. */
const GAP_BELOW_ICON = 4;
/**
 * Quanto tempo depois de o painel esconder por perder o foco um clique no ícone ainda é o
 * clique que o escondeu. No macOS o clique tira o foco do painel **antes** de chegar como
 * `click`; sem esta guarda o painel esconderia e reabriria no mesmo gesto.
 */
const BLUR_CLICK_WINDOW_MS = 300;

/**
 * As três chaves do AC 67. Cada janela do app as leva, sem exceção: o que ela carrega é a
 * web do daemon, e quem manda no que essa página pode fazer é o processo principal.
 */
const LOCKED = { contextIsolation: true, nodeIntegration: false, sandbox: true } as const;

export interface WindowsDeps {
  BrowserWindow: WindowConstructor;
  shell: { openExternal(url: string): Promise<void> };
  /** A origem gravada no `lumem-desktop.json`. */
  origin: string;
  /** A página **empacotada** que diz `Lumem parado`: o daemon não está lá para servi-la. */
  stoppedPage: string;
  /** O único ponto de contato entre a página e o processo principal. */
  preload: string;
  /** O `/trpc/health` responde? */
  isUp(): Promise<boolean>;
  /** A área útil da tela onde o ícone está, para o painel não sair dela. */
  workArea(iconBounds: Rect): Rect;
  now(): number;
}

export interface Windows {
  /** Clique no ícone (macOS): abre o painel sob ele, ou o esconde se já está aberto. */
  togglePanel(iconBounds: Rect): Promise<void>;
  /** `Abrir painel` no menu: sempre mostra. */
  showPanel(iconBounds: Rect): Promise<void>;
  /** O painel como janela comum: onde não há ícone para pendurá-lo. */
  openPanelWindow(): Promise<void>;
  /** `Abrir o Lumem`: uma janela em `<origem>/`, ou a que já existe em primeiro plano. */
  openMain(): Promise<void>;
  /** O daemon voltou: quem estava na página `Lumem parado` passa para a de verdade. */
  reloadStopped(): Promise<void>;
  /** É a página local? Quem pode pedir ao app para subir o daemon é só ela. */
  isStoppedPage(url: string): boolean;
}

interface Slot {
  window: WindowLike;
  /** O caminho do daemon que esta janela carrega quando ele responde. */
  path: string;
  showingStopped: boolean;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function createWindows(deps: WindowsDeps): Windows {
  const { BrowserWindow, shell, origin, stoppedPage, preload, isUp, workArea, now } = deps;
  const daemonOrigin = originOf(origin);
  const stoppedUrl = pathToFileURL(stoppedPage).href;

  let panel: Slot | undefined;
  let panelWindow: Slot | undefined;
  let main: Slot | undefined;
  let hiddenByBlurAt = Number.NEGATIVE_INFINITY;

  const sameOrigin = (url: string): boolean => daemonOrigin !== null && originOf(url) === daemonOrigin;

  /** Um link que sai do app vai para o navegador, e só se for um link da web. */
  function openOutside(url: string): void {
    if (isWebLink(url)) void shell.openExternal(url);
  }

  /** Toda janela nasce por aqui: as três chaves, o preload e a trava de navegação (AC 67). */
  function create(options: WindowOptions): WindowLike {
    const window = new BrowserWindow({
      ...options,
      webPreferences: { ...LOCKED, preload },
    });

    const guard = (url: string, event: { preventDefault(): void }): boolean => {
      // A página local é a única que não é do daemon, e ninguém navega **para** ela.
      if (sameOrigin(url) || url === stoppedUrl) return false;
      event.preventDefault();
      return true;
    };
    window.webContents.on("will-navigate", (event: { preventDefault(): void }, url: string) => {
      // Um link comum que sairia da origem abre no navegador, em vez de não fazer nada.
      if (guard(url, event)) openOutside(url);
    });
    window.webContents.on("will-redirect", (event: { preventDefault(): void }, url: string) => {
      guard(url, event);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      // O painel abre o Lumem por `<a target="_blank">` e `window.open("/")`: a origem do
      // daemon é a janela principal (AC 63), e só o que vem de fora vai para o navegador.
      if (sameOrigin(url)) void openMain();
      else openOutside(url);
      return { action: "deny" };
    });
    return window;
  }

  /** Carrega o daemon, ou a página local quando ele não responde. */
  async function load(slot: Slot): Promise<void> {
    const up = await isUp();
    slot.showingStopped = !up;
    try {
      await (up ? slot.window.loadURL(`${origin}${slot.path}`) : slot.window.loadFile(stoppedPage));
    } catch {
      // Uma navegação que foi trocada por outra (`ERR_ABORTED`), ou o daemon que caiu no
      // meio: o Chromium mostra a própria página de erro, que já é a mensagem.
    }
  }

  function place(iconBounds: Rect, window: WindowLike): void {
    const area = workArea(iconBounds);
    const centered = Math.round(iconBounds.x + iconBounds.width / 2 - PANEL_SIZE.width / 2);
    const x = Math.max(area.x, Math.min(centered, area.x + area.width - PANEL_SIZE.width));
    window.setPosition(x, iconBounds.y + iconBounds.height + GAP_BELOW_ICON);
  }

  async function showPanel(iconBounds: Rect): Promise<void> {
    if (panel === undefined || panel.window.isDestroyed()) {
      const window = create({
        ...PANEL_SIZE,
        show: false,
        frame: false,
        resizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
      });
      panel = { window, path: "/menubar", showingStopped: false };
      window.on("blur", () => {
        if (!window.isVisible()) return;
        hiddenByBlurAt = now();
        window.hide();
      });
    }
    // Lido de novo a cada abertura: o painel de um minuto atrás não é o de agora, e o
    // daemon pode ter parado ou voltado.
    await load(panel);
    place(iconBounds, panel.window);
    panel.window.show();
    panel.window.focus();
  }

  async function openMain(): Promise<void> {
    if (main !== undefined && !main.window.isDestroyed()) {
      focusExisting(main.window);
      return;
    }
    const window = create({ ...MAIN_SIZE, show: false, title: "Lumem" });
    main = { window, path: "/", showingStopped: false };
    window.on("closed", () => {
      main = undefined;
    });
    await load(main);
    window.show();
    window.focus();
  }

  return {
    async togglePanel(iconBounds) {
      if (panel !== undefined && !panel.window.isDestroyed() && panel.window.isVisible()) {
        panel.window.hide();
        return;
      }
      if (now() - hiddenByBlurAt < BLUR_CLICK_WINDOW_MS) return;
      await showPanel(iconBounds);
    },

    showPanel,

    async openPanelWindow() {
      if (panelWindow !== undefined && !panelWindow.window.isDestroyed()) {
        focusExisting(panelWindow.window);
        return;
      }
      const window = create({ ...PANEL_SIZE, show: false, title: "Lumem" });
      panelWindow = { window, path: "/menubar", showingStopped: false };
      window.on("closed", () => {
        panelWindow = undefined;
      });
      await load(panelWindow);
      window.show();
      window.focus();
    },

    openMain,

    async reloadStopped() {
      for (const slot of [panel, panelWindow, main]) {
        if (slot !== undefined && !slot.window.isDestroyed() && slot.showingStopped) await load(slot);
      }
    },

    isStoppedPage: (url) => url === stoppedUrl,
  };
}

function focusExisting(window: WindowLike): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
