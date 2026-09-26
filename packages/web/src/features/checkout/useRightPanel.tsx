import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "lumem.rightPanel";

/** Same numbers as `--size-panel-right*`; the CSS cannot enforce a drag. */
export const RIGHT_PANEL_DEFAULT_WIDTH = 360;
export const RIGHT_PANEL_MIN_WIDTH = 260;
export const RIGHT_PANEL_MAX_WIDTH = 720;

interface Stored {
  open: boolean;
  width: number;
}

/**
 * Closed on the first run, and whatever the user last chose after that.
 *
 * The screen is born with a big terminal; whoever wants the files pulls them
 * out. Opening it by default would take a third of the window from a user who
 * never asked for it.
 */
function read(): Stored {
  const fallback: Stored = { open: false, width: RIGHT_PANEL_DEFAULT_WIDTH };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { open, width } = parsed as Partial<Stored>;
    return {
      open: typeof open === "boolean" ? open : fallback.open,
      width: typeof width === "number" ? clampWidth(width) : fallback.width,
    };
  } catch {
    // Storage is shared with other tabs and older builds. Anything unreadable
    // is treated as "never set" instead of crashing the shell.
    return fallback;
  }
}

function write(state: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* a panel width is not worth a crash */
  }
}

export function clampWidth(width: number): number {
  return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

export interface RightPanelState {
  open: boolean;
  width: number;
  toggle(): void;
  setWidth(width: number): void;
}

const RightPanelContext = createContext<RightPanelState | null>(null);

/**
 * O interruptor da coluna de arquivos — estado do **app**, não do checkout.
 *
 * Vem de contexto e não de prop (`032` T23): o mesmo `useRightPanel`, com o
 * valor em `localStorage`, é lido tanto por quem liga o botão (a faixa de abas
 * de cada checkout) quanto por quem decide a largura da coluna (o `AppShell`).
 * O botão mudou de lugar, não de dono (Q4) — uma coluna que abre e fecha
 * sozinha ao trocar de worktree seria pior que uma que fica onde você deixou,
 * e dois `useState` independentes (um por chamador) recriariam exatamente
 * essa divergência.
 */
export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(read);

  const toggle = useCallback(() => {
    setState((current) => {
      const next = { ...current, open: !current.open };
      write(next);
      return next;
    });
  }, []);

  const setWidth = useCallback((width: number) => {
    setState((current) => {
      const next = { ...current, width: clampWidth(width) };
      // Written on every step of a drag, which is cheap and means a reload
      // mid-drag keeps what the user was aiming at.
      write(next);
      return next;
    });
  }, []);

  const value = useMemo<RightPanelState>(
    () => ({ open: state.open, width: state.width, toggle, setWidth }),
    [state, toggle, setWidth],
  );

  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanel(): RightPanelState {
  const value = useContext(RightPanelContext);
  if (value === null) {
    throw new Error("useRightPanel precisa de um RightPanelProvider acima");
  }
  return value;
}
