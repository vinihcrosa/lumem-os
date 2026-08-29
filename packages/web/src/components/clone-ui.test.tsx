import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "j1",
    workspaceId: "w1",
    url: "https://github.com/org/api.git",
    targetPath: "/estado/workspaces/pessoal/api/repo",
    name: "api",
    state: "cloning",
    phase: "receiving",
    percent: 61,
    message: "Receiving objects:  61% (100/163)",
    failure: null,
    projectId: null,
    updatedAt: 1,
    ...overrides,
  };
}

/** The subscription, driven by the test instead of by the daemon. */
function streamOf() {
  const state = { onData: undefined as ((job: unknown) => void) | undefined, unsubscribes: 0 };
  trpc.project.cloneProgress.subscribe.mockImplementation((_input, handlers) => {
    state.onData = handlers.onData;
    return {
      unsubscribe: () => {
        state.unsubscribes += 1;
      },
    };
  });
  return state;
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([
    { id: "w1", name: "pessoal", createdAt: new Date(), updatedAt: new Date() },
  ]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
  trpc.project.get.query.mockResolvedValue(null);
  trpc.worktree.listByProject.query.mockResolvedValue([]);
  trpc.project.cloneJobs.query.mockResolvedValue([]);
  trpc.project.cloneProgress.subscribe.mockReturnValue({ unsubscribe: () => {} });
});

describe("o campo que aceita as duas coisas", () => {
  it("diz o que o servidor entendeu de uma URL, e mostra o destino calculado", async () => {
    const user = userEvent.setup();
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "url",
      scheme: "ssh",
      url: "git@gitlab.com:time/api.git",
      insecure: false,
      name: "api",
      targetPath: "/estado/workspaces/pessoal/api/repo",
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho ou URL"), "git@gitlab.com:time/api.git");

    expect(await screen.findByText(/clonar via ssh/)).toBeInTheDocument();
    expect(screen.getByText("/estado/workspaces/pessoal/api/repo")).toBeInTheDocument();
    // Q14: o destino é resposta, e não um campo em que se digita.
    expect(screen.queryByLabelText("Vai em")).not.toBeInTheDocument();
  });

  it("diz sem TLS quando o transporte é http", async () => {
    const user = userEvent.setup();
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "url",
      scheme: "http",
      url: "http://git.interno/a/b.git",
      insecure: true,
      name: "b",
      targetPath: "/estado/workspaces/pessoal/b/repo",
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho ou URL"), "http://git.interno/a/b.git");

    expect(await screen.findByText("sem TLS")).toBeInTheDocument();
  });

  it("mostra o motivo da recusa e não deixa clonar", async () => {
    const user = userEvent.setup();
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "refused",
      rule: "scheme",
      message: 'o transporte "ext" não está na lista de transportes aceitos',
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho ou URL"), "ext::sh -c id");

    // `status` e não `alert`: isto chega enquanto a pessoa ainda digita.
    expect(await screen.findByText(/não está na lista/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "adicionar" })).toBeDisabled();
  });

  it("clona quando o que foi colado é URL, e registra quando é caminho", async () => {
    const user = userEvent.setup();
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "url",
      scheme: "https",
      url: "https://github.com/org/api.git",
      insecure: false,
      name: "api",
      targetPath: "/estado/workspaces/pessoal/api/repo",
    });
    trpc.project.clone.mutate.mockResolvedValue(job());

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho ou URL"), "https://github.com/org/api.git");
    await user.click(await screen.findByRole("button", { name: "clonar" }));

    await waitFor(() =>
      expect(trpc.project.clone.mutate).toHaveBeenCalledWith({
        workspaceId: "w1",
        source: "https://github.com/org/api.git",
      }),
    );
    expect(trpc.project.add.mutate).not.toHaveBeenCalled();
  });

  it("diz qual clone está rodando em vez de enfileirar em silêncio", async () => {
    // A11: um por vez.
    const user = userEvent.setup();
    trpc.project.cloneJobs.query.mockResolvedValue([job({ name: "pesado" })]);
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "url",
      scheme: "https",
      url: "https://github.com/org/outro.git",
      insecure: false,
      name: "outro",
      targetPath: "/estado/workspaces/pessoal/outro/repo",
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho ou URL"), "https://github.com/org/outro.git");

    expect(await screen.findByText(/pesado ainda está sendo clonado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "clonar" })).toBeDisabled();
  });
});

