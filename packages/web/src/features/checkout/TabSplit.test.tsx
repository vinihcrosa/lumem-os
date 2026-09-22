import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render.js";

vi.mock("../../lib/trpc.js", async () => ({ trpc: (await import("../../test/trpc-mock.js")).trpcMock }));

const { TabSplit } = await import("./TabSplit.js");

describe("TabSplit", () => {
  it("leaves the tab exactly as it was when nothing is open", () => {
    const { container } = renderWithProviders(
      <TabSplit viewer={null}>
        <div data-testid="sessao">terminal</div>
      </TabSplit>,
    );

    expect(screen.getByTestId("sessao")).toBeInTheDocument();
    expect(container.querySelector(".split")).toBeNull();
  });

  it("puts the session and the file side by side when one is open", () => {
    const { container } = renderWithProviders(
      <TabSplit viewer={<div data-testid="arquivo">loader.ts</div>}>
        <div data-testid="sessao">terminal</div>
      </TabSplit>,
    );

    expect(container.querySelector(".split")).not.toBeNull();
    expect(screen.getByTestId("sessao")).toBeInTheDocument();
    expect(screen.getByTestId("arquivo")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "largura do arquivo aberto" })).toBeInTheDocument();
  });
});
