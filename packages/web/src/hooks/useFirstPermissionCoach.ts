import { useCallback, useState } from "react";

const STORAGE_KEY = "lumem.coach.permission";

/**
 * localStorage throws in a browser with storage disabled, and a teaching balloon
 * has no business dying over it. Showing it once more than intended is the whole
 * cost of the failure.
 */
function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

function write(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    /* a preference is not worth a crash */
  }
}

export interface FirstPermissionCoach {
  /** Whether the balloon should be on screen right now. */
  show: boolean;
  /** Dismiss for this appearance. */
  dismiss: () => void;
  /** Dismiss for good. */
  never: () => void;
}

/**
 * The first time a permission request appears on this machine (onboarding F5.4).
 *
 * Once per **machine**, not once per session: the thing being taught is what the
 * `Auto` mode approves on its own and where it stops, and that is learned the
 * first time it happens. Repeating it per conversation would turn a lesson into
 * a nag.
 *
 * The preference lives in `localStorage`, where the active workspace, the tree's
 * expansion and the right panel's width already do (O16). The daemon has no
 * opinion about what this person has already read — and the day a second client
 * talks to the same daemon, all four move together.
 */
export function useFirstPermissionCoach(pending: boolean): FirstPermissionCoach {
  const [seen, setSeen] = useState(read);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => setDismissed(true), []);

  const never = useCallback(() => {
    write();
    setSeen(true);
  }, []);

  return { show: pending && !seen && !dismissed, dismiss, never };
}
