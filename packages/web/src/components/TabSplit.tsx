import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import "./viewer.css";

export interface TabSplitProps {
  /** The session's own side: a terminal, or the context tab's contents. */
  children: ReactNode;
  /** What is being read beside it. Null leaves the tab exactly as it was. */
  viewer: ReactNode | null;
}

/** Neither side may be squeezed below this share of the tab. */
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

/**
 * The tab, split in two — decision D3.2.
 *
 * The file opens *beside* the session rather than inside the column, which is
 * the whole point: the agent stays on screen while its work is read. With
 * nothing open the tab renders exactly as it did before, so a session that is
 * never split pays nothing for this.
 */
export function TabSplit({ children, viewer }: TabSplitProps) {
  const [ratio, setRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  const measure = useCallback((clientX: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || !Number.isFinite(clientX)) return;
    const next = (clientX - box.left) / box.width;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
  }, []);

  useEffect(() => {
    if (!grabbed) return;

    const onMove = (event: PointerEvent): void => {
      event.preventDefault();
      measure(event.clientX);
    };
    const onUp = (): void => setGrabbed(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [grabbed, measure]);

  if (viewer === null) return <>{children}</>;

  return (
    <div className="split" ref={containerRef}>
      <div className="split__side split__side--term" style={{ flexGrow: ratio }}>
        {children}
      </div>
      <span
        className="split__grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="largura do arquivo aberto"
        onPointerDown={(event) => {
          event.preventDefault();
          setGrabbed(true);
        }}
      />
      <div className="split__side split__side--viewer" style={{ flexGrow: 1 - ratio }}>
        {viewer}
      </div>
    </div>
  );
}
