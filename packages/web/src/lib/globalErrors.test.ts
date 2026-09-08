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
  it("sends an uncaught error and an unhandled rejection to the log, and stops on teardown", () => {
    const off = installGlobalErrorHandlers();

    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    expect(errorSnapshot()[0]).toMatchObject({ kind: "app", label: "window.onerror", message: "boom" });

    // jsdom has no `PromiseRejectionEvent`; an Event with a `reason` is how the
    // handler gets one.
    const rejection = Object.assign(new Event("unhandledrejection"), { reason: new Error("solto") });
    window.dispatchEvent(rejection);
    expect(errorSnapshot()[0]).toMatchObject({ kind: "app", label: "unhandledrejection", message: "solto" });

    // After teardown a new error must not reach the log.
    off();
    clearErrors();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("depois") }));
    expect(errorSnapshot()).toHaveLength(0);
  });
});
