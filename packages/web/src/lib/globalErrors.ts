import { describeError, recordError } from "./errorLog.js";

/**
 * Sends what escapes React and the query caches into the same log.
 *
 * A tRPC call that fails is caught by the query cache; a bug in render, a bad
 * cast, a rejected promise nobody awaited is not. Those are exactly the errors a
 * person needs to copy out and hand over, so they land in the same place.
 *
 * Returns a teardown, so a test can install and remove it without leaking a
 * listener into the next one.
 */
export function installGlobalErrorHandlers(target: Window = window): () => void {
  const onError = (event: ErrorEvent): void => {
    const described = describeError(event.error ?? event.message);
    recordError({
      kind: "app",
      label: described.label ?? "window.onerror",
      message: described.message,
      detail: described.detail,
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const described = describeError(event.reason);
    recordError({
      kind: "app",
      label: described.label ?? "unhandledrejection",
      message: described.message,
      detail: described.detail,
    });
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
