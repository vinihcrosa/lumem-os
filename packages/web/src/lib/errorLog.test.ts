import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearErrors,
  describeError,
  dismissError,
  errorSnapshot,
  formatError,
  formatErrorLog,
  isReportableError,
  recordError,
} from "./errorLog.js";

const STORAGE_KEY = "lumem.errorLog.v1";

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
    recordError({ kind: "query", label: "a", message: "primeiro" });
    recordError({ kind: "mutation", label: "b", message: "segundo" });

    expect(errorSnapshot().map((entry) => entry.message)).toEqual(["segundo", "primeiro"]);
  });

  it("collapses the same error into one row with a count, so a poll cannot bury a bug", () => {
    recordError({ kind: "query", label: "health", message: "daemon inacessível" });
    recordError({ kind: "query", label: "health", message: "daemon inacessível" });
    recordError({ kind: "query", label: "health", message: "daemon inacessível" });

    const snapshot = errorSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.count).toBe(3);
  });

  it("tells two different errors apart even under the same label", () => {
    recordError({ kind: "query", label: "health", message: "um" });
    recordError({ kind: "query", label: "health", message: "outro" });

    expect(errorSnapshot()).toHaveLength(2);
  });

  it("drops a single entry and clears the whole log", () => {
    recordError({ kind: "mutation", label: "x", message: "um" });
    recordError({ kind: "mutation", label: "y", message: "dois" });
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

  it("discards a stored entry whose shape does not match this version", async () => {
    // A hand-edited or pre-version row without `at`/`detail` would print
    // `Invalid Date` and `undefined`. The versioned key filters it out on load.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "x", message: "sem forma" }, { kind: "consulta", label: "velho" }]),
    );
    vi.resetModules();
    const fresh = await import("./errorLog.js");
    expect(fresh.errorSnapshot()).toHaveLength(0);
  });
});

describe("formatting for a bug report", () => {
  it("puts the source, label, message and detail in one block, with the source in Portuguese", () => {
    recordError({ kind: "mutation", label: "session.resume", message: "recusado", detail: "at foo" });
    const text = formatError(errorSnapshot()[0]!);

    expect(text).toContain("ação · session.resume");
    expect(text).toContain("recusado");
    expect(text).toContain("at foo");
  });

  it("marks a repeated error with its count", () => {
    recordError({ kind: "query", label: "health", message: "off" });
    recordError({ kind: "query", label: "health", message: "off" });

    expect(formatError(errorSnapshot()[0]!)).toContain("×2");
  });

  it("joins the whole log into one copyable text", () => {
    recordError({ kind: "query", label: "a", message: "um" });
    recordError({ kind: "mutation", label: "b", message: "dois" });

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

describe("isReportableError", () => {
  it("treats a call that never reached the daemon as a bug", () => {
    // No `data`: a network or parse failure — the daemon is unreachable.
    expect(isReportableError(new Error("Failed to fetch"))).toBe(true);
  });

  it("treats a server defect as a bug", () => {
    expect(isReportableError({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(true);
  });

  it("does not report the daemon's ordinary refusals", () => {
    // A path that is not a repo, a worktree off disk, an input the daemon
    // rejected — validation state, already shown inline on the screen.
    expect(isReportableError({ data: { code: "NOT_FOUND" } })).toBe(false);
    expect(isReportableError({ data: { code: "CONFLICT" } })).toBe(false);
    expect(isReportableError({ data: { code: "BAD_REQUEST" } })).toBe(false);
  });
});
