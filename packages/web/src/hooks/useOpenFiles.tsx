import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { ChangeRef } from "./useCheckoutChanges.js";

/**
 * What each tab has open in its split — decision D3.2.
 *
 * The column navigates and the split reads, which puts the two on opposite
 * sides of the shell: the tree lives outside the tab, and what it opens lives
 * inside one. This is the only thing they share, and it is keyed by tab so
 * every session keeps its own file.
 */
export interface OpenFile {
  path: string;
  /** A file's contents, or the patch of that same path. */
  view: "file" | "patch";
  /** Which diff the patch belongs to. Meaningless for `view: "file"`. */
  ref?: ChangeRef;
}

/** Identifies one tab of one checkout: `worktree:wt_1:sess_2`, or `…:context`. */
export type TabKey = string;

export function tabKey(scopeType: string, scopeId: string, sessionId: string | null): TabKey {
  return `${scopeType}:${scopeId}:${sessionId ?? "context"}`;
}

interface OpenFilesValue {
  activeTab: TabKey | null;
  setActiveTab(tab: TabKey | null): void;
  fileFor(tab: TabKey): OpenFile | null;
  /** Opens in whichever tab is active; a no-op when none is. */
  open(file: OpenFile): void;
  close(tab: TabKey): void;
}

const OpenFilesContext = createContext<OpenFilesValue | null>(null);

export function OpenFilesProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [byTab, setByTab] = useState<Readonly<Record<TabKey, OpenFile>>>({});

  const open = useCallback(
    (file: OpenFile) => {
      setByTab((current) => (activeTab === null ? current : { ...current, [activeTab]: file }));
    },
    [activeTab],
  );

  const close = useCallback((tab: TabKey) => {
    setByTab((current) => {
      if (!(tab in current)) return current;
      const next = { ...current };
      delete next[tab];
      return next;
    });
  }, []);

  const value = useMemo<OpenFilesValue>(
    () => ({
      activeTab,
      setActiveTab,
      fileFor: (tab) => byTab[tab] ?? null,
      open,
      close,
    }),
    [activeTab, byTab, open, close],
  );

  return <OpenFilesContext.Provider value={value}>{children}</OpenFilesContext.Provider>;
}

export function useOpenFiles(): OpenFilesValue {
  const value = useContext(OpenFilesContext);
  if (value === null) {
    throw new Error("useOpenFiles precisa de um OpenFilesProvider acima");
  }
  return value;
}
