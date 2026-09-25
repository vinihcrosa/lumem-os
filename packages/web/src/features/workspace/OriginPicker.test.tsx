import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OriginPicker } from "./OriginPicker.js";
import { useOriginChoice } from "./useOriginChoice.js";
import { renderWithProviders } from "../../test/render.js";
import { installTrpcDefaults, NO_HOST_ORIGINS, trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * O trilho de origem sozinho — as quatro abas, o que carrega quando, e o que
 * some sem host.
 *
 * Migrado de `CreateWorktreeDialog.test.tsx` (`033` T20): o diálogo saiu (o
 * `NewWorktreeComposerModal` liga o mesmo `OriginPicker` agora), e nada aqui
 * é sobre o diálogo — é sobre o componente que ele hospedava desde a T19.
 * O harness é só o suficiente para montar o hook: sem campo de nome, sem
 * `criar`, porque essas duas coisas já não são do `OriginPicker`.
 */
function Harness({
  onOpenExisting = vi.fn(),
  onCreated = vi.fn(),
}: {
  onOpenExisting?: (worktreeId: string) => void;
  onCreated?: (worktreeId: string) => void;
}) {
  const [suggested, setSuggested] = useState("");
  const origin = useOriginChoice("p1", { open: true, onSuggestName: setSuggested });
  return (
    <>
      <OriginPicker origin={origin} onOpenExisting={onOpenExisting} onCreated={onCreated} close={() => undefined} />
      <output data-testid="suggested">{suggested}</output>
    </>
  );
}

function open(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onOpenExisting = vi.fn();
  const onCreated = vi.fn();
  const { queryClient } = renderWithProviders(
    <Harness onOpenExisting={onOpenExisting} onCreated={onCreated} {...props} />,
  );
  return { onOpenExisting, onCreated, queryClient };
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

  it("escolher uma issue sugere o nome", async () => {
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        issues: {
          items: [{ number: 52, title: "worktree-from: cortar de uma issue" }],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await user.click(screen.getByRole("button", { name: "issue" }));
    await user.click(await screen.findByRole("option", { name: /#52/ }));

    expect(screen.getByTestId("suggested")).toHaveTextContent(
      "52-worktree-from-cortar-de-uma-issue",
    );
  });

  it("a PR cuja head não está no clone é clicável, e a nota anuncia a busca", async () => {
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        pulls: {
          items: [
            {
              number: 20,
              title: "o Codex conversa",
              headRefName: "nunca-buscada",
              onDisk: false,
              crossRepository: false,
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await userEvent.click(screen.getByRole("button", { name: "PR" }));
    const row = await screen.findByRole("option", { name: /#20/ });

    expect(row).toBeEnabled();
    expect(within(row).getByText("busca ao criar")).toBeInTheDocument();
    expect(within(row).getByText("busca ao criar")).toHaveClass("orow__note--wait");
  });

  it("a PR de fork diz de onde ela vem, e continua clicável", async () => {
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        pulls: {
          items: [
            {
              number: 42,
              title: "de um fork",
              headRefName: "patch-1",
              onDisk: false,
              crossRepository: true,
            },
          ],
          failure: null,
          readAt: null,
        },
      }),
    );
    open();

    await userEvent.click(screen.getByRole("button", { name: "PR" }));
    const row = await screen.findByRole("option", { name: /#42/ });

    expect(row).toBeEnabled();
    expect(within(row).getByText("de um fork · busca ao criar")).toBeInTheDocument();
  });
});

describe("a branch que outra worktree já tem", () => {
  it("não é escolhida: ela leva para o checkout que a ocupa", async () => {
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "pr-bar", worktreePath: "/w/pr-bar", worktreeId: "wt9", worktreeName: "pr-bar" }),
    ]);
    const { onOpenExisting } = open();

    await userEvent.click(screen.getByRole("button", { name: "branch" }));
    await userEvent.click(await screen.findByRole("option", { name: /pr-bar/ }));

    expect(onOpenExisting).toHaveBeenCalledWith("wt9");
  });

  it("quando quem ocupa é o checkout principal, ela só informa", async () => {
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "main", worktreePath: "/repo", worktreeId: null, worktreeName: null }),
    ]);
    const { onOpenExisting } = open();

    await userEvent.click(screen.getByRole("button", { name: "branch" }));
    const row = await screen.findByRole("option", { name: /main/ });
    await userEvent.click(row);

    expect(within(row).getByText("no checkout principal")).toBeInTheDocument();
    expect(onOpenExisting).not.toHaveBeenCalled();
  });
});

