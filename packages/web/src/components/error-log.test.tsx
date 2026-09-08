import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ErrorLog } from "./ErrorLog.js";
import { clearErrors, errorSnapshot, recordError } from "../lib/errorLog.js";

// `userEvent.setup()` installs a working clipboard on `navigator`, which is what
// the copy buttons write to — so the copy tests read it back rather than spy.

beforeEach(() => {
  window.localStorage.clear();
  clearErrors();
});

afterEach(() => {
  clearErrors();
});

describe("the error log surface", () => {
  it("shows nothing while there are no errors", () => {
    const { container } = render(<ErrorLog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears with a count once something failed", () => {
    recordError({ kind: "ação", label: "session.resume", message: "recusado" });
    render(<ErrorLog />);

    expect(screen.getByRole("button", { name: /registro de erros \(1\)/ })).toBeInTheDocument();
  });

  it("opens a panel that lists the errors", async () => {
    const user = userEvent.setup();
    recordError({ kind: "ação", label: "session.resume", message: "não sabe retomar" });
    render(<ErrorLog />);

    await user.click(screen.getByRole("button", { name: /registro de erros/ }));

    const panel = screen.getByRole("dialog", { name: "registro de erros" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("não sabe retomar")).toBeInTheDocument();
    expect(screen.getByText("session.resume")).toBeInTheDocument();
  });

  it("copies one error to the clipboard", async () => {
    const user = userEvent.setup();
    recordError({ kind: "ação", label: "session.resume", message: "recusado", detail: "at foo" });
    render(<ErrorLog />);

    await user.click(screen.getByRole("button", { name: /registro de erros/ }));
    await user.click(screen.getByRole("button", { name: "copiar" }));

    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("session.resume");
    expect(copied).toContain("at foo");
  });

  it("copies the whole log at once", async () => {
    const user = userEvent.setup();
    recordError({ kind: "consulta", label: "a", message: "um" });
    recordError({ kind: "ação", label: "b", message: "dois" });
    render(<ErrorLog />);

    await user.click(screen.getByRole("button", { name: /registro de erros/ }));
    await user.click(screen.getByRole("button", { name: "copiar tudo" }));

    const text = await navigator.clipboard.readText();
    expect(text).toContain("um");
    expect(text).toContain("dois");
  });

  it("clears the log, and the surface goes away with it", async () => {
    const user = userEvent.setup();
    recordError({ kind: "app", label: "boom", message: "quebrou" });
    render(<ErrorLog />);

    await user.click(screen.getByRole("button", { name: /registro de erros/ }));
    await user.click(screen.getByRole("button", { name: "limpar" }));

    expect(errorSnapshot()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /registro de erros/ })).not.toBeInTheDocument();
  });
});
