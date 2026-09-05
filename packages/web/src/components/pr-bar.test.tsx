import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrCheckView, PrReason, PrStatus, PrVerdict, PullRequestView } from "@lumem/shared";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";
import { ChecksTab, checksBadge } from "./ChecksTab.js";
import { PrBar } from "./PrBar.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

/**
 * A barra, nos sete estados, e o que ela diz quando não dá para saber.
 *
 * O jsdom **não aplica folha de estilo**, então nada aqui prova cor. O que ele
 * prova é o que a classe diz — que é o canal do estado — e a palavra escrita ao
 * lado dela, que é o que faz o sinal não depender de cor.
 */

const NOW = Date.parse("2026-09-05T12:00:10Z");

function check(over: Partial<PrCheckView> = {}): PrCheckView {
  return {
    name: "lint",
    app: "GitHub Actions",
    group: "passed",
    url: "https://github.com/exemplo/repo/actions/runs/1/job/1",
    durationMs: 38_000,
    ...over,
  };
}

function pull(over: Partial<PullRequestView> = {}): PullRequestView {
  return {
    number: 19,
    url: "https://github.com/exemplo/repo/pull/19",
    title: "a barra da PR",
    verdict: "ready",
    reason: { kind: "ready", passed: 5, approvedBy: ["vinihcrosa"] },
    counts: { failed: 0, running: 0, passed: 5, skipped: 0 },
    checks: [check()],
    base: "main",
    head: "pr-bar",
    updatedAt: "2026-09-05T12:00:00Z",
    author: "vinihcrosa",
    alsoOpen: 0,
    ...over,
  };
}

function status(over: Partial<PrStatus> = {}): PrStatus {
  return {
    pull: pull(),
    failure: null,
    readAt: "2026-09-05T12:00:07Z",
    host: "github.com",
    branch: "pr-bar",
    base: "main",
    published: true,
    compareUrl: "https://github.com/exemplo/repo/compare/main...pr-bar?expand=1",
    merge: { merge: true, squash: true, rebase: false, deleteBranchOnMerge: false },
    ...over,
  };
}

function draw(over: Partial<PrStatus> = {}) {
  return renderWithProviders(
    <PrBar
      status={status(over)}
      worktreeId="wt_1"
      now={NOW}
      onRetry={() => undefined}
      onDismiss={() => undefined}
    />,
  );
}

