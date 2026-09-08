import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearErrors,
  describeError,
  dismissError,
  errorSnapshot,
  formatError,
  formatErrorLog,
  recordError,
} from "./errorLog.js";

const STORAGE_KEY = "lumem.errorLog";

beforeEach(() => {
  window.localStorage.clear();
  clearErrors();
});

afterEach(() => {
  window.localStorage.clear();
  clearErrors();
});

describe("the error log store", () => {
  it("keeps what was recorded, newest first", () => {
    recordError({ kind: "consulta", label: "a", message: "primeiro" });
    recordError({ kind: "ação", label: "b", message: "segundo" });

    expect(errorSnapshot().map((entry) => entry.message)).toEqual(["segundo", "primeiro"]);
  });

  it("collapses the same error into one row with a count, so a poll cannot bury a bug", () => {
    recordError({ kind: "consulta", label: "health", message: "daemon inacessível" });
    recordError({ kind: "consulta", label: "health", message: "daemon inacessível" });
    recordError({ kind: "consulta", label: "health", message: "daemon inacessível" });

    const snapshot = errorSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.count).toBe(3);
  });

  it("tells two different errors apart even under the same label", () => {
    recordError({ kind: "consulta", label: "health", message: "um" });
    recordError({ kind: "consulta", label: "health", message: "outro" });

    expect(errorSnapshot()).toHaveLength(2);
  });

  it("drops a single entry and clears the whole log", () => {
    recordError({ kind: "ação", label: "x", message: "um" });
    recordError({ kind: "ação", label: "y", message: "dois" });
    const [first] = errorSnapshot();

    dismissError(first!.id);
    expect(errorSnapshot()).toHaveLength(1);

    clearErrors();
    expect(errorSnapshot()).toHaveLength(0);
  });

  it("survives a reload by writing itself to localStorage", async () => {
    recordError({ kind: "app", label: "boom", message: "quebrou", detail: "stack aqui" });
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("quebrou");

    // A fresh module instance is what a reload gives you: it must read the disk.
    vi.resetModules();
    const fresh = await import("./errorLog.js");
    expect(fresh.errorSnapshot().map((entry) => entry.message)).toContain("quebrou");
  });
});

describe("formatting for a bug report", () => {
  it("puts the source, label, message and detail in one block", () => {
    recordError({ kind: "ação", label: "session.resume", message: "recusado", detail: "at foo" });
    const text = formatError(errorSnapshot()[0]!);

    expect(text).toContain("ação · session.resume");
    expect(text).toContain("recusado");
    expect(text).toContain("at foo");
  });

  it("marks a repeated error with its count", () => {
    recordError({ kind: "consulta", label: "health", message: "off" });
    recordError({ kind: "consulta", label: "health", message: "off" });

    expect(formatError(errorSnapshot()[0]!)).toContain("×2");
  });

  it("joins the whole log into one copyable text", () => {
    recordError({ kind: "consulta", label: "a", message: "um" });
    recordError({ kind: "ação", label: "b", message: "dois" });

    const text = formatErrorLog([...errorSnapshot()]);
    expect(text).toContain("um");
    expect(text).toContain("dois");
  });
});

describe("describeError", () => {
  it("pulls the tRPC path out as the label", () => {
    const trpcish = Object.assign(new Error("recusado"), { data: { path: "session.resume" } });
    expect(describeError(trpcish)).toMatchObject({ label: "session.resume", message: "recusado" });
  });

  it("falls back to no label and stringifies a non-Error", () => {
    expect(describeError("cru")).toEqual({ label: null, message: "cru", detail: null });
  });
});
