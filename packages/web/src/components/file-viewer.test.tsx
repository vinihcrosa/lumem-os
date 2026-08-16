import { QueryClientProvider } from "@tanstack/react-query";
import { act, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "../lib/queryClient.js";
import { fileReadKey } from "../lib/queryKeys.js";
import { color } from "../styles/tokens.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { FileViewer } = await import("./FileViewer.js");
const { TabSplit } = await import("./TabSplit.js");
const { languageOf, splitLines } = await import("../lib/shiki.js");

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

/**
 * A file the daemon says can be written, which is the shape every read of the
 * form `text` has had since E3: content, revision, and why not — if not.
 */
function textFile(over: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "text",
    path: "src/lore/loader.ts",
    bytes: 24,
    lines: 2,
    text: "const a = 1;\nconst b = 2;",
    revision: "sha256:abc",
    readOnly: null,
    ...over,
  };
}

function render(path = "src/lore/loader.ts", onClose = () => {}) {
  return renderWithProviders(<FileViewer scope={scope} path={path} onClose={onClose} />);
}

/** The editor is mounted behind a dynamic import; nothing is on screen before it lands. */
async function editor(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector(".cm-content")).not.toBeNull());
  return container.querySelector(".cm-content") as HTMLElement;
}

/**
 * jsdom normalises an inline colour into `rgb()`; the tokens are hex.
 *
 * Twin of the one in `shiki-codemirror.test.ts`, on purpose: four lines shared
 * through a helper module would tie two suites together for no property.
 */