describe("o progresso na sidebar", () => {
  it("mostra a fase em português e a porcentagem", async () => {
    trpc.project.cloneJobs.query.mockResolvedValue([job()]);

    renderWithProviders(<App />);

    const row = await screen.findByLabelText("clonando api");
    expect(within(row).getByText("recebendo objetos")).toBeInTheDocument();
    expect(within(row).getByText("61%")).toBeInTheDocument();
  });

  it("acompanha o job pelo fluxo dedicado depois do primeiro render", async () => {
    const stream = streamOf();
    trpc.project.cloneJobs.query.mockResolvedValue([job({ percent: 10, phase: "counting" })]);

    renderWithProviders(<App />);
    await screen.findByLabelText("clonando api");

    stream.onData?.(job({ percent: 90, phase: "resolving" }));

    expect(await screen.findByText("resolvendo deltas")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("some com o botão de cancelar depois que o download acabou", async () => {
    // F6.6: o disco já tem o repositório e o que falta é uma linha em SQLite.
    trpc.project.cloneJobs.query.mockResolvedValue([job({ state: "registering", percent: null })]);

    renderWithProviders(<App />);

    const row = await screen.findByLabelText("clonando api");
    expect(within(row).queryByRole("button", { name: /cancelar/ })).not.toBeInTheDocument();
    expect(within(row).getByText("registrando")).toBeInTheDocument();
  });

  it("cancela pelo botão", async () => {
    const user = userEvent.setup();
    trpc.project.cloneJobs.query.mockResolvedValue([job()]);
    trpc.project.cloneCancel.mutate.mockResolvedValue({ ok: true });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "cancelar o clone de api" }));

    expect(trpc.project.cloneCancel.mutate).toHaveBeenCalledWith({ jobId: "j1" });
  });
});

