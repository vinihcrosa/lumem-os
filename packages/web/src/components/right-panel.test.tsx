import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RightPanel, type RightPanelTab } from "./RightPanel.js";
import {
  clampWidth,
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  useRightPanel,
} from "../hooks/useRightPanel.js";
import { AppShell } from "../layout/AppShell.js";
import { Topbar } from "../layout/Topbar.js";

function Harness() {
  const panel = useRightPanel();
  const [tab, setTab] = useState<RightPanelTab>("files");

  return (
    <>
      <Topbar version="0.1.0" unreachable={false} filesPanel={panel} />
      <AppShell
        sidebar={<nav>projetos</nav>}
        rightWidth={panel.width}
        right={
          panel.open ? (
            <RightPanel
              tab={tab}
              onSelectTab={setTab}
              changeCount={6}
              onReload={() => {}}
              onClose={panel.toggle}
              onResize={panel.setWidth}
              footLeft="lido há 12 s"
            >
              <div data-testid="conteudo">{tab}</div>
            </RightPanel>
          ) : undefined
        }
      >
        <div>terminal</div>
      </AppShell>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("a coluna de arquivos", () => {
  it("starts closed, so the screen is born with a big terminal", () => {
    render(<Harness />);

    expect(screen.queryByLabelText("arquivos do checkout")).not.toBeInTheDocument();
  });

  it("opens and closes from the topbar, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: /arquivos/ }));
    expect(screen.getByLabelText("arquivos do checkout")).toBeInTheDocument();

    unmount();
    render(<Harness />);
    expect(screen.getByLabelText("arquivos do checkout")).toBeInTheDocument();
  });

  it("closes from its own ✕ too", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /arquivos/ }));

    await user.click(screen.getByRole("button", { name: /fechar a coluna/ }));

    expect(screen.queryByLabelText("arquivos do checkout")).not.toBeInTheDocument();
  });

  it("switches between the two tabs and shows the change count on one of them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /arquivos/ }));

    expect(screen.getByTestId("conteudo")).toHaveTextContent("files");
    expect(screen.getByRole("tab", { name: /Mudanças/ })).toHaveTextContent("6");

    await user.click(screen.getByRole("tab", { name: /Mudanças/ }));

    expect(screen.getByTestId("conteudo")).toHaveTextContent("changes");
  });

  it("hands the shell a width, and the drag changes it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: /arquivos/ }));

    const shell = container.querySelector(".app-shell") as HTMLElement;
    expect(shell.style.getPropertyValue("--right-width")).toBe(`${RIGHT_PANEL_DEFAULT_WIDTH}px`);

    const grip = screen.getByRole("separator", { name: "largura da coluna" });
    // jsdom gives every element a zero-sized box, so the panel's right edge is
    // 0 and dragging to -500 asks for a 500px column.
    fireEvent.pointerDown(grip);
    // `fireEvent.pointerMove` builds an event without coordinates in jsdom;
    // a MouseEvent carries the clientX the drag actually reads.
    fireEvent(window, new MouseEvent("pointermove", { clientX: -500, bubbles: true }));

    expect(shell.style.getPropertyValue("--right-width")).toBe("500px");
  });

  it("stops following the pointer once it is released", () => {
    const onResize = vi.fn();
    render(
      <RightPanel
        tab="files"
        onSelectTab={() => {}}
        changeCount={null}
        onReload={() => {}}
        onClose={() => {}}
        onResize={onResize}
      >
        <div />
      </RightPanel>,
    );

    const grip = screen.getByRole("separator", { name: "largura da coluna" });
    fireEvent.pointerDown(grip);
    fireEvent.pointerUp(window);
    fireEvent(window, new MouseEvent("pointermove", { clientX: -400, bubbles: true }));

    expect(onResize).not.toHaveBeenCalled();
  });
});

describe("clampWidth", () => {
  it("keeps the column between its minimum and its maximum", () => {
    expect(clampWidth(10)).toBe(RIGHT_PANEL_MIN_WIDTH);
    expect(clampWidth(10_000)).toBe(RIGHT_PANEL_MAX_WIDTH);
    expect(clampWidth(400.4)).toBe(400);
  });
});
