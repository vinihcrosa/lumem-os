import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lumem.activeWorkspaceId";

/**
 * localStorage throws in a browser with storage disabled, and the app has no
 * business dying over a preference. Losing the selection is the whole cost.
 */
function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* the selection is not worth a crash */
  }
}

export interface ActiveWorkspace {
  activeId: string | null;
  select(id: string): void;
}

/**
 * Which workspace the sidebar is showing, F1.3.
 *
 * Remembered across reloads, but always validated against the list that came
 * back from the daemon: a workspace removed from another tab would otherwise
 * leave the sidebar pointing at nothing, with no way to recover but clearing
 * storage by hand.
 */
export function useActiveWorkspace(workspaces: readonly { id: string }[]): ActiveWorkspace {
  const [remembered, setRemembered] = useState<string | null>(read);

  const activeId =
    workspaces.find((workspace) => workspace.id === remembered)?.id ?? workspaces[0]?.id ?? null;

  useEffect(() => {
    if (activeId !== remembered) write(activeId);
  }, [activeId, remembered]);

  const select = useCallback((id: string) => {
    write(id);
    setRemembered(id);
  }, []);

  return { activeId, select };
}