describe("as falhas", () => {
  it("dá à falha de autenticação um caminho de saída", async () => {
    // F6.10. Sem isto, "não guardamos token" vira beco sem saída para quem
    // clona repositório privado por https.
    const user = userEvent.setup();
    trpc.project.cloneJobs.query.mockResolvedValue([
      job({
        state: "failed",
        failure: "auth",
        message: "fatal: Authentication failed for 'https://github.com/org/api.git/'",
      }),
    ]);
    trpc.project.parseSource.query.mockResolvedValue({
      kind: "url",
      scheme: "ssh",
      url: "git@github.com:org/api.git",
      insecure: false,
      name: "api",
      targetPath: "/estado/workspaces/pessoal/api/repo",
    });

    renderWithProviders(<App />);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("não consegui autenticar em github.com");
    expect(aviso).toHaveTextContent("ssh-agent");
    expect(aviso).toHaveTextContent("credential.helper");
    // O texto do git chega inteiro, como texto.
    expect(aviso).toHaveTextContent("Authentication failed");

    await user.click(within(aviso).getByRole("button", { name: "tentar por ssh" }));

    expect(await screen.findByLabelText("Caminho ou URL")).toHaveValue(
      "git@github.com:org/api.git",
    );
  });

  it("não oferece ssh quando não há conversão possível", async () => {
    trpc.project.cloneJobs.query.mockResolvedValue([
      job({
        url: "git@github.com:org/api.git",
        state: "failed",
        failure: "auth",
        message: "Permission denied (publickey).",
      }),
    ]);

    renderWithProviders(<App />);

    const aviso = await screen.findByRole("alert");
    expect(within(aviso).queryByRole("button", { name: "tentar por ssh" })).not.toBeInTheDocument();
  });

  it("mostra o texto do git nas demais falhas, e fica até ser dispensado", async () => {
    const user = userEvent.setup();
    trpc.project.cloneJobs.query.mockResolvedValue([
      job({
        state: "failed",
        failure: "refused",
        message: "ssh: connect to host git.interno port 22: Connection refused",
      }),
    ]);

    renderWithProviders(<App />);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Connection refused");

    await user.click(within(aviso).getByRole("button", { name: "dispensar" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("diz por extenso quando o nome foi ajustado", async () => {
    // F6.4: ajuste silencioso seria outra coisa.
    trpc.project.cloneJobs.query.mockResolvedValue([
      job({
        state: "done",
        percent: 100,
        projectId: "p1",
        message: "o nome api já existia; registrado como api-2",
      }),
    ]);

    renderWithProviders(<App />);

    expect(await screen.findByText(/registrado como api-2/)).toBeInTheDocument();
  });

  it("não diz nada quando o clone terminou sem surpresa", async () => {
    trpc.project.cloneJobs.query.mockResolvedValue([
      job({ state: "done", percent: 100, projectId: "p1", message: "done." }),
    ]);

    renderWithProviders(<App />);
    await screen.findByRole("button", { name: "adicionar projeto" });

    expect(screen.queryByLabelText("clonando api")).not.toBeInTheDocument();
    expect(screen.queryByText(/registrado como/)).not.toBeInTheDocument();
  });
});

/** A project row as `project.get` answers it. */
function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    workspaceId: "w1",
    name: "api",
    path: "/estado/workspaces/pessoal/api/repo",
    defaultBranch: "main",
    available: true,
    hasCommits: true,
    remoteUrl: "https://github.com/org/api.git",
    managed: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function openLocal(user: ReturnType<typeof userEvent.setup>, row: ReturnType<typeof project>) {
  trpc.project.listByWorkspace.query.mockResolvedValue([row]);
  trpc.project.get.query.mockResolvedValue(row);
  renderWithProviders(<App />);
  await user.click(await screen.findByRole("button", { name: new RegExp(`^${row.name}`) }));
  await screen.findByRole("heading", { name: "local" });
}

describe("a confirmação de apagar", () => {
  it("diz o caminho que vai sumir, para projeto gerenciado", async () => {
    // A tela mais perigosa das nove.
    const user = userEvent.setup();
    await openLocal(user, project());

    await user.click(screen.getByRole("button", { name: "remover projeto" }));

    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent("apagar api do disco?");
    expect(confirmacao).toHaveTextContent("apaga o diretório");
    expect(confirmacao).toHaveTextContent("/estado/workspaces/pessoal/api/repo");
    expect(trpc.project.remove.mutate).not.toHaveBeenCalled();
  });

  it("promete o contrário para projeto registrado por caminho", async () => {
    // O F2.5 continua inteiro para ele, e os dois textos têm que ser
    // distinguíveis à primeira leitura.
    const user = userEvent.setup();
    await openLocal(user, project({ managed: false, remoteUrl: null, path: "/repos/lorebase" }));

    await user.click(screen.getByRole("button", { name: "remover projeto" }));

    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent("remover api da lista?");
    expect(confirmacao).toHaveTextContent("fica exatamente onde está");
    expect(confirmacao).not.toHaveTextContent("apaga o diretório");
  });

  it("cancelar não apaga nada", async () => {
    const user = userEvent.setup();
    await openLocal(user, project());

    await user.click(screen.getByRole("button", { name: "remover projeto" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "cancelar" }),
    );

    expect(trpc.project.remove.mutate).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "local" })).toBeInTheDocument();
  });

  it("apaga quando confirmado", async () => {
    const user = userEvent.setup();
    trpc.project.remove.mutate.mockResolvedValue({ ok: true });
    await openLocal(user, project());

    await user.click(screen.getByRole("button", { name: "remover projeto" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "apagar" }),
    );

    await waitFor(() => expect(trpc.project.remove.mutate).toHaveBeenCalledWith({ id: "p1" }));
  });
});

describe("projeto sem commit", () => {
  it("explica por que ainda não corta worktree, em vez de deixar o git responder", async () => {
    // F6.13. Clonar um repositório vazio é caso legítimo (Q19), e "invalid
    // reference" não explica isso a ninguém.
    const user = userEvent.setup();
    await openLocal(user, project({ hasCommits: false }));

    const botao = screen.getByRole("button", { name: /nova worktree/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", expect.stringContaining("nenhum commit"));
  });

  it("deixa cortar assim que houver commit", async () => {
    const user = userEvent.setup();
    await openLocal(user, project({ hasCommits: true }));

    expect(screen.getByRole("button", { name: /nova worktree/ })).toBeEnabled();
  });
});
