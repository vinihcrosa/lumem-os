import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { branchNameForIssue, CreateWorktreeDialog, fromOf } from "./CreateWorktreeDialog.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, NO_HOST_ORIGINS, trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * O diálogo sozinho, e não pelo `App`.
 *
 * O que está sob teste aqui é o corpo dele — as quatro origens, o que carrega
 * quando, e o que some sem host. Passar pela árvore inteira só acrescentaria
 * quatro queries que não dizem respeito a isto.
 */
function open(props: Partial<Parameters<typeof CreateWorktreeDialog>[0]> = {}) {
  const onCreated = vi.fn();
  const onOpenExisting = vi.fn();
  renderWithProviders(
    <CreateWorktreeDialog
      projectId="p1"
      projectName="lumem-os"
      open
      hasCommits
      onClose={() => {}}
      onCreated={onCreated}
      onOpenExisting={onOpenExisting}
      {...props}
    />,
  );
  return { onCreated, onOpenExisting };
}

function branch(overrides: Record<string, unknown> = {}) {
  return {
    name: "feature-a",
    local: true,
    remotes: [],
    worktreePath: null,
    worktreeId: null,
    worktreeName: null,
    ...overrides,
  };
}

function hostOrigins(overrides: Record<string, unknown> = {}) {
  return {
    host: "GitHub",
    issues: { items: [], failure: null, readAt: null },
    pulls: { items: [], failure: null, readAt: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  trpc.worktree.branches.query.mockResolvedValue([]);
  trpc.worktree.hostOrigins.query.mockResolvedValue(hostOrigins());
});

describe("as quatro origens", () => {
  it("nasce em `default`, e a default não vai à rede", async () => {
    open();

    expect(await screen.findByRole("button", { name: "default" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/sem ir à rede/)).toBeInTheDocument();
  });

  it("o campo de nome aceita digitação antes de qualquer listagem chegar", async () => {
    // F3.5, e a lição da Q5a da `sidebar-actions`: nenhuma leitura segura o
    // gesto. Aqui as duas queries **nunca** resolvem, e mesmo assim se digita.
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockReturnValue(new Promise(() => {}));
    trpc.worktree.hostOrigins.query.mockReturnValue(new Promise(() => {}));
    open();

    const field = screen.getByLabelText("Nome da worktree");
    await user.type(field, "teste-prd");

    expect(field).toHaveValue("teste-prd");
    expect(screen.getByRole("button", { name: "criar" })).toBeEnabled();
  });

  it("mostra esqueleto no lugar da lista enquanto a leitura não voltou", async () => {
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockReturnValue(new Promise(() => {}));
    open();

    await user.click(screen.getByRole("button", { name: "issue" }));

    expect(screen.getByRole("listbox", { name: "issues abertas" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("escolher uma issue preenche o nome, e o nome continua editável", async () => {
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        issues: {
          items: [
            {
              number: 52,
              title: "worktree-from: cortar de uma issue",
              state: "OPEN",
              url: "u",
              updatedAt: "2026-09-07T00:00:00Z",
              author: "a",
              labels: [],
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await user.click(screen.getByRole("button", { name: "issue" }));
    await user.click(await screen.findByRole("option", { name: /#52/ }));

    const field = screen.getByLabelText("Nome da worktree");
    expect(field).toHaveValue("52-worktree-from-cortar-de-uma-issue");
    await user.type(field, "-x");
    expect(field).toHaveValue("52-worktree-from-cortar-de-uma-issue-x");
  });

  it("manda ao daemon só o número da PR, e nunca a branch", async () => {
    // §4.2.12 da `pull-request-status`: o `headRefName` sai do cache do daemon.
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        pulls: {
          items: [
            {
              number: 19,
              title: "a pílula de modo",
              url: "u",
              headRefName: "session-mode",
              isDraft: false,
              updatedAt: "2026-09-07T00:00:00Z",
              onDisk: true,
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1" });
    open();

    await user.click(screen.getByRole("button", { name: "PR" }));
    await user.click(await screen.findByRole("option", { name: /#19/ }));
    await user.click(screen.getByRole("button", { name: "criar" }));

    await waitFor(() =>
      expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({
        projectId: "p1",
        name: "session-mode",
        from: { kind: "pr", number: 19 },
      }),
    );
  });

  it("desabilita a PR cuja head não está no disco, com o motivo na linha", async () => {
    // Q2: sem fetch. E a linha não some — sumir esconderia que a PR existe.
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        pulls: {
          items: [
            {
              number: 20,
              title: "o Codex conversa",
              url: "u",
              headRefName: "nunca-buscada",
              isDraft: false,
              updatedAt: "2026-09-07T00:00:00Z",
              onDisk: false,
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await user.click(screen.getByRole("button", { name: "PR" }));
    const row = await screen.findByRole("option", { name: /#20/ });

    expect(row).toBeDisabled();
    expect(within(row).getByText("não está no disco")).toBeInTheDocument();
  });
});

describe("a branch que outra worktree já tem", () => {
  it("não é escolhida: ela leva para o checkout que a ocupa", async () => {
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "pr-bar", worktreePath: "/w/pr-bar", worktreeId: "wt9", worktreeName: "pr-bar" }),
    ]);
    const { onOpenExisting } = open();

    await user.click(screen.getByRole("button", { name: "branch" }));
    await user.click(await screen.findByRole("option", { name: /pr-bar/ }));

    expect(onOpenExisting).toHaveBeenCalledWith("wt9");
    expect(trpc.worktree.create.mutate).not.toHaveBeenCalled();
  });

  it("quando quem ocupa é o checkout principal, ela só informa", async () => {
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "main", worktreePath: "/repo", worktreeId: null, worktreeName: null }),
    ]);
    const { onOpenExisting } = open();

    await user.click(screen.getByRole("button", { name: "branch" }));
    const row = await screen.findByRole("option", { name: /main/ });
    await user.click(row);

    expect(within(row).getByText("no checkout principal")).toBeInTheDocument();
    expect(onOpenExisting).not.toHaveBeenCalled();
  });

  it("de uma branch local livre, manda a ref e o nome separados", async () => {
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([branch({ name: "feature-a" })]);
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1" });
    open();

    await user.click(screen.getByRole("button", { name: "branch" }));
    await user.click(await screen.findByRole("option", { name: /feature-a/ }));
    const field = screen.getByLabelText("Nome da worktree");
    await user.clear(field);
    await user.type(field, "trabalho");
    await user.click(screen.getByRole("button", { name: "criar" }));

    await waitFor(() =>
      expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({
        projectId: "p1",
        name: "trabalho",
        from: { kind: "branch", ref: "feature-a", local: true },
      }),
    );
  });
});

describe("sem host", () => {
  it("sem remoto, as abas de issue e PR não aparecem", async () => {
    trpc.worktree.hostOrigins.query.mockResolvedValue(NO_HOST_ORIGINS);
    open();

    await waitFor(() => expect(screen.getByText(/não tem remoto/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "issue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PR" })).not.toBeInTheDocument();
    // A que é disco continua: ela não depende de host nenhum.
    expect(screen.getByRole("button", { name: "branch" })).toBeInTheDocument();
  });

  it("sem autenticação, diz o que fazer no terminal — e não pede token", async () => {
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        issues: {
          items: [],
          failure: { kind: "no-auth", message: "o gh não está autenticado" },
          readAt: null,
        },
      }),
    );
    open();

    expect(await screen.findByText(/gh auth login/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "issue" })).not.toBeInTheDocument();
  });

  it("sem rede, a aba fica e a lista explica", async () => {
    // `offline` é temporário. Sumir com a aba faria a tela mudar de forma por
    // causa de um wi-fi ruim, e voltar a mudar quando ele melhorasse.
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        issues: {
          items: [],
          failure: { kind: "offline", message: "não deu para falar com o GitHub" },
          readAt: null,
        },
      }),
    );
    open();

    await user.click(await screen.findByRole("button", { name: "issue" }));

    expect(screen.getByText("não deu para falar com o GitHub")).toBeInTheDocument();
  });

  it("criar sem escolher origem não manda `from` nenhum", async () => {
    const user = userEvent.setup();
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1" });
    open();

    await user.type(screen.getByLabelText("Nome da worktree"), "teste");
    await user.click(screen.getByRole("button", { name: "criar" }));

    await waitFor(() =>
      expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({
        projectId: "p1",
        name: "teste",
        from: undefined,
      }),
    );
  });
});

describe("o nome derivado de uma issue", () => {
  it.each([
    [52, "worktree-from: cortar de uma issue", "52-worktree-from-cortar-de-uma-issue"],
    [7, "Acentuação é problema?", "7-acentuacao-e-problema"],
    [9, "   ", "9"],
  ])("issue #%s vira %s", (number, title, expected) => {
    expect(branchNameForIssue(number, title)).toBe(expected);
  });
});

describe("o que a review da PR 75 achou", () => {
  it("uma falha da consulta não é desenhada como lista vazia", async () => {
    // Antes: `host.data` ficava `undefined`, a lista caía no `empty`, e a tela
    // afirmava "nenhuma issue aberta" sobre uma leitura que não aconteceu.
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockRejectedValue(new Error("projeto p1 não existe"));
    open();

    await user.click(await screen.findByRole("button", { name: "issue" }));

    expect(await screen.findByText("projeto p1 não existe")).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma issue aberta/)).not.toBeInTheDocument();
  });

  it("a branch publicada viaja sem remoto: quem escolhe origin é o daemon", async () => {
    // `remotes[0]` é o primeiro por refname — `fork` antes de `origin` —, e o
    // daemon prefere `origin`. Mandar o remoto daqui era mandar a resposta errada.
    const user = userEvent.setup();
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "feature-a", local: false, remotes: ["fork", "origin"] }),
    ]);
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt1" });
    open();

    await user.click(screen.getByRole("button", { name: "branch" }));
    await user.click(await screen.findByRole("option", { name: /feature-a/ }));
    await user.click(screen.getByRole("button", { name: "criar" }));

    await waitFor(() =>
      expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({
        projectId: "p1",
        name: "feature-a",
        from: { kind: "branch", ref: "feature-a", local: false },
      }),
    );
  });

  it("a PR de fork diz que vem de um fork, e não que falta fetch", async () => {
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        pulls: {
          items: [
            {
              number: 42,
              title: "de um fork",
              url: "u",
              headRefName: "patch-1",
              isDraft: false,
              updatedAt: "2026-09-07T00:00:00Z",
              crossRepository: true,
              onDisk: false,
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await user.click(screen.getByRole("button", { name: "PR" }));
    const row = await screen.findByRole("option", { name: /#42/ });

    expect(row).toBeDisabled();
    expect(within(row).getByText("vem de um fork")).toBeInTheDocument();
  });
});

describe("o pedido é derivado da aba aberta", () => {
  /**
   * A aba pode **sumir debaixo da escolha**: o host responde `no-auth` numa
   * releitura, as abas de host somem, o trilho passa a desenhar `default`
   * pressionado — e a escolha anterior continua na memória. Derivar do `kind`
   * cru mandava a origem da PR enquanto a tela dizia default.
   */
  it("não manda origem nenhuma quando a aba aberta não é a da escolha", () => {
    expect(fromOf("default", { kind: "pr", number: 19 })).toBeUndefined();
    expect(fromOf("branch", { kind: "issue", number: 52 })).toBeUndefined();
  });

  it("manda a escolha quando ela é da aba aberta", () => {
    expect(fromOf("pr", { kind: "pr", number: 19 })).toEqual({ kind: "pr", number: 19 });
  });

  it("`default` nunca viaja: ausente já quer dizer isso", () => {
    expect(fromOf("default", null)).toBeUndefined();
  });
});
