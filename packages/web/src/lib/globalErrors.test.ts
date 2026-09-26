import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearErrors, errorSnapshot } from "./errorLog.js";
import { installGlobalErrorHandlers } from "./globalErrors.js";

beforeEach(() => {
  window.localStorage.clear();
  clearErrors();
});

afterEach(() => {
  window.localStorage.clear();
  clearErrors();
});

describe("global error handlers", () => {
  it("sends an uncaught error and an unhandled rejection to the log", () => {
    const off = installGlobalErrorHandlers();
    try {
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
      expect(errorSnapshot()[0]).toMatchObject({ kind: "app", label: "window.onerror", message: "boom" });

      // jsdom has no `PromiseRejectionEvent`; an Event with a `reason` is how the
      // handler gets one.
      const rejection = Object.assign(new Event("unhandledrejection"), { reason: new Error("solto") });
      window.dispatchEvent(rejection);
      expect(errorSnapshot()[0]).toMatchObject({ kind: "app", label: "unhandledrejection", message: "solto" });
    } finally {
      off();
    }
  });

  it("stops on teardown", () => {
    // On its own target, not `window`: vitest counts the `error` listeners on the
    // global and re-emits any `ErrorEvent` carrying an `.error` as an
    // `uncaughtException` once that count is back to zero — which is exactly the
    // state teardown produces. Dispatching this on `window` turns the whole run
    // red while every assertion still passes.
    const target = new EventTarget() as unknown as Window;
    const off = installGlobalErrorHandlers(target);

    off();
    target.dispatchEvent(new ErrorEvent("error", { error: new Error("depois") }));
    expect(errorSnapshot()).toHaveLength(0);
  });
});
