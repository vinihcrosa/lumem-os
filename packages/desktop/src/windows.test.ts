import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Rect, WindowLike, WindowOptions } from "./electron-api.js";
import { createWindows, PANEL_SIZE, type Windows } from "./windows.js";

const ORIGIN = "http://127.0.0.1:4317";
const STOPPED_PAGE = "/app/assets/stopped.html";
const PRELOAD = "/app/dist/preload.cjs";
const ICON: Rect = { x: 1000, y: 0, width: 22, height: 24 };
const SCREEN: Rect = { x: 0, y: 24, width: 1440, height: 876 };

type Handler = (...args: never[]) => void;

/**
 * Uma janela que só anota o que lhe pediram e deixa o teste disparar os eventos que o
 * Electron dispararia (`blur`, `closed`, `will-navigate`). É o **Electron dublado** da
 * política de teste: nenhuma janela de verdade, e cada asserção lê uma chamada.
 */
class FakeWindow implements WindowLike {
  static all: FakeWindow[] = [];

  readonly calls: string[] = [];
  readonly listeners = new Map<string, Handler[]>();
  readonly contents = new Map<string, Handler[]>();
  visible = false;
  minimized = false;
  destroyed = false;
  openHandler: ((details: { url: string }) => { action: "deny" }) | undefined;
  position: [number, number] | undefined;
  loaded: string[] = [];

  readonly webContents = {
    on: (event: string, listener: Handler) => {
      this.contents.set(event, [...(this.contents.get(event) ?? []), listener]);
    },
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: "deny" }) => {
      this.openHandler = handler;
    },
    loadURL: async (url: string) => {
      this.loaded.push(url);
    },
    getURL: () => this.loaded.at(-1) ?? "",
  };

  constructor(readonly options: WindowOptions) {
    FakeWindow.all.push(this);
  }

  async loadURL(url: string) {
    this.loaded.push(url);
  }
  async loadFile(path: string) {
    this.loaded.push(`file:${path}`);
  }
  show() {
    this.calls.push("show");
    this.visible = true;
  }
  hide() {
    this.calls.push("hide");
    this.visible = false;
  }
  focus() {
    this.calls.push("focus");
  }
  restore() {
    this.calls.push("restore");
    this.minimized = false;
  }
  isVisible() {
    return this.visible;
  }
  isMinimized() {
    return this.minimized;
  }
  isDestroyed() {
    return this.destroyed;
  }
  setPosition(x: number, y: number) {
    this.position = [x, y];
  }
  on(event: string, listener: Handler) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string) {
    for (const listener of this.listeners.get(event) ?? []) (listener as () => void)();
  }
  /** `will-navigate` e `will-redirect` do `webContents`; devolve se alguém cancelou. */
  navigate(event: "will-navigate" | "will-redirect", url: string): boolean {
    let prevented = false;
    for (const listener of this.contents.get(event) ?? []) {
      (listener as (e: { preventDefault(): void }, url: string) => void)({ preventDefault: () => (prevented = true) }, url);
    }
    return prevented;
  }
}

interface Setup {
  windows: Windows;
  opened: string[];
  external: string[];
  now: { value: number };
  up: { value: boolean };
}

function setup(origin = ORIGIN): Setup {
  const opened: string[] = [];
  const external: string[] = [];
  const now = { value: 10_000 };
  const up = { value: true };
  const windows = createWindows({
    BrowserWindow: FakeWindow as unknown as new (options: WindowOptions) => WindowLike,
    shell: {
      openExternal: async (url: string) => {
        external.push(url);
      },
    },
    origin,
    stoppedPage: STOPPED_PAGE,
    preload: PRELOAD,
    isUp: async () => up.value,
    workArea: () => SCREEN,
    now: () => now.value,
  });
  return { windows, opened, external, now, up };
}

beforeEach(() => {
  FakeWindow.all = [];
});