function asRgb(hex: string): string {
  const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o arquivo aberto no split", () => {
  it("shows the file with a number per line", async () => {
    trpcMock.files.read.query.mockResolvedValue(textFile());

    const { container } = render();

    const content = await editor(container);
    const lines = [...content.querySelectorAll(".cm-line")].map((line) => line.textContent);
    expect(lines).toEqual(["const a = 1;", "const b = 2;"]);

    // The first gutter element is CodeMirror's hidden spacer, which holds the
    // widest number there is so the column never resizes while you scroll.
    const gutter = [...container.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement")]
      .filter((cell) => cell.style.visibility !== "hidden")
      .map((cell) => cell.textContent);
    expect(gutter).toEqual(["1", "2"]);
  });

  it("keeps a trailing newline as the empty line it is", async () => {
    // A7: the bytes go back exactly as they came, so the buffer holds the
    // final "\n" — and an editor that holds it shows the line it opens.
    trpcMock.files.read.query.mockResolvedValue(textFile({ text: "um\n", bytes: 3, lines: 1 }));

    const { container } = render();

    const content = await editor(container);
    expect([...content.querySelectorAll(".cm-line")].map((l) => l.textContent)).toEqual(["um", ""]);
  });

  it("wraps by default, and the toggle turns it off", async () => {
    const user = userEvent.setup();
    trpcMock.files.read.query.mockResolvedValue(textFile({ text: "um", bytes: 3, lines: 1 }));

    const { container } = render();
    const content = await editor(container);
    // D3.1: a line of 80 columns in a 360px column would end in the void.
    expect(content).toHaveClass("cm-lineWrapping");

    await user.click(screen.getByRole("button", { name: /quebrar linhas longas/ }));

    await waitFor(() => expect(container.querySelector(".cm-content")).not.toHaveClass("cm-lineWrapping"));
  });

  it("paints the file with the palette's own keyword colour", async () => {
    // Both `setHighlight` calls can be deleted from `FileViewer` and every
    // other test in this file stays green, with every file in the product
    // opening in flat grey. This is the one that says so.
    trpcMock.files.read.query.mockResolvedValue(textFile());

    const { container } = render();
    const content = await editor(container);

    await waitFor(() => {
      const keyword = [...content.querySelectorAll("span")].find((s) => s.textContent === "const");
      expect(keyword?.style.color).toBe(asRgb(color["syntax/keyword"]));
    });
  });

  it("opens a file with no grammar as plain text, and calls that an answer", async () => {
    // The other side of F3.3: an extension nobody wrote a grammar for is not
    // an error, and it is also not an excuse to paint it with the wrong one.
    trpcMock.files.read.query.mockResolvedValue(textFile({ path: "dados.parquet" }));

    const { container } = render("dados.parquet");
    const content = await editor(container);

    expect(content.textContent).toContain("const a = 1;");
    const coloured = [...content.querySelectorAll("span")].filter((s) => s.style.color !== "");
    expect(coloured).toHaveLength(0);
  });

  it("adopts the file the daemon read again, in the editor already open", async () => {
    // `setDoc` is the only way anything new reaches the split once it is
    // mounted — the reload of the E10, and the clean buffer adopting the disk
    // of the D4. Turning it into `return;` keeps every other test green.
    const client = createQueryClient();
    trpcMock.files.read.query.mockResolvedValue(textFile());

    const { container } = rtlRender(
      <QueryClientProvider client={client}>
        <FileViewer scope={scope} path="src/lore/loader.ts" onClose={() => {}} />
      </QueryClientProvider>,
    );
    const content = await editor(container);
    const mounted = container.querySelector(".cm-editor");

    act(() => {
      client.setQueryData(
        fileReadKey(scope.scopeType, scope.scopeId, "src/lore/loader.ts"),
        textFile({ text: "const c = 3;" }),
      );
    });

    await waitFor(() => expect(content.textContent).toContain("const c = 3;"));
    // ...in the editor that was already there. A remount would lose the undo
    // history and the caret along with the old document.
    expect(container.querySelector(".cm-editor")).toBe(mounted);
  });

  it("takes the editor with it when the split goes away", async () => {
    trpcMock.files.read.query.mockResolvedValue(textFile());

    const { container, unmount } = render();
    await editor(container);
    const host = screen.getByTestId("editor");

    unmount();

    // React drops the host from the tree either way; what it cannot do is stop
    // an `EditorView` nobody destroyed. `destroy()` is what removes the
    // editor's DOM from that host — and with it the listeners and the
    // ResizeObserver that would otherwise outlive every file ever opened.
    expect(host.querySelector(".cm-editor"), "o EditorView anterior continua vivo").toBeNull();
  });

  it("lets you type in a file the daemon says it can write", async () => {
    trpcMock.files.read.query.mockResolvedValue(textFile());

    const { container } = render();

    const content = await editor(container);
    expect(content).toHaveAttribute("contenteditable", "true");
  });

  it("says a file is binary instead of dumping it", async () => {
    trpcMock.files.read.query.mockResolvedValue({ kind: "binary", path: "logo.png", bytes: 48_000 });

    const { container } = render("assets/logo.png");

    expect(await screen.findByText("arquivo binário")).toBeInTheDocument();
    expect(await screen.findByText(/somente leitura · binário/)).toBeInTheDocument();
    expect(container.querySelector(".cm-content")).toBeNull();
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
    expect(await screen.findByText(/somente leitura · acima do teto/)).toBeInTheDocument();
  });

  /*
   * The three refusals that arrive as a reason rather than as a shape (F1.4).
   * All three read fine and none of them can be written, and the screen says
   * which one it is instead of leaving the caret to find out at the first save.
   */
  const REFUSALS = [
    ["inside-git", ".git/HEAD", /dentro de \.git/, /destrói a worktree/],
    ["not-writable", "gerado/lock.txt", /sem permissão de escrita/, /não consegue gravar/],
    ["not-utf8", "fixtures/latin1.txt", /não é UTF-8/, /ida e volta em UTF-8/],
  ] as const;

  for (const [reason, path, chip, why] of REFUSALS) {
    it(`opens ${reason} read-only, with the reason said`, async () => {
      trpcMock.files.read.query.mockResolvedValue(textFile({ path, readOnly: reason }));

      const { container } = render(path);

      const content = await editor(container);
      // Readable: the file is on screen. Not writable: no caret to promise
      // that the next keystroke goes anywhere.
      expect(content).toHaveAttribute("contenteditable", "false");
      expect(content.textContent).toContain("const a = 1;");
      expect(screen.getByText(why)).toBeInTheDocument();
      expect(screen.getByText(chip)).toBeInTheDocument();
    });
  }

  it("shows the daemon's refusal for a symlink that leaves the checkout", async () => {
    trpcMock.files.read.query.mockRejectedValue(
      new Error("chaves/id_rsa aponta para fora do checkout"),
    );

    render("chaves/id_rsa");

    expect(await screen.findByRole("alert")).toHaveTextContent(/aponta para fora do checkout/);
  });

  it("says the size, the line count and the language", async () => {
    trpcMock.files.read.query.mockResolvedValue(textFile({ bytes: 2_100, lines: 68 }));

    render();

    expect(await screen.findByText(/2 KB · 68 linhas · typescript/)).toBeInTheDocument();
  });

  it("closes, which is how the split gives the width back to the session", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    trpcMock.files.read.query.mockResolvedValue(textFile({ path: "a.ts" }));

    const { container } = render("a.ts", onClose);
    await editor(container);

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
