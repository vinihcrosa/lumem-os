import { useCallback, useState } from "react";

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

/** Whether the files column is showing, and how wide — remembered across reloads. */
export function useRightPanel(): RightPanelState {
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

  return { open: state.open, width: state.width, toggle, setWidth };
}