describe("o painel sob o ícone", () => {
  it("toggles the panel under the icon", async () => {
    const { windows, now } = setup();

    await windows.togglePanel(ICON);

    // Uma janela sem moldura de 360×520, carregando `<origem>/menubar`.
    expect(FakeWindow.all).toHaveLength(1);
    const panel = FakeWindow.all[0]!;
    expect(panel.options).toMatchObject({ width: 360, height: 520, frame: false });
    // Um painel de barra: não nasce visível, não muda de tamanho nem vira tela cheia, não ocupa o
    // Dock nem a barra de tarefas, e fica por cima.
    expect(panel.options).toMatchObject({
      show: false,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
    });
    expect(PANEL_SIZE).toEqual({ width: 360, height: 520 });
    expect(panel.loaded).toEqual([`${ORIGIN}/menubar`]);
    // Centrada no ícone (1000 + 11 − 180) e logo abaixo da barra (0 + 24 + 4).
    expect(panel.position).toEqual([831, 28]);
    expect(panel.visible).toBe(true);
    // Mostrado **e** em foco: sem o foco o `blur` nunca chega e o painel não esconde sozinho.
    expect(panel.calls).toEqual(["show", "focus"]);

    // Clicar de novo a esconde.
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(false);

    // E de novo a mostra — a mesma janela, com o conteúdo lido outra vez: o painel de
    // um minuto atrás não é o de agora.
    now.value += 5_000;
    await windows.togglePanel(ICON);
    expect(FakeWindow.all).toHaveLength(1);
    expect(panel.visible).toBe(true);
    expect(panel.loaded).toEqual([`${ORIGIN}/menubar`, `${ORIGIN}/menubar`]);

    // Perder o foco a esconde.
    panel.emit("blur");
    expect(panel.visible).toBe(false);
  });

  it("does not reopen the panel with the click that made it lose focus", async () => {
    // No macOS o clique no ícone tira o foco do painel **antes** de chegar como `click`:
    // sem a guarda, o painel esconderia e reabriria no mesmo gesto.
    const { windows, now } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;

    panel.emit("blur");
    now.value += 40;
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(false);

    // Um clique de verdade, bem depois, abre.
    now.value += 2_000;
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(true);
  });

  it("reopens exactly when the click window has passed, and not before", async () => {
    const { windows, now } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;

    panel.emit("blur");
    now.value += 299;
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(false);

    // 300 ms depois da perda de foco: já é outro clique.
    now.value += 1;
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(true);
  });

  it("does not count a blur of a panel that was already hidden", async () => {
    // Esconder pelo clique (`hide`) pode ainda disparar `blur`: o painel já estava escondido, e o
    // clique seguinte não é o que o escondeu.
    const { windows, now } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;
    await windows.togglePanel(ICON);
    expect(panel.visible).toBe(false);

    panel.emit("blur");
    now.value += 40;
    await windows.togglePanel(ICON);

    expect(panel.visible).toBe(true);
  });

  it("keeps the panel inside the screen", async () => {
    const { windows } = setup();

    // Um ícone colado na borda direita empurraria 180 px do painel para fora da tela.
    await windows.togglePanel({ x: 1430, y: 0, width: 22, height: 24 });
    expect(FakeWindow.all[0]?.position?.[0]).toBe(1440 - 360);
  });

  it("shows the panel from the menu without toggling it away", async () => {
    // `Abrir painel` no menu sempre mostra; togglar esconderia um painel já aberto.
    const { windows } = setup();
    await windows.showPanel(ICON);
    await windows.showPanel(ICON);

    expect(FakeWindow.all[0]?.visible).toBe(true);
  });

  it("opens the panel as an ordinary window where there is no icon to hang it from", async () => {
    // GNOME sem AppIndicator, e `lumem menubar open`: moldura, e não some ao perder o foco.
    const { windows } = setup();

    await windows.openPanelWindow();
    // A primeira vez já mostra e foca: a janela nasce escondida e só o pedido a traz.
    expect(FakeWindow.all[0]?.calls).toEqual(["show", "focus"]);
    await windows.openPanelWindow();

    expect(FakeWindow.all).toHaveLength(1);
    const window = FakeWindow.all[0]!;
    expect(window.options).toMatchObject({ width: 360, height: 520 });
    expect(window.options.frame).not.toBe(false);
    expect(window.options).toMatchObject({ show: false, title: "Lumem" });
    expect(window.loaded).toEqual([`${ORIGIN}/menubar`]);
    window.emit("blur");
    expect(window.visible).toBe(true);
    // Uma vez por pedido: abrir e pedir de novo trazem a mesma janela para a frente.
    expect(window.calls.filter((call) => call === "focus")).toHaveLength(2);
  });
});

