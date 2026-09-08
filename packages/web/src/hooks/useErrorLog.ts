import { useSyncExternalStore } from "react";

import { errorSnapshot, subscribeErrors, type ErrorEntry } from "../lib/errorLog.js";

/** The error log, live. Re-renders whoever reads it when a new error lands. */
export function useErrorLog(): readonly ErrorEntry[] {
  return useSyncExternalStore(subscribeErrors, errorSnapshot, errorSnapshot);
}
