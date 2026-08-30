import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

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
  const tree = await screen.findByLabelText("árvore de projetos");
  await user.click(await within(tree).findByRole("button", { name: /^lorebase/ }));
}

/** …and then the worktree, clicked in the sidebar rather than in the detail. */
async function selectWorktree(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await selectProject(user);
  const tree = screen.getByLabelText("árvore de projetos");
  await user.click(await within(tree).findByRole("button", { name: /^teste/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  // `resetAllMocks` apaga implementação, e as telas que consultam o daemon no
  // `mount` — a do workspace e o consumo do projeto — voltariam a devolver
  // `undefined`, botando um `role="alert"` a mais na tela.
  installTrpcDefaults();
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

    const tree = await screen.findByLabelText("árvore de projetos");
    expect(await within(tree).findByRole("button", { name: /^teste/ })).toBeInTheDocument();
    expect(within(tree).getByRole("button", { name: /^outra/ })).toBeInTheDocument();
  });

  it("shows the branch only when the name does not already say it", async () => {
    // F3.3 wants name and branch. F4.2 makes them the same string in this
    // version, so printing both would be printing one twice.
    trpc.worktree.listByProject.query.mockResolvedValue([
      worktree("wt1", "teste"),
      { ...worktree("wt2", "outra"), branch: "feature/outra" },
    ]);

    renderWithProviders(<App />);

    const tree = await screen.findByLabelText("árvore de projetos");
    expect(await within(tree).findByRole("button", { name: "teste" })).toBeInTheDocument();
    expect(within(tree).getByRole("button", { name: "outra feature/outra" })).toBeInTheDocument();
  });

  it("marks a worktree that is no longer on disk", async () => {
    // F7.4: it stays visible and says so rather than disappearing.
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste", "missing")]);

    renderWithProviders(<App />);

    const tree = await screen.findByLabelText("árvore de projetos");
    expect(await within(tree).findByRole("button", { name: "teste ausente" })).toBeInTheDocument();
  });

  it("does not offer worktrees for a project whose repository is gone", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([project(false)]);

    renderWithProviders(<App />);

    expect(await screen.findByRole("button", { name: "lorebase sem disco" })).toBeInTheDocument();
    // Asking a repository that is not there can only produce an error the row
    // has already reported.
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

    await selectProject(user);
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

    await selectProject(user);
    await user.click(await screen.findByRole("button", { name: "nova worktree" }));
    await user.type(screen.getByLabelText("Nome da worktree"), "teste");
    await user.click(screen.getByRole("button", { name: "criar" }));

    expect(await screen.findByText("criando a worktree…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "criando…" })).toBeDisabled();
  });

  it("shows the daemon's refusal for a branch that already exists", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockRejectedValue(
      new Error('a branch "main" já existe; escolha outro nome'),
    );

    await selectProject(user);
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

    await selectWorktree(user);

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

    await selectWorktree(user);

    // The count is the whole point: "suja" alone does not tell the user
    // whether removing it would cost a typo or a day.
    expect(await screen.findByText(/suja · 3 arquivos/)).toBeInTheDocument();
  });

  it("removes a clean worktree", async () => {
    const user = userEvent.setup();
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.worktree.remove.mutate.mockImplementation(async () => {
      trpc.worktree.listByProject.query.mockResolvedValue([]);
      return { ok: true as const };
    });

    await selectWorktree(user);
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

    await selectWorktree(user);
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

    await selectWorktree(user);

    // A warning, not an alert: nothing the user just did caused this, and it
    // is already true when the panel opens.
    expect(await screen.findByRole("status")).toHaveTextContent("O diretório não está em");
    expect(screen.getByText("ausente do disco")).toBeInTheDocument();
    // The registration still says which branch it was, so removing it is a
    // decision the user can make with the facts in front of them.
    expect(screen.getByText("desconhecido")).toBeInTheDocument();
  });
});

describe("o run visto de fora do rodapé", () => {
  /** O status de um checkout, com o que o teste quer dizer. */
  function scriptStatus(overrides: Record<string, unknown> = {}) {
    return {
      scripts: { setup: null, run: null, teardown: null },
      file: "/repos/lorebase/.lumem/project.toml",
      trusted: true,
      reservedPort: null,
      port: null,
      setup: { command: null, last: null },
      run: { command: null, last: null },
      teardown: { command: null, last: null },
      ...overrides,
    };
  }

  function execution(overrides: Record<string, unknown> = {}) {
    return {
      sessionId: "se_1",
      exitCode: null,
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      command: "pnpm dev",
      ...overrides,
    };
  }

  it("a worktree com run vivo mostra a porta na própria linha", async () => {
    // Sem isto, "tem um dev server nesta worktree" só o `lsof` sabe — até a
    // próxima vez que você rodar e a porta já estiver ocupada por você mesmo.
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.scripts.status.query.mockImplementation((input: { scopeId: string }) =>
      Promise.resolve(
        input.scopeId === "wt1"
          ? scriptStatus({
              run: { command: "pnpm dev", last: execution() },
              port: { port: 55061, source: "output" },
            })
          : scriptStatus(),
      ),
    );

    const user = userEvent.setup();
    await selectProject(user);

    const tree = screen.getByLabelText("árvore de projetos");
    expect(await within(tree).findByText(":55061")).toBeInTheDocument();
  });

  it("a worktree cujo setup falhou diz isso onde `ausente` já aparece", async () => {
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.scripts.status.query.mockResolvedValue(
      scriptStatus({
        setup: {
          command: "./setup.sh",
          last: execution({ running: false, exitCode: 1 }),
        },
      }),
    );

    const user = userEvent.setup();
    await selectProject(user);

    const tree = screen.getByLabelText("árvore de projetos");
    expect(await within(tree).findAllByText("setup falhou")).not.toHaveLength(0);
  });

  it("checkout sem nada rodando não ganha marca nenhuma", async () => {
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.scripts.status.query.mockResolvedValue(scriptStatus());

    const user = userEvent.setup();
    await selectProject(user);

    const tree = screen.getByLabelText("árvore de projetos");
    await within(tree).findByRole("button", { name: /^teste/ });
    expect(within(tree).queryByText(/^:\d+$/)).not.toBeInTheDocument();
    expect(within(tree).queryByText("setup falhou")).not.toBeInTheDocument();
  });
});