describe("a janela principal", () => {
  it("opens one main window and focuses it after", async () => {
    const { windows } = setup();

    await windows.openMain();
    const main = FakeWindow.all[0]!;
    expect(main.loaded).toEqual([`${ORIGIN}/`]);
    expect(main.visible).toBe(true);
    expect(main.options).toMatchObject({ show: false, title: "Lumem" });
    expect(main.calls).toEqual(["show", "focus"]);

    // Escolher de novo foca a mesma, sem abrir outra nem recarregar. Só restaura quem está
    // minimizado: restaurar uma janela que não está encolhe-a à toa.
    main.calls.length = 0;
    main.visible = false;
    await windows.openMain();
    expect(main.calls).toEqual(["show", "focus"]);
    expect(main.visible).toBe(true);

    main.calls.length = 0;
    main.minimized = true;
    await windows.openMain();
    expect(FakeWindow.all).toHaveLength(1);
    expect(main.loaded).toEqual([`${ORIGIN}/`]);
    expect(main.calls).toEqual(["restore", "show", "focus"]);

    // Fechada, a próxima escolha abre outra.
    main.destroyed = true;
    main.emit("closed");
    await windows.openMain();
    expect(FakeWindow.all).toHaveLength(2);
  });
});

describe("o daemon parado", () => {
  it("shows the local stopped page when the daemon is down", async () => {
    const { windows, up } = setup();
    up.value = false;

    await windows.togglePanel(ICON);

    // A página que vem **com o app**: o daemon não está lá para servir nada.
    const panel = FakeWindow.all[0]!;
    expect(panel.loaded).toEqual([`file:${STOPPED_PAGE}`]);
    expect(panel.visible).toBe(true);

    // Com o daemon de volta, quem estava na página local passa para a de verdade.
    up.value = true;
    await windows.reloadStopped();
    expect(panel.loaded).toEqual([`file:${STOPPED_PAGE}`, `${ORIGIN}/menubar`]);

    // E quem já estava na página de verdade não é recarregado à toa.
    await windows.reloadStopped();
    expect(panel.loaded).toHaveLength(2);
  });

  it("does the same for the main window", async () => {
    const { windows, up } = setup();
    up.value = false;

    await windows.openMain();

    expect(FakeWindow.all[0]?.loaded).toEqual([`file:${STOPPED_PAGE}`]);
  });

  it("knows its own page, so nothing else may ask the app to start the daemon", async () => {
    const { windows } = setup();

    expect(windows.isStoppedPage(`file://${STOPPED_PAGE}`)).toBe(true);
    expect(windows.isStoppedPage(`${ORIGIN}/menubar`)).toBe(false);
    expect(windows.isStoppedPage("file:///etc/passwd")).toBe(false);
  });
});

