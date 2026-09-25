import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumePendingDraft } from "../../lib/navigation.js";
import { CLAUDE_VIEW_WITH_COMMANDS, CODEX_VIEW } from "../../test/adapter-catalog-fixtures.js";
import { renderWithProviders } from "../../test/render.js";
import { installTrpcDefaults, NO_HOST_ORIGINS, trpcMock as trpc } from "../../test/trpc-mock.js";
import { NewWorktreeComposerModal } from "./NewWorktreeComposerModal.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * Criar worktree é compor o primeiro prompt (`033` T20, F4).
 *
 * O que está sob teste é a ligação ao daemon: `worktree.start` recebe o que
 * o compositor tem na hora do `Create`, e o rascunho por projeto (Q1)
 * sobrevive ao modal fechar e reabrir — na mesma aba, e sem se misturar entre
 * dois projetos.
 */

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "lumem-os",
    path: "/repo/lumem-os",
    workspaceId: "w1",
    remoteUrl: null,
    managed: false,
    defaultBranch: "main",
    available: true,
    hasCommits: true,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function open(props: Partial<Parameters<typeof NewWorktreeComposerModal>[0]> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const onOpenExisting = vi.fn();
  const result = renderWithProviders(
    <NewWorktreeComposerModal
      workspaceId="w1"
      projectId="p1"
      onClose={onClose}
      onCreated={onCreated}
      onOpenExisting={onOpenExisting}
      {...props}
    />,
  );
  return { onClose, onCreated, onOpenExisting, ...result };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  trpc.project.listByWorkspace.query.mockResolvedValue([
    project({ id: "p1", name: "lumem-os" }),
    project({ id: "p2", name: "lorebase", defaultBranch: "develop" }),
  ]);
  trpc.worktree.branches.query.mockResolvedValue([]);
  trpc.worktree.hostOrigins.query.mockResolvedValue(NO_HOST_ORIGINS);
  trpc.adapterCatalog.list.query.mockResolvedValue([CLAUDE_VIEW_WITH_COMMANDS, CODEX_VIEW]);
});

function promptField() {
  return screen.getByLabelText("No que você quer trabalhar?");
}

describe("`Create` chama `worktree.start`", () => {
  it("manda o prompt, o adaptador e o modelo escolhidos", async () => {
    const user = userEvent.setup();
    trpc.worktree.start.mutate.mockResolvedValue({ worktreeId: "wt1", sessionId: "s1" });
    open();

    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "corrigir o bug do login");

    // A pílula nasce no ACP padrão (Claude); trocar para o Codex e escolher
    // `gpt-5.5` é o que prova que o `adapterId` **e** o `config.model` vêm da
    // escolha, e não de um valor fixo.
    await user.click(screen.getByRole("button", { name: /^agente e modelo:/ }));
    const menu = screen.getByRole("menu", { name: "agente e modelo" });
    const codex = within(menu).getByRole("group", { name: "Codex" });
    await user.click(within(codex).getByRole("menuitemradio", { name: /^gpt-5\.5/ }));

    await user.click(screen.getByRole("button", { name: /Create/ }));

    expect(trpc.worktree.start.mutate).toHaveBeenCalledWith({
      projectId: "p1",
      prompt: "corrigir o bug do login",
      adapterId: "codex",
      config: { model: "gpt-5.5" },
      name: undefined,
      from: undefined,
    });
  });

  it("no sucesso, chega na worktree nova e fecha o modal — o prompt não é remandado pelo cliente", async () => {
    // T12 já entrega o prompt pelo daemon (`pending_prompt`) — a web só traz a
    // aba para a frente (`arrive({ send: false })`); não existe aqui nenhuma
    // segunda chamada que mande o texto de novo.
    const user = userEvent.setup();
    trpc.worktree.start.mutate.mockResolvedValue({ worktreeId: "wt1", sessionId: "s1" });
    const { onCreated, onClose } = open();

    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "oi");
    await user.click(screen.getByRole("button", { name: /Create/ }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith("wt1"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("o rascunho por projeto (Q1)", () => {
  it("fechar e reabrir o modal traz o texto de volta", async () => {
    const user = userEvent.setup();
    const first = open();
    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "meu rascunho");

    first.unmount();
    open();

    expect(await screen.findByLabelText("No que você quer trabalhar?")).toHaveValue("meu rascunho");
  });

  it("outro projeto tem outro rascunho", async () => {
    const user = userEvent.setup();
    const forP1 = open({ projectId: "p1" });
    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "tarefa do p1");
    forP1.unmount();

    const forP2 = open({ projectId: "p2" });
    expect(await screen.findByLabelText("No que você quer trabalhar?")).toHaveValue("");
    await user.type(promptField(), "tarefa do p2");
    forP2.unmount();

    open({ projectId: "p1" });
    expect(await screen.findByLabelText("No que você quer trabalhar?")).toHaveValue("tarefa do p1");
  });
});

describe("F4.7 — a branch escolhida já tem worktree", () => {
  it("abre a existente em vez de criar", async () => {
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([
      {
        name: "feature-a",
        local: true,
        remotes: [],
        worktreePath: "/w/feature-a",
        worktreeId: "wt9",
        worktreeName: "feature-a",
      },
    ]);
    const { onOpenExisting, onClose } = open();

    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "continuar");
    await user.click(screen.getByRole("button", { name: /^origem:/ }));
    await user.click(screen.getByRole("button", { name: "branch" }));
    await user.click(await screen.findByRole("option", { name: /feature-a/ }));
    await user.click(screen.getByRole("button", { name: /abrir feature-a/ }));

    expect(onOpenExisting).toHaveBeenCalledWith("wt9");
    expect(onClose).toHaveBeenCalledOnce();
    expect(trpc.worktree.start.mutate).not.toHaveBeenCalled();
  });

  it("carrega o texto digitado para o escopo de destino, para a worktree existente pré-preencher o rascunho", async () => {
    // O modal não sabe montar a aba — só sabe para onde o texto vai
    // (`lib/navigation.ts#arriveDraft`). Quem nasce o rascunho é o
    // `useWorktreeTabs` da worktree de destino; a prova de ponta a ponta está
    // em `worktree-ui.test.tsx`.
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([
      {
        name: "feature-a",
        local: true,
        remotes: [],
        worktreePath: "/w/feature-a",
        worktreeId: "wt9",
        worktreeName: "feature-a",
      },
    ]);
    open();

    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "continuar dali");
    await user.click(screen.getByRole("button", { name: /^origem:/ }));
    await user.click(screen.getByRole("button", { name: "branch" }));
    await user.click(await screen.findByRole("option", { name: /feature-a/ }));
    await user.click(screen.getByRole("button", { name: /abrir feature-a/ }));

    expect(
      consumePendingDraft({ scopeType: "worktree", scopeId: "wt9" }),
    ).toBe("continuar dali");
  });
});

describe("um repositório sem commit (F6.13)", () => {
  it("recusa criar, com a frase do motivo", async () => {
    const user = userEvent.setup();
    trpc.project.listByWorkspace.query.mockResolvedValue([
      project({ id: "p1", name: "lumem-os", hasCommits: false }),
    ]);
    open();

    await user.type(await screen.findByLabelText("No que você quer trabalhar?"), "algo");

    // A frase aparece assim que o modal abre — sem esperar o clique, porque
    // deixar o `git` responder seria "invalid reference" (F6.13).
    expect(
      await screen.findByText(/este repositório ainda não tem nenhum commit/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Create/ }));
    expect(trpc.worktree.start.mutate).not.toHaveBeenCalled();
  });
});
