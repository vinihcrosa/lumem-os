import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { FileViewer } = await import("./FileViewer.js");
const { TabSplit } = await import("./TabSplit.js");
const { languageOf, splitLines } = await import("../lib/shiki.js");

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

function render(path = "src/lore/loader.ts", onClose = () => {}) {
  return renderWithProviders(<FileViewer scope={scope} path={path} onClose={onClose} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o arquivo aberto no split", () => {
  it("shows the file with a number per line", async () => {
    trpcMock.files.read.query.mockResolvedValue({
      kind: "text",
      path: "src/lore/loader.ts",
      bytes: 24,
      lines: 2,
      text: "const a = 1;\nconst b = 2;\n",
    });

    const { container } = render();

    expect(await screen.findByText("const a = 1;")).toBeInTheDocument();
    expect(container.querySelectorAll(".code .l")).toHaveLength(2);
    expect(container.querySelector(".n")).toHaveTextContent("1");
  });

  it("wraps by default, and the toggle turns it off", async () => {
    const user = userEvent.setup();
    trpcMock.files.read.query.mockResolvedValue({
      kind: "text",
      path: "a.ts",
      bytes: 3,
      lines: 1,
      text: "um\n",
    });

    const { container } = render("a.ts");
    await screen.findByText("um");
    // D3.1: a line of 80 columns in a 360px column would end in the void.
    expect(container.querySelector(".code")).not.toHaveClass("code--nowrap");

    await user.click(screen.getByRole("button", { name: /quebrar linhas longas/ }));

    expect(container.querySelector(".code")).toHaveClass("code--nowrap");
  });

  it("says a file is binary instead of dumping it", async () => {
    trpcMock.files.read.query.mockResolvedValue({ kind: "binary", path: "logo.png", bytes: 48_000 });

    render("assets/logo.png");

    expect(await screen.findByText("arquivo binário")).toBeInTheDocument();
  });

  it("reports the ceiling with both numbers", async () => {
    trpcMock.files.read.query.mockResolvedValue({
      kind: "too-large",
      path: "pnpm-lock.yaml",
      bytes: 1_468_006,
      limit: 1_048_576,
    });

    render("pnpm-lock.yaml");

    expect(await screen.findByText(/passa do teto de/)).toHaveTextContent("1,4 MB");
  });

  it("shows the daemon's refusal for a symlink that leaves the checkout", async () => {
    trpcMock.files.read.query.mockRejectedValue(
      new Error("chaves/id_rsa aponta para fora do checkout"),
    );

    render("chaves/id_rsa");

    expect(await screen.findByRole("alert")).toHaveTextContent(/aponta para fora do checkout/);
  });

  it("closes, which is how the split gives the width back to the session", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    trpcMock.files.read.query.mockResolvedValue({
      kind: "text",
      path: "a.ts",
      bytes: 3,
      lines: 1,
      text: "um\n",
    });

    render("a.ts", onClose);
    await screen.findByText("um");

    await user.click(screen.getByRole("button", { name: "✕ fechar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

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

describe("shiki", () => {
  it("maps extensions to grammars, and answers null for the ones it has none for", () => {
    expect(languageOf("src/lore/loader.ts")).toBe("typescript");
    expect(languageOf("docs/README.md")).toBe("markdown");
    expect(languageOf("Dockerfile")).toBe("docker");
    // F3.3: unknown renders as plain text, which is an answer and not an error.
    expect(languageOf("dados.parquet")).toBeNull();
    expect(languageOf("LICENSE")).toBeNull();
  });

  it("splits the highlighter's output into one entry per line", () => {
    const html =
      '<pre class="shiki"><code><span class="line"><span>um</span></span>\n' +
      '<span class="line"><span>dois</span></span></code></pre>';

    expect(splitLines(html)).toEqual(["<span>um</span>", "<span>dois</span>"]);
  });
});
