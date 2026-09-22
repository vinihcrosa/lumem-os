import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render.js";
import { trpcMock as trpc } from "../../test/trpc-mock.js";
import { ProjectStep } from "./ProjectStep.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

const INSPECT = {
  path: "/repos/lorebase",
  root: "/repos/lorebase",
  head: { branch: "main", shortSha: "8f3c1de" },
  origin: "git@github.com:vrosa/lorebase.git",
  commits: 1284,
  clean: true,
  changedFiles: 0,
  worktrees: [] as { path: string; branch: string | null; prunable: boolean }[],
  alreadyRegistered: null as { id: string; name: string } | null,
  defaultBranch: "main",
};

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.project.inspect.query.mockResolvedValue(INSPECT);
});

function projectStep(props: Partial<Parameters<typeof ProjectStep>[0]> = {}) {
  const onNext = vi.fn();
  renderWithProviders(
    <ProjectStep
      workspaceId="w1"
      onNext={onNext}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      {...props}
    />,
  );
  return { onNext };
}

describe("project step", () => {
  it("has no directory picker, because there cannot be one", async () => {
    // The daemon may be on another machine, and a browser's file input hands over
    // a file, not a server-side path (O10). The design drew `escolher…`.
    projectStep();

    expect(await screen.findByLabelText(/Pasta do projeto/)).toBeInTheDocument();
    expect(screen.queryByText("escolher…")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("reads the repository once the typing stops, not per keystroke", async () => {
    const user = userEvent.setup();
    projectStep();

    await user.type(await screen.findByLabelText(/Pasta do projeto/), "/repos/lorebase");

    // Six git commands per keystroke would answer about paths nobody meant.
    await waitFor(() => expect(trpc.project.inspect.query).toHaveBeenCalledTimes(1));
    expect(trpc.project.inspect.query).toHaveBeenCalledWith({ path: "/repos/lorebase" });
  });

  it("shows what the daemon read before anything is registered", async () => {
    const user = userEvent.setup();
    projectStep();
    await user.type(await screen.findByLabelText(/Pasta do projeto/), "/repos/lorebase");

    expect(await screen.findByText(/1284 commit/)).toBeInTheDocument();
    expect(screen.getByText(/github\.com:vrosa\/lorebase/)).toBeInTheDocument();
    expect(screen.getByText(/limpa · nada por commitar/)).toBeInTheDocument();
    expect(trpc.project.add.mutate).not.toHaveBeenCalled();
  });

  it("warns about worktrees created outside the Lumem, and touches none", async () => {
    const user = userEvent.setup();
    trpc.project.inspect.query.mockResolvedValue({
      ...INSPECT,
      worktrees: [{ path: "/repos/hotfix-boot", branch: "hotfix-boot", prunable: false }],
    });

    projectStep();
    await user.type(await screen.findByLabelText(/Pasta do projeto/), "/repos/lorebase");

    expect(await screen.findByText(/1 já registrada/)).toBeInTheDocument();
    expect(screen.getByText(/não passa a listá-las/)).toBeInTheDocument();
  });

  it("points at the project that already exists instead of failing", async () => {
    const user = userEvent.setup();
    trpc.project.inspect.query.mockResolvedValue({
      ...INSPECT,
      alreadyRegistered: { id: "p-old", name: "lorebase" },
    });
    const { onNext } = projectStep();

    await user.type(await screen.findByLabelText(/Pasta do projeto/), "/repos/lorebase");
    await user.click(await screen.findByRole("button", { name: /Usar o que já está aqui/ }));

    expect(trpc.project.add.mutate).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p-old" }));
  });

  it("shows which check the daemon refused on", async () => {
    const user = userEvent.setup();
    trpc.project.inspect.query.mockRejectedValue(
      new Error("/repos/nada não é um repositório git"),
    );
    projectStep();

    await user.type(await screen.findByLabelText(/Pasta do projeto/), "/repos/nada");

    expect(await screen.findByRole("alert")).toHaveTextContent("não é um repositório git");
  });

  it("does not ask the daemon about a relative path", async () => {
    const user = userEvent.setup();
    projectStep();

    await user.type(await screen.findByLabelText(/Pasta do projeto/), "repos/lorebase");

    await waitFor(() => expect(screen.getByLabelText(/Pasta do projeto/)).toHaveValue("repos/lorebase"));
    expect(trpc.project.inspect.query).not.toHaveBeenCalled();
  });
});