describe("a trava das janelas", () => {
  it("locks every window to the daemon origin", async () => {
    const { windows, external } = setup();
    await windows.togglePanel(ICON);
    await windows.openMain();
    await windows.openPanelWindow();
    expect(FakeWindow.all).toHaveLength(3);

    for (const window of FakeWindow.all) {
      // As três chaves do AC 67 — e o preload, que é o único ponto de contato.
      expect(window.options.webPreferences).toMatchObject({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: PRELOAD,
      });

      // Navegar para outra origem é cancelado, na navegação e no redirecionamento; a
      // mesma origem passa.
      expect(window.navigate("will-navigate", "https://evil.example/x")).toBe(true);
      expect(window.navigate("will-redirect", "https://evil.example/x")).toBe(true);
      expect(window.navigate("will-navigate", `${ORIGIN}/settings`)).toBe(false);
      expect(window.navigate("will-redirect", `${ORIGIN}/`)).toBe(false);
      // Outra porta do mesmo host é outra origem.
      expect(window.navigate("will-navigate", "http://127.0.0.1:9999/")).toBe(true);
    }

    // A página local é a única que não é do daemon: navegar **para** ela (o app a carrega) não é
    // cancelado, e nem a mesma origem nem ela abrem o navegador.
    external.length = 0;
    const stopped = `file://${STOPPED_PAGE}`;
    for (const window of FakeWindow.all) {
      expect(window.navigate("will-navigate", stopped)).toBe(false);
      expect(window.navigate("will-redirect", stopped)).toBe(false);
      expect(window.navigate("will-navigate", `${ORIGIN}/settings`)).toBe(false);
    }
    expect(external).toEqual([]);

    // Um link externo abre no navegador do sistema, e a janela nunca vira ele. (A navegação
    // cancelada acima também abriu o navegador — o que interessa daqui em diante é o `open`.)
    external.length = 0;
    const panel = FakeWindow.all[0]!;
    expect(panel.openHandler?.({ url: "https://github.com/vinihcrosa/lumem-os" })).toEqual({ action: "deny" });
    expect(external).toEqual(["https://github.com/vinihcrosa/lumem-os"]);

    // Navegação cancelada de um link comum também vai para o navegador, e não some.
    panel.navigate("will-navigate", "https://example.com/docs");
    expect(external.at(-1)).toBe("https://example.com/docs");
  });

  it("opens http and https links outside, and nothing else", async () => {
    const { windows, external } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;

    // Cada esquema da web sozinho: `http:` não é `https:`, e os dois valem.
    panel.openHandler?.({ url: "http://example.com/a" });
    panel.openHandler?.({ url: "https://example.com/b" });
    expect(external).toEqual(["http://example.com/a", "https://example.com/b"]);

    // O mesmo vale para a navegação que sairia da origem.
    panel.navigate("will-navigate", "http://example.com/c");
    expect(external.at(-1)).toBe("http://example.com/c");
    external.length = 0;
    panel.navigate("will-navigate", "ftp://example.com/d");
    panel.navigate("will-navigate", "mailto:ana@example.com");
    expect(external).toEqual([]);
  });

  it("trusts nothing when the recorded origin is not a URL", async () => {
    // Sem origem não há mesma origem: nem uma URL que também não se lê passa por ela.
    const { windows } = setup("isto não é uma origem");
    await windows.openMain();
    const window = FakeWindow.all[0]!;

    expect(window.navigate("will-navigate", "também não é uma url")).toBe(true);
    expect(window.navigate("will-navigate", `${ORIGIN}/`)).toBe(true);
  });

  it("opens only web links outside", async () => {
    // `file:`, `javascript:` e esquemas próprios de um programa da máquina não são links.
    const { windows, external } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;

    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "vscode://file/x", "not a url"]) {
      expect(panel.openHandler?.({ url })).toEqual({ action: "deny" });
    }
    expect(external).toEqual([]);
  });

  it("sends a same-origin window.open to the main window", async () => {
    // O painel abre o Lumem por `<a target=_blank>` e `window.open("/")`: a mesma origem
    // que o app carregou não vai para o navegador (C72), vai para a janela principal.
    const { windows, external } = setup();
    await windows.togglePanel(ICON);
    const panel = FakeWindow.all[0]!;

    expect(panel.openHandler?.({ url: `${ORIGIN}/` })).toEqual({ action: "deny" });
    await vi.waitFor(() => expect(FakeWindow.all).toHaveLength(2));
    expect(FakeWindow.all[1]?.loaded).toEqual([`${ORIGIN}/`]);
    expect(external).toEqual([]);

    // De novo: foca a que existe.
    panel.openHandler?.({ url: `${ORIGIN}/` });
    await vi.waitFor(() => expect(FakeWindow.all[1]?.calls.filter((c) => c === "focus").length).toBeGreaterThan(0));
    expect(FakeWindow.all).toHaveLength(2);
  });
});
