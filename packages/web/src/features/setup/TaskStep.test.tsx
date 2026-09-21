import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render.js";
import { trpcMock as trpc } from "../../test/trpc-mock.js";
import { TaskStep } from "./TaskStep.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

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
  trpc.worktree.plan.query.mockResolvedValue(PLAN);
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.session.listByScope.query.mockResolvedValue([]);
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
