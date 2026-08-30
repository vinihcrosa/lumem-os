import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

const dock = {
  open: false,
  height: 256,
  toggle: () => {},
  setHeight: () => {},
  beginResize: () => {},
};


vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { CheckoutFiles } = await import("./CheckoutFiles.js");
const { OpenFilesProvider, useOpenFiles } = await import("../hooks/useOpenFiles.js");
const { parsePatch } = await import("./PatchViewer.js");

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

function FakeTab() {
  const openFiles = useOpenFiles();
  useEffect(() => openFiles.setActiveTab("worktree:wt_1:context"), []);
  const open = openFiles.activeTab === null ? null : openFiles.fileFor(openFiles.activeTab);
  return <div data-testid="aba">{open === null ? "nada aberto" : `${open.view}:${open.path}`}</div>;
}

function changed(path: string, extra: Record<string, unknown> = {}) {
  return {
    path,
    oldPath: null,
    status: "modified",
    additions: 4,
    deletions: 61,
    binary: false,
    ...extra,
  };
}

async function openChangesTab() {
  const user = userEvent.setup();
  renderWithProviders(
    <OpenFilesProvider>
      <FakeTab />
      <CheckoutFiles scope={scope} onClose={() => {}} onResize={() => {}} dock={dock} />
    </OpenFilesProvider>,
  );
  await user.click(await screen.findByRole("tab", { name: /Mudanças/ }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcMock.files.listDir.query.mockResolvedValue({ path: "", entries: [], total: 0, truncated: false });
  trpcMock.changes.list.query.mockResolvedValue({
    ref: "worktree",
    comparedTo: "HEAD",
    baseBranch: "main",
    files: [changed("src/lore/loader.ts")],
  });
});

describe("a aba de mudanças", () => {
  it("lists the files with their counts, and totals them", async () => {
    await openChangesTab();

    expect(await screen.findByText("loader.ts")).toBeInTheDocument();
    expect(screen.getByText("src/lore/")).toBeInTheDocument();
    expect(screen.getAllByText("+4").length).toBeGreaterThan(0);
    expect(screen.getByText("1 arquivo")).toBeInTheDocument();
  });

  it("switches to the base view, which asks the daemon a different question", async () => {
    const user = await openChangesTab();
    await screen.findByText("loader.ts");
    trpcMock.changes.list.query.mockResolvedValue({
      ref: "base",
      comparedTo: "8f3c1de",
      baseBranch: "main",
      files: [changed("commitado.ts", { status: "added", additions: 68, deletions: 0 })],
    });

    await user.click(screen.getByRole("button", { name: "vs main" }));

    expect(await screen.findByText("commitado.ts")).toBeInTheDocument();
    expect(trpcMock.changes.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "base" }),
    );
  });

  it("keeps the uncommitted view working when the base branch is gone", async () => {
    const user = await openChangesTab();
    await screen.findByText("loader.ts");
    // Only the base view is refused: the daemon still answers the other one,
    // which is the whole point of F4.6.
    trpcMock.changes.list.query.mockImplementation(({ ref }: { ref: string }) =>
      ref === "base"
        ? Promise.reject(
            new Error(
              'a branch "main" não existe mais neste repositório — sem base, não há o que comparar',
            ),
          )
        : Promise.resolve({
            ref: "worktree",
            comparedTo: "HEAD",
            baseBranch: "main",
            files: [changed("src/lore/loader.ts")],
          }),
    );

    await user.click(screen.getByRole("button", { name: "vs main" }));

    // F4.6: only that view is refused, and it says why.
    expect(await screen.findByRole("alert")).toHaveTextContent(/não existe mais neste repositório/);
    // The toggle keeps the branch's name: renaming itself to "vs base" at the
    // moment of the refusal would take away the word the message is about.
    expect(screen.getByRole("button", { name: "vs main" })).toHaveClass("seg__btn--off");
    expect(screen.getByRole("button", { name: "não commitado" })).toBeEnabled();
  });

  it("has a different sentence for each kind of nothing", async () => {
    trpcMock.changes.list.query.mockResolvedValue({
      ref: "worktree",
      comparedTo: "HEAD",
      baseBranch: "main",
      files: [],
    });

    const user = await openChangesTab();

    expect(await screen.findByText("nada por commitar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "vs main" }));

    expect(await screen.findByText("idêntica a main")).toBeInTheDocument();
  });

  it("shows a rename's old path and marks a binary without counts", async () => {
    trpcMock.changes.list.query.mockResolvedValue({
      ref: "worktree",
      comparedTo: "HEAD",
      baseBranch: "main",
      files: [
        changed("docs/guia-de-uso.md", { status: "renamed", oldPath: "docs/uso.md", deletions: 0 }),
        changed("assets/logo.png", { binary: true, additions: 0, deletions: 0 }),
      ],
    });

    await openChangesTab();

    expect(await screen.findByText("era docs/uso.md")).toBeInTheDocument();
    expect(screen.getByText("binário")).toBeInTheDocument();
  });

  it("opens the patch in the tab's split, not inside the column", async () => {
    const user = await openChangesTab();
    const row = await screen.findByText("loader.ts");

    await user.click(row);

    await waitFor(() =>
      expect(screen.getByTestId("aba")).toHaveTextContent("patch:src/lore/loader.ts"),
    );
    // The list is still there: the column navigates, the split reads.
    expect(screen.getByText("loader.ts")).toBeInTheDocument();
  });
});

describe("parsePatch", () => {
  const patch = [
    "diff --git a/src/loader.ts b/src/loader.ts",
    "index 1234567..89abcde 100644",
    "--- a/src/loader.ts",
    "+++ b/src/loader.ts",
    "@@ -1,4 +1,4 @@",
    ' import { readFile } from "node:fs/promises";',
    "-const lines = raw.split();",
    "+const { keys } = parseFrontmatter(raw);",
    " return { keys };",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  it("drops the file headers the frame already says", () => {
    // Four lines of "which file is this" in a 360px column, right under a
    // header that says exactly that.
    expect(parsePatch(patch).map((line) => line.kind)).toEqual([
      "hunk",
      "context",
      "del",
      "add",
      "context",
    ]);
  });

  it("keeps each line's text without its sign", () => {
    const lines = parsePatch(patch);

    expect(lines[2]).toEqual({ kind: "del", text: "const lines = raw.split();" });
    expect(lines[3]).toEqual({ kind: "add", text: "const { keys } = parseFrontmatter(raw);" });
  });
});
