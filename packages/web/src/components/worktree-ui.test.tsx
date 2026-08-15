import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));


const stamps = { createdAt: new Date(), updatedAt: new Date() };

function project(available = true) {
  return {
    id: "p1",
    workspaceId: "w1",
    name: "lorebase",
    path: "/repos/lorebase",
    defaultBranch: "main",
    available,
    ...stamps,
  };
}

function worktree(id: string, name: string, state: "active" | "missing" = "active") {
  return {
    id,
    projectId: "p1",
    name,
    branch: name,
    path: `/home/.lumem/worktrees/lorebase/${name}`,
    state,
    present: state === "active",
    ...stamps,
  };
}

function detail(overrides: Partial<ReturnType<typeof worktree>> & Record<string, unknown> = {}) {
  return {
    ...worktree("wt1", "teste"),
    baseBranch: "main",
    status: { clean: true, changedFiles: 0 },
    aheadBehind: { ahead: 0, behind: 0 },
    ...overrides,
  };
}

/** Opens the app with one project already selected. */
async function selectProject(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  renderWithProviders(<App />);
  await user.click(await screen.findByRole("button", { name: /lorebase/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal", ...stamps }]);
  trpc.project.listByWorkspace.query.mockResolvedValue([project()]);
  trpc.project.get.query.mockResolvedValue(project());
  trpc.worktree.listByProject.query.mockResolvedValue([]);
  trpc.worktree.getDetail.query.mockResolvedValue(detail());
});

describe("worktree tree", () => {
  it("shows each worktree with its branch under the project", async () => {
    // F3.2 and F3.3.
    trpc.worktree.listByProject.query.mockResolvedValue([
      worktree("wt1", "teste"),
      worktree("wt2", "outra"),
    ]);

    renderWithProviders(<App />);

    const tree = await screen.findByLabelText("worktrees de p1");
    await waitFor(() => expect(within(tree).getAllByRole("listitem")).toHaveLength(2));
    expect(within(tree).getByRole("button", { name: /teste/ })).toBeInTheDocument();
  });

  it("marks a worktree that is no longer on disk", async () => {
    // F7.4: it stays visible and says so rather than disappearing.
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste", "missing")]);

    renderWithProviders(<App />);

    const tree = await screen.findByLabelText("worktrees de p1");
    const item = (await within(tree).findAllByRole("listitem"))[0];
    expect(item).toHaveAttribute("data-state", "missing");
    expect(item).toHaveTextContent("ausente");
  });

  it("does not offer worktrees for a project whose repository is gone", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([project(false)]);

    renderWithProviders(<App />);

    expect(await screen.findByText("repositório indisponível")).toBeInTheDocument();
    expect(trpc.worktree.listByProject.query).not.toHaveBeenCalled();
  });
});

describe("create worktree", () => {
  it("creates one and selects it", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockImplementation(async () => {
      const created = worktree("wt1", "teste-prd");
      trpc.worktree.listByProject.query.mockResolvedValue([created]);
      trpc.worktree.getDetail.query.mockResolvedValue(detail(created));
      return created;
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "nova worktree" }));
    await user.type(screen.getByLabelText("Nome da worktree"), "teste-prd");
    await user.click(screen.getByRole("button", { name: "criar" }));

    await waitFor(() =>
      expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({
        projectId: "p1",
        name: "teste-prd",
      }),
    );
    expect(await screen.findByRole("heading", { name: "teste-prd" })).toBeInTheDocument();
  });

  it("says it is working while git copies the checkout", async () => {
    // `git worktree add` is seconds on a large repository, and a button that
    // looks idle invites a second click that fails on the branch the first made.
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "nova worktree" }));
    await user.type(screen.getByLabelText("Nome da worktree"), "teste");
    await user.click(screen.getByRole("button", { name: "criar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("criando a worktree…");
    expect(screen.getByRole("button", { name: "criando…" })).toBeDisabled();
  });

  it("shows the daemon's refusal for a branch that already exists", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockRejectedValue(
      new Error('a branch "main" já existe; escolha outro nome'),
    );

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "nova worktree" }));
    await user.type(screen.getByLabelText("Nome da worktree"), "main");
    await user.click(screen.getByRole("button", { name: "criar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("escolha outro nome");
  });
});

describe("worktree detail", () => {
  it("shows branch, path, cleanliness and distance from the base", async () => {
    // F4.10.
    const user = userEvent.setup();
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ aheadBehind: { ahead: 2, behind: 3 } } as never),
    );

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: /teste/ }));

    expect(await screen.findByText("/home/.lumem/worktrees/lorebase/teste")).toBeInTheDocument();
    expect(screen.getByText("limpa")).toBeInTheDocument();
    expect(screen.getByText("2 à frente, 3 atrás")).toBeInTheDocument();
    expect(screen.getByText("a branch não é apagada")).toBeInTheDocument();
  });

  it("reports how many files make it dirty", async () => {
    const user = userEvent.setup();
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ status: { clean: false, changedFiles: 3 } } as never),
    );

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: /teste/ }));

    expect(await screen.findByText(/3 arquivo\(s\) modificado\(s\)/)).toBeInTheDocument();
  });

  it("removes a clean worktree", async () => {
    const user = userEvent.setup();
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.worktree.remove.mutate.mockImplementation(async () => {
      trpc.worktree.listByProject.query.mockResolvedValue([]);
      return { ok: true as const };
    });

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: /teste/ }));
    await user.click(await screen.findByRole("button", { name: "remover worktree" }));

    await waitFor(() =>
      expect(trpc.worktree.remove.mutate).toHaveBeenCalledWith({ id: "wt1", force: false }),
    );
  });

  it("asks for an explicit confirmation when the daemon blocks the removal", async () => {
    // The second click is the one that can destroy uncommitted work, so it is
    // only offered after the daemon has already refused once.
    const user = userEvent.setup();
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.worktree.remove.mutate.mockRejectedValueOnce(
      new Error("a worktree tem 2 arquivo(s) modificado(s); confirme para remover mesmo assim"),
    );

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: /teste/ }));
    await user.click(await screen.findByRole("button", { name: "remover worktree" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("2 arquivo(s) modificado(s)");
    const forced = screen.getByRole("button", { name: "remover mesmo assim" });

    trpc.worktree.remove.mutate.mockResolvedValue({ ok: true as const });
    await user.click(forced);

    await waitFor(() =>
      expect(trpc.worktree.remove.mutate).toHaveBeenLastCalledWith({ id: "wt1", force: true }),
    );
  });

  it("warns when the directory is gone but the registration is not", async () => {
    const user = userEvent.setup();
    const missing = worktree("wt1", "teste", "missing");
    trpc.worktree.listByProject.query.mockResolvedValue([missing]);
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ ...missing, status: null, aheadBehind: null } as never),
    );

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: /teste/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("o diretório não está em");
    expect(screen.getAllByText("desconhecido")).toHaveLength(2);
  });
});