function bar(): HTMLElement {
  return screen.getByRole("status", { name: "estado da pull request" });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("os sete estados", () => {
  const cases: Array<[string, Partial<PullRequestView> | null, string, string]> = [
    ["pronta", {}, "prbar--ready", "pronta para merge"],
    [
      "bloqueada",
      {
        verdict: "blocked" as PrVerdict,
        reason: { kind: "checks-failed", names: ["e2e (macOS)"] },
        counts: { failed: 1, running: 0, passed: 4, skipped: 0 },
      },
      "prbar--blocked",
      "1 verificação falhou",
    ],
    [
      "verificando",
      {
        verdict: "pending" as PrVerdict,
        reason: { kind: "checks-running", names: ["e2e"], running: 1, queued: 1 },
        counts: { failed: 0, running: 2, passed: 3, skipped: 0 },
      },
      "prbar--pending",
      "2 verificações rodando",
    ],
    [
      "rascunho",
      { verdict: "draft" as PrVerdict, reason: { kind: "draft", passed: 5 } },
      "prbar--none",
      "rascunho",
    ],
    [
      "mesclada",
      { verdict: "merged" as PrVerdict, reason: { kind: "merged", base: "main" } },
      "prbar--merged",
      "mesclada",
    ],
    [
      "fechada",
      { verdict: "closed" as PrVerdict, reason: { kind: "closed" } },
      "prbar--none",
      "fechada sem merge",
    ],
    ["sem PR", null, "prbar--none", "sem pull request"],
  ];

  it.each(cases)("%s", (_name, over, className, word) => {
    draw(over === null ? { pull: null } : { pull: pull(over) });

    expect(bar()).toHaveClass(className);
    // A palavra existe porque cor sozinha não é sinal acessível.
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("rascunho não é bloqueio: é `não pronto ainda`", () => {
    draw({ pull: pull({ verdict: "draft", reason: { kind: "draft", passed: 5 } }) });

    expect(bar()).not.toHaveClass("prbar--blocked");
    expect(screen.getByText(/marque como pronta/)).toBeInTheDocument();
  });

  it("mesclada diz que a worktree pode ser removida", () => {
    draw({ pull: pull({ verdict: "merged", reason: { kind: "merged", base: "main" } }) });

    expect(screen.getByText(/pode ser removida/)).toBeInTheDocument();
  });
});

describe("o motivo nomeia a causa e o culpado", () => {
  // Anotado, e sem `as const`: `as const` congela os arrays de dentro como
  // `readonly`, e `PrReason` os quer mutáveis. O vitest não faz typecheck e
  // isto passaria — foi o `gate:build` que cobrou, como já tinha cobrado antes.
  const causes: Array<[PrReason, string, string]> = [
    [{ kind: "conflict", base: "main" }, "conflito com a base", "main"],
    [{ kind: "checks-failed", names: ["e2e (macOS)"] }, "1 verificação falhou", "e2e (macOS)"],
    [{ kind: "changes-requested", by: ["joao"] }, "mudanças pedidas", "joao"],
    [{ kind: "behind", base: "release/2" }, "atrás da base", "release/2"],
  ];

  it.each(causes)("%o", (reason, word, culprit) => {
    draw({ pull: pull({ verdict: "blocked", reason }) });

    expect(screen.getByText(word)).toBeInTheDocument();
    expect(within(bar()).getByText(culprit)).toBeInTheDocument();
  });

  it("a regra da base cita o host em vez de reimplementá-la", () => {
    draw({ pull: pull({ verdict: "blocked", reason: { kind: "review-required" } }) });

    expect(screen.getByText("falta revisão")).toBeInTheDocument();
    expect(screen.getByText(/regra da base exige/)).toBeInTheDocument();
  });

  it("mais de dois checks reprovados viram `e mais N`", () => {
    // Quatro motivos empilhados não cabem em 360px, e você resolve um por vez
    // de qualquer forma.
    draw({
      pull: pull({
        verdict: "blocked",
        reason: { kind: "checks-failed", names: ["a", "b", "c", "d"] },
      }),
    });

    expect(screen.getByText(/e mais 2/)).toBeInTheDocument();
  });
});

describe("a identidade e o link", () => {
  it("a pastilha do número é UM alvo, e diz para onde leva", () => {
    draw();

    const link = screen.getByRole("link", { name: /abrir a pull request 19/ });
    expect(link).toHaveAttribute("href", "https://github.com/exemplo/repo/pull/19");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("URL recusada pela validação vira número sem link", () => {
    // §4.6: o daemon já devolveu `null`. A tela mostra a identidade e diz por
    // quê — some com o link, e não com a informação.
    draw({ pull: pull({ url: null }) });

    expect(screen.queryByRole("link", { name: /abrir a pull request/ })).not.toBeInTheDocument();
    expect(screen.getByText("#19")).toBeInTheDocument();
  });

  it("branch com mais de uma PR mostra o `+N` (Q8)", () => {
    draw({ pull: pull({ alsoOpen: 2 }) });

    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});

describe("a idade, que aparece sempre", () => {
  it("mostra a idade mesmo quando o dado é novo", () => {
    // F1.5: número que só existe no erro é número que ninguém aprende a ler.
    draw();

    expect(screen.getByText("há 3 s")).toBeInTheDocument();
  });

  it("fica âmbar quando passa do limite", () => {
    draw({ readAt: "2026-09-05T11:50:00Z" });

    expect(screen.getByText("há 10 min")).toHaveClass("prbar__fresh--stale");
  });
});

describe("quando não dá para saber", () => {
  it("sem gh: diz o que fazer, e oferece não mostrar mais", () => {
    draw({
      pull: null,
      failure: { kind: "no-binary", message: "o gh não está instalado", retryAt: null },
    });

    expect(screen.getByText("sem integração com o GitHub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "não mostrar mais" })).toBeInTheDocument();
  });

  it("sem auth: o comando de sair da situação é literal", () => {
    draw({
      pull: null,
      failure: { kind: "no-auth", message: "não autenticado", retryAt: null },
    });

    expect(screen.getByText("gh auth login")).toBeInTheDocument();
    // Login é coisa que volta sozinha depois de a pessoa agir. Dispensar seria
    // apagar a barra para sempre por um estado de cinco minutos.
    expect(screen.queryByRole("button", { name: "não mostrar mais" })).not.toBeInTheDocument();
  });

  it("host sem integração nomeia o host", () => {
    draw({
      pull: null,
      host: "gitlab.com",
      failure: { kind: "unsupported-host", message: "…", retryAt: null },
    });

    expect(screen.getByText("sem integração com gitlab.com")).toBeInTheDocument();
  });

  it("offline: verde velho continua verde, e a idade diz a verdade", () => {
    // Apagar a cor por causa da rede seria trocar uma informação verdadeira e
    // velha por nenhuma.
    draw({
      readAt: "2026-09-05T11:50:00Z",
      failure: { kind: "offline", message: "sem rede", retryAt: null },
    });

    expect(bar()).toHaveClass("prbar--ready");
    expect(screen.getByText("pronta para merge")).toBeInTheDocument();
    expect(screen.getByText("há 10 min")).toHaveClass("prbar__fresh--stale");
    expect(screen.getByText(/último que deu para ler/)).toBeInTheDocument();
  });

  it("limite de API diz o horário de volta quando o host informa", () => {
    draw({
      pull: null,
      failure: {
        kind: "rate-limit",
        message: "…",
        retryAt: "2026-09-05T15:10:00Z",
      },
    });

    expect(screen.getByText("limite do GitHub atingido")).toBeInTheDocument();
    expect(screen.getByText(/volta a consultar às/)).toBeInTheDocument();
  });

  it("branch não publicada não é `sem PR`", () => {
    // As duas são neutras, e dizer a errada manda a pessoa procurar uma PR que
    // não podia existir.
    draw({ pull: null, published: false });

    expect(screen.getByText("branch não publicada")).toBeInTheDocument();
  });

  it("`tentar de novo` aparece sempre que houve falha", async () => {
    const retry = vi.fn();
    renderWithProviders(
      <PrBar
        status={status({ pull: null, failure: { kind: "offline", message: "x", retryAt: null } })}
        worktreeId="wt_1"
        now={NOW}
        onRetry={retry}
        onDismiss={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "tentar de novo" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("as ações que saem do Lumem, e as duas que escrevem", () => {
  it("sem PR e publicada, oferece comparar no host — que não cria nada", async () => {
    draw({ pull: null });

    const link = screen.getByRole("link", { name: /comparar no GitHub/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/exemplo/repo/compare/main...pr-bar?expand=1",
    );
  });

  it("`mesclar` só existe com o veredito pronto", () => {
    draw({ pull: pull({ verdict: "blocked", reason: { kind: "review-required" } }) });
    expect(screen.queryByRole("button", { name: "mesclar" })).not.toBeInTheDocument();

    draw();
    expect(screen.getByRole("button", { name: "mesclar" })).toBeInTheDocument();
  });

  it("`mesclar` não some, mas também não mescla sem confirmação", async () => {
    draw();

    await userEvent.click(screen.getByRole("button", { name: "mesclar" }));

    // O clique abre a pergunta; ele não escreve nada.
    expect(trpcMock.pr.merge.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "mesclar a pull request" })).toBeInTheDocument();
  });

  it("a confirmação diz o número, a base e a estratégia antes de qualquer coisa", async () => {
    draw();
    await userEvent.click(screen.getByRole("button", { name: "mesclar" }));

    const dialog = screen.getByRole("dialog", { name: "mesclar a pull request" });
    expect(within(dialog).getByText(/Mesclar a #19/)).toBeInTheDocument();
    expect(within(dialog).getByText("pr-bar")).toBeInTheDocument();
    expect(within(dialog).getByText("main")).toBeInTheDocument();
  });

  it("só oferece as estratégias que o repositório permite (F7.3)", async () => {
    draw();
    await userEvent.click(screen.getByRole("button", { name: "mesclar" }));

    const dialog = screen.getByRole("dialog", { name: "mesclar a pull request" });
    expect(within(dialog).getByRole("radio", { name: "squash" })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "merge commit" })).toBeInTheDocument();
    // `rebaseMergeAllowed: false` no host.
    expect(within(dialog).queryByRole("radio", { name: "rebase" })).not.toBeInTheDocument();
  });

  it("confirmar manda a estratégia escolhida", async () => {
    trpcMock.pr.merge.mutate.mockResolvedValue({ number: 19 });
    draw();

    await userEvent.click(screen.getByRole("button", { name: "mesclar" }));
    const dialog = screen.getByRole("dialog", { name: "mesclar a pull request" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "merge commit" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "mesclar" }));

    expect(trpcMock.pr.merge.mutate).toHaveBeenCalledWith({
      worktreeId: "wt_1",
      strategy: "merge",
      deleteBranch: false,
    });
  });

  it("`abrir pull request` só existe sem PR e com a branch publicada", () => {
    draw({ pull: null, published: false });
    expect(screen.queryByRole("button", { name: "abrir pull request" })).not.toBeInTheDocument();

    draw({ pull: null });
    expect(screen.getByRole("button", { name: "abrir pull request" })).toBeInTheDocument();
  });

  it("criar PROPÕE: o título nasce do assunto do último commit (Q4, F7.6)", async () => {
    /*
     * A primeira versão deste teste afirmava o contrário — "nasce sem título" —
     * e com isso congelava a ausência da decisão como comportamento correto:
     * implementar a F7.6 quebraria o teste. A Q4 está respondida e travada, e o
     * teste tem de dizer o que ela diz.
     */
    trpcMock.pr.draft.query.mockResolvedValue({
      title: "feat: a barra da PR",
      base: "main",
      head: "pr-bar",
    });
    draw({ pull: null });
    await userEvent.click(screen.getByRole("button", { name: "abrir pull request" }));

    const dialog = screen.getByRole("dialog", { name: "abrir uma pull request" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Título")).toHaveValue("feat: a barra da PR"),
    );
    // Propõe, e não decide: dá para apagar e escrever outro.
    await userEvent.clear(within(dialog).getByLabelText("Título"));
    expect(within(dialog).getByLabelText("Título")).toHaveValue("");
    // E sem título o botão não é clicável: PR sem título é PR que alguém vai
    // ter de editar depois.
    expect(within(dialog).getByRole("button", { name: "abrir" })).toBeDisabled();
  });

  it("a proposta não sobrescreve o que já foi digitado", async () => {
    // A diferença entre `null` e `""` no estado do campo. Sem ela, uma resposta
    // do daemon que chega tarde apagaria o que a pessoa começou a escrever.
    let responder: ((value: unknown) => void) | null = null;
    trpcMock.pr.draft.query.mockReturnValue(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    draw({ pull: null });
    await userEvent.click(screen.getByRole("button", { name: "abrir pull request" }));

    const dialog = screen.getByRole("dialog", { name: "abrir uma pull request" });
    await userEvent.type(within(dialog).getByLabelText("Título"), "meu título");

    responder!({ title: "feat: do commit", base: "main", head: "pr-bar" });
    await waitFor(() => expect(trpcMock.pr.draft.query).toHaveBeenCalled());

    expect(within(dialog).getByLabelText("Título")).toHaveValue("meu título");
  });
});

describe("a aba PR", () => {
  it("o distintivo é colorido pelo pior estado", () => {
    expect(checksBadge(pull({ counts: { failed: 1, running: 2, passed: 5, skipped: 0 } }))).toEqual({
      text: "✕1",
      tone: "bad",
    });
    expect(checksBadge(pull({ counts: { failed: 0, running: 2, passed: 5, skipped: 0 } }))).toEqual({
      text: "●2",
      tone: "run",
    });
    expect(checksBadge(pull({ counts: { failed: 0, running: 0, passed: 5, skipped: 0 } }))).toEqual({
      text: "✓5",
      tone: "ok",
    });
  });

  it("agrupa, com o reprovado no topo", () => {
    // O daemon já ordenou; esta é a prova de que a tela não desfaz.
    const green = Array.from({ length: 30 }, (_, i) =>
      check({ name: `ok-${String(i)}`, group: "passed" }),
    );
    renderWithProviders(
      <ChecksTab
        pull={pull({
          checks: [check({ name: "e2e (macOS)", group: "failed" }), ...green],
          counts: { failed: 1, running: 0, passed: 30, skipped: 0 },
        })}
        readAt="2026-09-05T12:00:07Z"
        now={NOW}
      />,
    );

    const groups = screen.getAllByText(/precisa de você|passaram/);
    expect(groups[0]).toHaveTextContent("precisa de você");

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAccessibleName(/e2e \(macOS\)/);
  });

  it("cada linha tem o seu ↗, que abre AQUELA execução", () => {
    renderWithProviders(
      <ChecksTab pull={pull()} readAt="2026-09-05T12:00:07Z" now={NOW} />,
    );

    expect(screen.getByRole("link", { name: /abrir a execução de lint/ })).toHaveAttribute(
      "href",
      "https://github.com/exemplo/repo/actions/runs/1/job/1",
    );
  });

  it("verificação sem URL aparece sem link, e o motivo é dito", () => {
    renderWithProviders(
      <ChecksTab
        pull={pull({ checks: [check({ url: null })] })}
        readAt="2026-09-05T12:00:07Z"
        now={NOW}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTitle(/não é do host do projeto/)).toBeInTheDocument();
  });

  it("quem executou aparece abaixo do nome — em 360px não cabe ao lado", () => {
    renderWithProviders(
      <ChecksTab pull={pull()} readAt="2026-09-05T12:00:07Z" now={NOW} />,
    );

    expect(screen.getByText("GitHub Actions")).toHaveClass("checks__app");
  });

  it("o rodapé diz de quando é a leitura e o que a aba não faz", () => {
    renderWithProviders(
      <ChecksTab pull={pull()} readAt="2026-09-05T12:00:07Z" now={NOW} />,
    );

    expect(screen.getByText(/lido do gh há 3 s/)).toBeInTheDocument();
    expect(screen.getByText(/reexecutar se faz no navegador/)).toBeInTheDocument();
  });
});
