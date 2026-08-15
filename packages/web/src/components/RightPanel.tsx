import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { clampWidth } from "../hooks/useRightPanel.js";

import "./right-panel.css";

export type RightPanelTab = "files" | "changes";

export interface RightPanelProps {
  tab: RightPanelTab;
  onSelectTab(tab: RightPanelTab): void;
  /** Shown on the `Mudanças` tab; null while it is still unknown. */
  changeCount: number | null;
  onReload(): void;
  onClose(): void;
  onResize(width: number): void;
  /** What the bottom strip says on the left — usually how fresh the read is. */
  footLeft?: ReactNode;
  footRight?: ReactNode;
  children: ReactNode;
}

/**
 * The column itself: two tabs, a body, and a strip that says how fresh it is.
 *
 * It owns no data. Which files exist and what changed are two different
 * questions with two different queries, and both answer inside `children` —
 * this is the frame they share, and the place the drag lives.
 */
export function RightPanel({
  tab,
  onSelectTab,
  changeCount,
  onReload,
  onClose,
  onResize,
  footLeft,
  footRight,
  children,
}: RightPanelProps) {
  const dragging = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  const measure = useCallback(
    (clientX: number) => {
      const right = panelRef.current?.getBoundingClientRect().right;
      if (right === undefined || !Number.isFinite(clientX)) return;
      // Measured from the right edge of the window, not from the pointer's
      // delta: a drag that outruns a frame would otherwise drift.
      onResize(clampWidth(right - clientX));
    },
    [onResize],
  );

  useEffect(() => {
    if (!grabbed) return;

    const onMove = (event: PointerEvent): void => {
      if (!dragging.current) return;
      event.preventDefault();
      measure(event.clientX);
    };
    const onUp = (): void => {
      dragging.current = false;
      setGrabbed(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Listeners on the window, not the handle: the pointer leaves a 4px target
    // on the first fast drag, and the resize has to keep following it.
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [grabbed, measure]);

  return (
    <aside className="rp" aria-label="arquivos do checkout" ref={panelRef}>
      <span
        className="rp__grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="largura da coluna"
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          setGrabbed(true);
        }}
      />

      <div className="rp__bar" role="tablist" aria-label="conteúdo da coluna">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "files"}
          className={`rtab${tab === "files" ? " rtab--active" : ""}`}
          onClick={() => onSelectTab("files")}
        >
          Arquivos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "changes"}
          className={`rtab${tab === "changes" ? " rtab--active" : ""}`}
          onClick={() => onSelectTab("changes")}
        >
          Mudanças
          {/* The count lives on the tab because it is what decides whether the
              tab is worth opening. Inside it, it would only be readable to
              someone who already opened it. */}
          {changeCount !== null && changeCount > 0 && (
            <span className="rtab__count">{changeCount}</span>
          )}
        </button>
        <span className="rp__spacer" />
        <button type="button" className="rp__icon" onClick={onReload} title="recarregar">
          ⟳<span className="sr-only">recarregar</span>
        </button>
        <button type="button" className="rp__icon" onClick={onClose} title="fechar a coluna">
          ›<span className="sr-only">fechar a coluna</span>
        </button>
      </div>

      <div className="rp__body">
        {children}
        <div className="rp__foot">
          <span>{footLeft}</span>
          <span className="rp__spacer" />
          <span>{footRight}</span>
        </div>
      </div>
    </aside>
  );
}
