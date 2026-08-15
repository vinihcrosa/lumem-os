import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { CheckoutFiles } = await import("./CheckoutFiles.js");
const { OpenFilesProvider, useOpenFiles } = await import("../hooks/useOpenFiles.js");

/** Stands in for the tab: claims to be active, and shows what it has open. */
function FakeTab() {
  const openFiles = useOpenFiles();
  useEffect(() => openFiles.setActiveTab("worktree:wt_1:context"), []);
  const open = openFiles.activeTab === null ? null : openFiles.fileFor(openFiles.activeTab);
  return <div data-testid="aba">{open === null ? "nada aberto" : open.path}</div>;
}

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

interface Entry {
  name: string;
  kind?: "dir" | "file" | "other";
  size?: number | null;
}

function listing(path: string, entries: Entry[], extra: Partial<{ total: number; truncated: boolean }> = {}) {
  return {
    path,
    entries: entries.map((entry) => ({
      name: entry.name,
      kind: entry.kind ?? "file",
      size: entry.size ?? null,
      symlink: false,
    })),
    total: extra.total ?? entries.length,
    truncated: extra.truncated ?? false,
  };
}

function render() {
  return renderWithProviders(
    <OpenFilesProvider>
      <FakeTab />
      <CheckoutFiles scope={scope} onClose={() => {}} onResize={() => {}} />
    </OpenFilesProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcMock.changes.list.query.mockResolvedValue({
    ref: "worktree",
    comparedTo: "HEAD",
    baseBranch: "main",
    files: [],
  });
});

describe("a árvore de arquivos", () => {
  it("asks for one level and shows what came back", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "src", kind: "dir" }, { name: "README.md", size: 12 }]),
    );

    render();

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(trpcMock.files.listDir.query).toHaveBeenCalledTimes(1);
    expect(trpcMock.files.listDir.query).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: "wt_1", path: "" }),
    );
  });

  it("only reads a directory when it is expanded", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path === ""
          ? listing("", [{ name: "src", kind: "dir" }])
          : listing("src", [{ name: "loader.ts" }]),
      ),
    );

    render();
    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.queryByText("loader.ts")).not.toBeInTheDocument();

    await user.click(screen.getByText("src"));

    expect(await screen.findByText("loader.ts")).toBeInTheDocument();
  });

  it("marks a file with the status the diff reports", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(listing("", [{ name: "loader.ts" }]));
    trpcMock.changes.list.query.mockResolvedValue({
      ref: "worktree",
      comparedTo: "HEAD",
      baseBranch: "main",
      files: [
        {
          path: "loader.ts",
          oldPath: null,
          status: "modified",
          additions: 4,
          deletions: 61,
          binary: false,
        },
      ],
    });

    render();

    expect(await screen.findByTitle("modified")).toHaveTextContent("M");
    // Same query the Mudanças tab reads: one question, one answer.
    expect(trpcMock.changes.list.query).toHaveBeenCalledTimes(1);
  });

  it("says a listing was truncated, and can ask for the whole thing", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "a.txt" }], { total: 8_431, truncated: true }),
    );

    render();

    expect(await screen.findByText(/1 de 8\.?431 entradas|1 de 8431 entradas/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "listar assim mesmo" }));

    await waitFor(() =>
      expect(trpcMock.files.listDir.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 8_431 }),
      ),
    );
  });

  it("says a directory is empty instead of showing nothing at all", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(listing("", []));

    render();

    expect(await screen.findByText("vazio")).toBeInTheDocument();
  });

  it("shows the daemon's refusal when the checkout is gone", async () => {
    trpcMock.files.listDir.query.mockRejectedValue(
      new Error("o checkout não está em ~/.lumem/worktrees/lorebase/ui-polish"),
    );

    render();

    expect(await screen.findByRole("alert")).toHaveTextContent(/o checkout não está em/);
  });

  it("opens the clicked file in the active tab, and marks the row", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "loader.ts" }, { name: "index.ts" }]),
    );

    const { container } = render();
    const row = await screen.findByText("loader.ts");
    expect(screen.getByTestId("aba")).toHaveTextContent("nada aberto");

    await user.click(row);

    // The column navigates and the tab reads: the click has to leave the tree.
    expect(screen.getByTestId("aba")).toHaveTextContent("loader.ts");
    const open = container.querySelectorAll(".frow--open");
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent("loader.ts");
  });
});
