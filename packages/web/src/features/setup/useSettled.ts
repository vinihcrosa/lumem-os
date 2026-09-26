import { useEffect, useState } from "react";

/**
 * The value, once the typing stops.
 *
 * Two screens of the flow read the disk from a field — a repository path and a
 * worktree name — and neither read should happen per keystroke: `project.inspect`
 * runs six git commands, and firing them on `/U`, `/Us`, `/Use` would have the
 * screen answering about paths that were never meant.
 */
export function useSettled<T>(value: T, delayMs = 400): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
