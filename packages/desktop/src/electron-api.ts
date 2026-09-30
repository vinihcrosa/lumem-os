import type { BrowserWindowConstructorOptions } from "electron";

/**
 * O pedaço do Electron que o app usa, escrito como interface.
 *
 * As decisões do app (ícone, menu, janelas, trava de navegação) recebem isto por
 * parâmetro, e é por isso que a suíte as prova com um Electron **dublado** sem
 * carregar o Electron: o `index.ts` é o único arquivo que importa o de verdade, e o
 * compilador confere que ele cabe aqui. Só o que o app chama entra; uma interface do
 * tamanho do Electron seria o Electron.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Os eventos de um `webContents` e de uma janela são muitos; o app ouve poucos, por nome. */
type Listener = (...args: never[]) => void;

export interface WebContentsLike {
  on(event: string, listener: Listener): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  loadURL(url: string): Promise<void>;
  getURL(): string;
}

export interface WindowLike {
  readonly webContents: WebContentsLike;
  loadURL(url: string): Promise<void>;
  loadFile(path: string): Promise<void>;
  show(): void;
  hide(): void;
  focus(): void;
  restore(): void;
  isVisible(): boolean;
  isMinimized(): boolean;
  isDestroyed(): boolean;
  setPosition(x: number, y: number): void;
  on(event: string, listener: Listener): unknown;
}

export type WindowOptions = BrowserWindowConstructorOptions;

export interface WindowConstructor {
  new (options: WindowOptions): WindowLike;
}
