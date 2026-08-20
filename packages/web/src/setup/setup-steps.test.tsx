import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";
import { Done } from "./Done.js";
import { ProjectStep } from "./ProjectStep.js";
import { TaskStep } from "./TaskStep.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * The last three screens, each on its own.
 *
 * Mounted directly rather than walked to through the flow: these are the screens
 * with real input behaviour — a debounced read of the disk, a preview that
 * refuses, a receipt read back from the daemon — and driving five steps first
 * would make every one of those assertions depend on the four before it.
 */

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

const PLAN = {
  name: "primeira-tarefa",
  branch: "primeira-tarefa",
  path: "/tmp/lumem/worktrees/lorebase/primeira-tarefa",
  baseBranch: "main",
  baseSha: "8f3c1de",
  command: "git worktree add -b primeira-tarefa /tmp/lumem/worktrees/lorebase/primeira-tarefa main",
  refusal: null as string | null,
};

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.project.inspect.query.mockResolvedValue(INSPECT);
  trpc.worktree.plan.query.mockResolvedValue(PLAN);
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.session.listByScope.query.mockResolvedValue([]);
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

function taskStep(props: Partial<Parameters<typeof TaskStep>[0]> = {}) {
  const onNext = vi.fn();
  renderWithProviders(
    <TaskStep
      projectId="p1"
      agentConfigId="a1"
      onNext={onNext}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      {...props}
    />,
  );
  return { onNext };
}

describe("task step", () => {
  it("previews the branch, the directory and the literal git command", async () => {
    // Showing the command teaches the model in one second, and makes the result
    // auditable when it surprises you (O13).
    taskStep();

    expect(await screen.findByText(PLAN.command)).toBeInTheDocument();
    expect(screen.getByText(PLAN.path)).toBeInTheDocument();
    expect(screen.getByText(/← main · 8f3c1de/)).toBeInTheDocument();
  });

  it("refuses on the preview, not on the creation", async () => {
    trpc.worktree.plan.query.mockResolvedValue({
      ...PLAN,
      refusal: 'a branch "primeira-tarefa" já existe; escolha outro nome',
    });

    taskStep();

    expect(await screen.findByRole("alert")).toHaveTextContent("já existe");
    expect(screen.getByRole("button", { name: /Criar e abrir a conversa/ })).toBeDisabled();
  });

  it("creates the worktree and opens the conversation", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1", name: "primeira-tarefa" });
    trpc.session.createAgent.mutate.mockResolvedValue({ id: "s1" });
    const { onNext } = taskStep();

    await user.click(await screen.findByRole("button", { name: /Criar e abrir a conversa/ }));

    await waitFor(() =>
      expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
        agentConfigId: "a1",
      }),
    );
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: "wt1", sessionOpened: true }),
    );
  });

  it("creates only the worktree when that is what was chosen", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1", name: "primeira-tarefa" });
    taskStep();

    await user.click(await screen.findByRole("radio", { name: /Só a worktree/ }));
    await user.click(screen.getByRole("button", { name: /Criar a worktree/ }));

    await waitFor(() => expect(trpc.worktree.create.mutate).toHaveBeenCalledOnce());
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
  });

  it("does not offer a session when there is no ACP agent to open one with", async () => {
    // Whoever skipped step 2 should not be shown a choice they cannot make.
    taskStep({ agentConfigId: undefined });

    const choice = await screen.findByRole("radio", { name: /Uma sessão do Claude/ });
    expect(choice).toBeDisabled();
    expect(screen.getByText(/passo 2 foi pulado/)).toBeInTheDocument();
  });

  it("keeps the worktree when the session fails to spawn", async () => {
    // The checkout exists by then, and rolling it back to report a failed spawn
    // would delete something the person asked for.
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1", name: "primeira-tarefa" });
    trpc.session.createAgent.mutate.mockRejectedValue(
      new Error('"claude-agent-acp" não está no PATH do servidor'),
    );
    const { onNext } = taskStep();

    await user.click(await screen.findByRole("button", { name: /Criar e abrir a conversa/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está no PATH");
    expect(onNext).not.toHaveBeenCalled();
    expect(trpc.worktree.create.mutate).toHaveBeenCalledOnce();
  });

  it("says there is nowhere to cut a worktree from when the project was skipped", async () => {
    taskStep({ projectId: undefined });

    expect(await screen.findByText(/passo do projeto foi pulado/)).toBeInTheDocument();
  });
});

describe("done", () => {
  const RESULT: Record<string, string> = {
    workspaceId: "w1",
    agentConfigId: "a1",
    projectId: "p1",
    worktreeId: "wt1",
  };

  function done(result: Record<string, string> = RESULT, skipped: string[] = []) {
    const onOpen = vi.fn();
    const onReview = vi.fn();
    renderWithProviders(
      <Done
        result={result}
        skipped={skipped as never[]}
        onOpen={onOpen}
        onReview={onReview}
      />,
    );
    return { onOpen, onReview };
  }

  it("reads the receipt back from the daemon", async () => {
    // Not from what the flow remembers having sent: the interesting case is
    // exactly when the two disagree.
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    trpc.agentConfig.list.query.mockResolvedValue([
      {
        id: "a1",
        name: "claude",
        command: "claude-agent-acp",
        transport: "acp",
        adapterVersion: "0.69.0",
        available: true,
      },
    ]);
    trpc.project.get.query.mockResolvedValue({ id: "p1", path: "/repos/lorebase", available: true });
    trpc.worktree.getDetail.query.mockResolvedValue({
      id: "wt1",
      path: "/tmp/lumem/worktrees/lorebase/primeira-tarefa",
      present: true,
    });
    trpc.session.listByScope.query.mockResolvedValue([
      { id: "s1", kind: "agent", state: "running", agentName: "claude" },
    ]);

    done();

    expect(await screen.findByText("pessoal")).toBeInTheDocument();
    expect(await screen.findByText(/claude-agent-acp @0\.69\.0/)).toBeInTheDocument();
    expect(await screen.findByText("/repos/lorebase")).toBeInTheDocument();
    expect(
      await screen.findByText("/tmp/lumem/worktrees/lorebase/primeira-tarefa"),
    ).toBeInTheDocument();
  });

  it("reports what the daemon says is missing from disk", async () => {
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    trpc.project.get.query.mockResolvedValue({ id: "p1", path: "/repos/foi", available: false });
    trpc.worktree.getDetail.query.mockResolvedValue({ id: "wt1", path: "/x", present: false });

    done();

    expect((await screen.findAllByText(/não está no disco/)).length).toBeGreaterThan(0);
  });

  it("says a step was skipped, and where it is done later", async () => {
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);

    done({ workspaceId: "w1" }, ["agent", "project", "task"]);

    expect(await screen.findByText(/no rodapé da sidebar, em agentes/)).toBeInTheDocument();
  });

  it("teaches only the shortcut that exists", async () => {
    // The design promised ⌘K, ⌘⇧N and ⌥⇧P. There is one shortcut in this app,
    // and a welcome screen that teaches three that do not exist is the worst
    // lesson possible — the first thing the person tries does not work (O15).
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);

    done();

    expect(await screen.findByText("⌘⏎")).toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
    expect(screen.queryByText("⌘⇧N")).not.toBeInTheDocument();
    expect(screen.queryByText("⌥⇧P")).not.toBeInTheDocument();
  });

  it("opens the workspace, or goes back to review", async () => {
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    const { onOpen, onReview } = done();

    await user.click(await screen.findByRole("button", { name: /Abrir o workspace/ }));
    await user.click(screen.getByRole("button", { name: "Revisar a configuração" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledOnce();
  });
});
