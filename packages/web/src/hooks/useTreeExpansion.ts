import { useCallback, useState } from "react";

const STORAGE_KEY = "lumem.collapsedNodes";

/**
 * What is stored is what is *closed*, not what is open.
 *
 * A node the user has never touched should show its children — that is what
 * the sidebar did before it could collapse at all. Storing the open set would
 * make every newly added project start shut, which reads as "the daemon
 * returned nothing".
 */
function read(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    // Storage is shared with other tabs and older builds; anything that is not
    // a list of strings is treated as nothing rather than crashing the sidebar.
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

function write(collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* a fold is not worth a crash */
  }
}

export interface TreeExpansion {
  isExpanded(key: string): boolean;
  toggle(key: string): void;
}

/** Which nodes of the sidebar tree are folded, remembered across reloads. */
export function useTreeExpansion(): TreeExpansion {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(read);

  const isExpanded = useCallback((key: string) => !collapsed.has(key), [collapsed]);

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      write(next);
      return next;
    });
  }, []);

  return { isExpanded, toggle };
}
