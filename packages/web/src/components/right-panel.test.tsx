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
import { TabStrip, TabToggle } from "../ui/index.js";

function Harness() {
  const panel = useRightPanel();
  const [tab, setTab] = useState<RightPanelTab>("files");

  return (
    <>
      <Topbar version="0.1.0" unreachable={false} />
      {/* O interruptor mora na faixa de abas do checkout, e não na topbar: a
          coluna é de um checkout, e um interruptor global para algo que só
          existe dentro de um escopo diz que ele é do produto. */}
      <TabStrip
        label="sessões"
        end={
          <TabToggle label="a coluna de arquivos" pressed={panel.open} onToggle={panel.toggle}>
            ▤
          </TabToggle>
        }
      />
      <AppShell
        sidebar={<nav>projetos</nav>}
        rightWidth={panel.width}
        right={
          panel.open ? (
            <RightPanel
              tab={tab}
              onSelectTab={setTab}
              changeCount={6}
              proposalCount={3}
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

  it("opens and closes from the checkout's tab strip, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: /coluna de arquivos/ }));
    expect(screen.getByLabelText("arquivos do checkout")).toBeInTheDocument();

    unmount();
    render(<Harness />);
    expect(screen.getByLabelText("arquivos do checkout")).toBeInTheDocument();
  });

  it("closes from its own ✕ too", async () => {
    // Dois caminhos para a mesma ação, e os dois continuam existindo: fechar
    // por dentro é o gesto de quem está olhando para a coluna. O que ele não
    // pode ser é o único — com a coluna fechada ele não existe mais, e por isso
    // o nome exato importa aqui.
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "abrir a coluna de arquivos" }));

    await user.click(screen.getByTitle("fechar a coluna"));

    expect(screen.queryByLabelText("arquivos do checkout")).not.toBeInTheDocument();
  });

  it("switches between the two tabs and shows the change count on one of them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /coluna de arquivos/ }));

    expect(screen.getByTestId("conteudo")).toHaveTextContent("files");
    expect(screen.getByRole("tab", { name: /Mudanças/ })).toHaveTextContent("6");

    await user.click(screen.getByRole("tab", { name: /Mudanças/ }));

    expect(screen.getByTestId("conteudo")).toHaveTextContent("changes");
  });

  it("hands the shell a width, and the drag changes it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: /coluna de arquivos/ }));

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

describe("a contagem na faixa", () => {
  it("mostra quantas propostas esperam, na aba que decide se vale abrir", async () => {
    /*
     * Aqui, e não dentro do painel de memória.
     *
     * O painel tinha a mesma contagem no cabeçalho dele, e o resultado em 360px
     * era a palavra "Memória" três vezes na mesma linha — a faixa, o cabeçalho e
     * a primeira aba — com a quarta aba cortada por falta de largura. O número
     * pertence a quem responde "vale abrir?", que é a faixa.
     */
    // A coluna nasce fechada, para a tela nascer com um terminal grande.
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /coluna de arquivos/ }));

    const tab = await screen.findByRole("tab", { name: /Memória/ });
    expect(tab).toHaveTextContent("3");
  });
});

describe("clampWidth", () => {
  it("keeps the column between its minimum and its maximum", () => {
    expect(clampWidth(10)).toBe(RIGHT_PANEL_MIN_WIDTH);
    expect(clampWidth(10_000)).toBe(RIGHT_PANEL_MAX_WIDTH);
    expect(clampWidth(400.4)).toBe(400);
  });
});