describe("sem host", () => {
  it("sem remoto, as abas de issue e PR não aparecem", async () => {
    trpc.worktree.hostOrigins.query.mockResolvedValue(NO_HOST_ORIGINS);
    open();

    await waitFor(() => expect(screen.getByText(/não tem remoto/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "issue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PR" })).not.toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole("button", { name: "issue" }));

    expect(screen.getByText("não deu para falar com o GitHub")).toBeInTheDocument();
  });
});

describe("o que a review da PR 75 achou", () => {
  it("uma falha da consulta não é desenhada como lista vazia", async () => {
    // Antes: `host.data` ficava `undefined`, a lista caía no `empty`, e a tela
    // afirmava "nenhuma issue aberta" sobre uma leitura que não aconteceu.
    trpc.worktree.hostOrigins.query.mockRejectedValue(new Error("projeto p1 não existe"));
    open();

    await userEvent.click(await screen.findByRole("button", { name: "issue" }));

    expect(await screen.findByText("projeto p1 não existe")).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma issue aberta/)).not.toBeInTheDocument();
  });
});

describe("onde a branch existe", () => {
  it("diz `local · origin` quando ela é as duas coisas", async () => {
    // A folha escreve as duas metades na mesma linha; o ternário descartava a
    // segunda. E `local` não é enfeite: ele decide o caminho no daemon.
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "main", local: true, remotes: ["origin"] }),
      branch({ name: "so-remota", local: false, remotes: ["origin", "fork"] }),
    ]);
    open();

    await userEvent.click(screen.getByRole("button", { name: "branch" }));

    const main = await screen.findByRole("option", { name: /main/ });
    expect(within(main).getByText("local · origin")).toBeInTheDocument();
    const remota = screen.getByRole("option", { name: /so-remota/ });
    expect(within(remota).getByText("origin · fork")).toBeInTheDocument();
  });

  it("a branch publicada viaja sem remoto: quem escolhe origin é o daemon", async () => {
    // `remotes[0]` é o primeiro por refname — `fork` antes de `origin` —, e o
    // daemon prefere `origin`. Mandar o remoto daqui era mandar a resposta
    // errada — o que este teste prova é que `local` viaja pelo `choose`
    // (a escolha, abaixo), e não um remoto específico.
    trpc.worktree.branches.query.mockResolvedValue([
      branch({ name: "feature-a", local: false, remotes: ["fork", "origin"] }),
    ]);
    const { onOpenExisting } = open();

    await userEvent.click(screen.getByRole("button", { name: "branch" }));
    const row = await screen.findByRole("option", { name: /feature-a/ });
    expect(within(row).getByText("fork · origin")).toBeInTheDocument();

    await userEvent.click(row);

    expect(onOpenExisting).not.toHaveBeenCalled();
  });
});

describe("quando a aba escolhida desaparece debaixo da escolha", () => {
  /**
   * O caminho que faltava, e é ele que tem o defeito.
   *
   * O host responde a PR na primeira leitura e `no-auth` na segunda, que é
   * token expirado ou `gh auth logout` no meio do gesto.
   */
  it("a aba de PR some, e o trilho volta a mostrar `default`", async () => {
    const user = userEvent.setup();
    trpc.worktree.hostOrigins.query.mockResolvedValueOnce(
      hostOrigins({
        pulls: {
          items: [{ number: 19, title: "a pílula de modo", headRefName: "session-mode", onDisk: true }],
          failure: null,
          readAt: null,
        },
      }),
    );
    trpc.worktree.hostOrigins.query.mockResolvedValue(
      hostOrigins({
        issues: { items: [], failure: { kind: "no-auth", message: "o gh não está autenticado" }, readAt: null },
      }),
    );

    const handles = open();
    await user.click(screen.getByRole("button", { name: "PR" }));
    await user.click(await screen.findByRole("option", { name: /#19/ }));
    expect(screen.getByTestId("suggested")).toHaveTextContent("session-mode");

    // A releitura. É o que acontece sozinho a cada remount da query.
    await act(async () => {
      await handles.queryClient.invalidateQueries();
    });

    await waitFor(() => expect(screen.queryByRole("button", { name: "PR" })).toBeNull());
    expect(screen.getByRole("button", { name: "default" })).toHaveAttribute("aria-pressed", "true");
  });
});
