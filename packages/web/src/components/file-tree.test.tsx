import { EditorView } from "@codemirror/view";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

const dock = {
  open: false,
  height: 256,
  toggle: () => {},
  setHeight: () => {},
  beginResize: () => {},
};

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { CheckoutFiles } = await import("./CheckoutFiles.js");
const { FileViewer } = await import("./FileViewer.js");
const { OpenFilesProvider, useOpenFiles } = await import("../hooks/useOpenFiles.js");

/** Stands in for the tab: claims to be active, and shows what it has open. */
function FakeTab() {
  const openFiles = useOpenFiles();
  useEffect(() => openFiles.setActiveTab("worktree:wt_1:context"), []);
  const open = openFiles.activeTab === null ? null : openFiles.fileFor(openFiles.activeTab);
  return <div data-testid="aba">{open === null ? "nada aberto" : open.path}</div>;
}

/**
 * The tab's split, reduced to what `ScopePanel` does with it.
 *
 * Only the tests about the open file mount this: the editor is a dynamic import
 * and a real CodeMirror, and the rest of the tree has no business paying for it.
 */
function FakeSplit() {
  const openFiles = useOpenFiles();
  const tab = openFiles.activeTab;
  const open = tab === null ? null : openFiles.fileFor(tab);
  if (tab === null || open === null || open.view !== "file") return null;
  return (
    <FileViewer scope={scope} path={open.path} active onClose={() => openFiles.close(tab)} />
  );
}

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

interface Entry {
  name: string;
  kind?: "dir" | "file" | "other";
  size?: number | null;
}

function listing(path: string, entries: Entry[], extra: Partial<{ total: number; truncated: boolean }> = {}) {
  return {
    path,
    entries: entries.map((entry) => ({
      name: entry.name,
      kind: entry.kind ?? "file",
      size: entry.size ?? null,
      symlink: false,
    })),
    total: extra.total ?? entries.length,
    truncated: extra.truncated ?? false,
  };
}

function render({ split = false } = {}) {
  return renderWithProviders(
    <OpenFilesProvider>
      <FakeTab />
      {split && <FakeSplit />}
      <CheckoutFiles scope={scope} onClose={() => {}} onResize={() => {}} dock={dock} />
    </OpenFilesProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcMock.changes.list.query.mockResolvedValue({
    ref: "worktree",
    comparedTo: "HEAD",
    baseBranch: "main",
    files: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a árvore de arquivos", () => {
  it("asks for one level and shows what came back", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "src", kind: "dir" }, { name: "README.md", size: 12 }]),
    );

    render();

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(trpcMock.files.listDir.query).toHaveBeenCalledTimes(1);
    expect(trpcMock.files.listDir.query).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: "wt_1", path: "" }),
    );
  });

  it("only reads a directory when it is expanded", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path === ""
          ? listing("", [{ name: "src", kind: "dir" }])
          : listing("src", [{ name: "loader.ts" }]),
      ),
    );

    render();
    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.queryByText("loader.ts")).not.toBeInTheDocument();

    await user.click(screen.getByText("src"));

    expect(await screen.findByText("loader.ts")).toBeInTheDocument();
  });

  it("marks a file with the status the diff reports", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(listing("", [{ name: "loader.ts" }]));
    trpcMock.changes.list.query.mockResolvedValue({
      ref: "worktree",
      comparedTo: "HEAD",
      baseBranch: "main",
      files: [
        {
          path: "loader.ts",
          oldPath: null,
          status: "modified",
          additions: 4,
          deletions: 61,
          binary: false,
        },
      ],
    });

    render();

    expect(await screen.findByTitle("modified")).toHaveTextContent("M");
    // Same query the Mudanças tab reads: one question, one answer.
    expect(trpcMock.changes.list.query).toHaveBeenCalledTimes(1);
  });

  it("says a listing was truncated, and can ask for the whole thing", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "a.txt" }], { total: 8_431, truncated: true }),
    );

    render();

    expect(await screen.findByText(/1 de 8\.?431 entradas|1 de 8431 entradas/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "listar assim mesmo" }));

    await waitFor(() =>
      expect(trpcMock.files.listDir.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 8_431 }),
      ),
    );
  });

  it("says a directory is empty instead of showing nothing at all", async () => {
    trpcMock.files.listDir.query.mockResolvedValue(listing("", []));

    render();

    expect(await screen.findByText("vazio")).toBeInTheDocument();
  });

  it("shows the daemon's refusal when the checkout is gone", async () => {
    trpcMock.files.listDir.query.mockRejectedValue(
      new Error("o checkout não está em ~/.lumem/worktrees/lorebase/ui-polish"),
    );

    render();

    expect(await screen.findByRole("alert")).toHaveTextContent(/o checkout não está em/);
  });

  it("opens the clicked file in the active tab, and marks the row", async () => {
    const user = userEvent.setup();
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "loader.ts" }, { name: "index.ts" }]),
    );

    const { container } = render();
    const row = await screen.findByText("loader.ts");
    expect(screen.getByTestId("aba")).toHaveTextContent("nada aberto");

    await user.click(row);

    // The column navigates and the tab reads: the click has to leave the tree.
    expect(screen.getByTestId("aba")).toHaveTextContent("loader.ts");
    const open = container.querySelectorAll(".frow--open");
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent("loader.ts");
  });
});

/* ------------------------------------------------------------------ CRUD */

/**
 * A checkout with two levels, `.git` visible in it, and one file per directory.
 *
 * `.git` is here on purpose: Q10 says the tree shows it and the daemon refuses
 * to write into it, and a fixture without it makes "mostra e recusa" untestable.
 */
function checkout(): void {
  trpcMock.files.listDir.query.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path === ""
        ? listing("", [
            { name: ".git", kind: "dir" },
            { name: "src", kind: "dir" },
            { name: "README.md", size: 12 },
          ])
        : path === "src"
          ? listing("src", [{ name: "lore", kind: "dir" }])
          : listing("src/lore", [{ name: "loader.ts", size: 20 }]),
    ),
  );
}

/** The `⋯` of one row. A sibling of the row's button — a button inside a button is not markup. */
function actions(path: string): HTMLElement {
  return screen.getByRole("button", { name: `ações de ${path}` });
}

/**
 * A promise the test decides when to settle.
 *
 * What several of these tests are about is *waiting*: that the rename does not
 * leave until the write has landed, that the dialog says nothing about git until
 * git answered. A mock that resolves on its own gives no instant at which to
 * assert the "not yet".
 */
interface Deferred<T> {
  promise: Promise<T>;
  settle(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function pick(name: string | RegExp): void {
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

/**
 * Types a name and commits it.
 *
 * `fireEvent.submit` and not a keystroke: in a browser Enter in a lone text
 * input submits the form on its own, and jsdom does not implement that implicit
 * submission. The form is what both the browser and this call go through.
 */
function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  const form = field.closest("form");
  if (form === null) throw new Error("o campo de nome não está dentro de um form");
  fireEvent.submit(form);
}

async function openLore(): Promise<void> {
  fireEvent.click(await screen.findByText("src"));
  fireEvent.click(await screen.findByText("lore"));
  await screen.findByText("loader.ts");
}

/**
 * Opens the confirmation and waits for the answer it is made of.
 *
 * `findByRole("dialog")` returns as soon as the card is on screen, which is
 * before `deletePreview` has said anything — every assertion about the count or
 * about git would then be reading "consultando o git…" and passing or failing
 * for reasons of timing alone.
 */
async function askToRemove(path: string): Promise<HTMLElement> {
  fireEvent.click(actions(path));
  pick("apagar");
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(within(dialog).queryByText("consultando o git…")).toBeNull());
  return dialog;
}

/** How many times a directory was listed — the reload of F4.5 is counted, not guessed. */
function listingsOf(path: string): number {
  return trpcMock.files.listDir.query.mock.calls.filter(
    (call) => (call[0] as { path: string }).path === path,
  ).length;
}

describe("criar pela árvore", () => {
  it("cria o arquivo no diretório clicado, com o nome digitado na própria linha", async () => {
    checkout();
    trpcMock.files.create.mutate.mockResolvedValue({ path: "src/lore/novo.ts" });
    render();
    await openLore();

    fireEvent.click(actions("src/lore"));
    pick("novo arquivo");

    const field = screen.getByRole("textbox", { name: "novo arquivo" });
    // F4.1: o campo nasce na indentação em que o arquivo vai ficar, que é o que
    // responde "onde isto está sendo criado" sem uma frase.
    expect(field.closest(".fedit")?.querySelector(".frow__twist")?.getAttribute("style")).toContain(
      "--depth: 2",
    );
    commit(field, "novo.ts");

    await waitFor(() =>
      expect(trpcMock.files.create.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt_1",
        path: "src/lore/novo.ts",
        kind: "file",
      }),
    );
  });

  it("cria na raiz do checkout, pelo ＋ do cabeçalho da coluna", async () => {
    checkout();
    trpcMock.files.create.mutate.mockResolvedValue({ path: "TODO.md" });
    render();
    await screen.findByText("README.md");

    // A raiz não tem linha, e portanto não tem `⋯`. Sem esta porta, `kind:
    // "create"` com `parent: ""` não nascia de gesto nenhum — e os dois ramos
    // que existem para ele eram cobertura que não estava lá.
    fireEvent.click(screen.getByRole("button", { name: "criar na raiz" }));
    pick("novo arquivo");

    const field = screen.getByRole("textbox", { name: "novo arquivo" });
    expect(field.closest(".fedit")?.querySelector(".frow__twist")?.getAttribute("style")).toContain(
      "--depth: 0",
    );
    // O caminho da raiz é o nome sozinho: nem `/TODO.md`, nem `./TODO.md`.
    expect(screen.getByText("./")).toBeInTheDocument();
    commit(field, "TODO.md");

    await waitFor(() =>
      expect(trpcMock.files.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ path: "TODO.md", kind: "file" }),
      ),
    );
  });

  it("cria uma pasta pelo mesmo campo, e diz ao daemon que é pasta", async () => {
    checkout();
    trpcMock.files.create.mutate.mockResolvedValue({ path: "src/lore/casos" });
    render();
    await openLore();

    fireEvent.click(actions("src/lore"));
    pick("nova pasta");
    commit(screen.getByRole("textbox", { name: "nova pasta" }), "casos");

    await waitFor(() =>
      expect(trpcMock.files.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ path: "src/lore/casos", kind: "dir" }),
      ),
    );
  });

  it("recarrega só o diretório afetado e a lista de mudanças (F4.5)", async () => {
    checkout();
    trpcMock.files.create.mutate.mockResolvedValue({ path: "src/lore/novo.ts" });
    render();
    await openLore();
    const rootListings = listingsOf("");
    const changeReads = trpcMock.changes.list.query.mock.calls.length;

    fireEvent.click(actions("src/lore"));
    pick("novo arquivo");
    commit(screen.getByRole("textbox", { name: "novo arquivo" }), "novo.ts");

    await waitFor(() => expect(listingsOf("src/lore")).toBe(2));
    await waitFor(() =>
      expect(trpcMock.changes.list.query.mock.calls.length).toBe(changeReads + 1),
    );
    // A raiz e `src` não mudaram, e relê-las é o "recarregar tudo" que a F4.5
    // existe para impedir — numa árvore aberta em cinco níveis isso é cinco
    // `readdir` por arquivo criado.
    expect(listingsOf("")).toBe(rootListings);
    expect(listingsOf("src")).toBe(1);
  });

  it("mostra a recusa do servidor para nome ocupado, e não sobrescreve nada", async () => {
    checkout();
    trpcMock.files.create.mutate.mockRejectedValue(
      new Error("já existe alguma coisa em src/lore/loader.ts"),
    );
    render();
    await openLore();

    fireEvent.click(actions("src/lore"));
    pick("novo arquivo");
    commit(screen.getByRole("textbox", { name: "novo arquivo" }), "loader.ts");

    // As palavras do daemon, inteiras: a tela não tem como saber o que ocupou o
    // nome, e F4.4 é justamente não sobrescrever o que estava lá.
    expect(await screen.findByText("já existe alguma coisa em src/lore/loader.ts")).toBeInTheDocument();
    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();
    // O campo continua na tela com o que foi digitado: corrigir um nome não pode
    // custar digitá-lo de novo.
    expect(screen.getByRole("textbox", { name: "novo arquivo" })).toHaveValue("loader.ts");
  });

  it("mostra o motivo de .git recusar, e continua mostrando .git na árvore (Q10)", async () => {
    checkout();
    trpcMock.files.create.mutate.mockRejectedValue(
      new Error(
        "escrita recusada em .git/x: o .git não é editável pelo Lumem — apagá-lo levaria a worktree e o trabalho não commitado junto",
      ),
    );
    render();
    await screen.findByText(".git");

    fireEvent.click(actions(".git"));
    pick("novo arquivo");
    commit(screen.getByRole("textbox", { name: "novo arquivo" }), "x");

    expect(await screen.findByText(/o .git não é editável pelo Lumem/)).toBeInTheDocument();
    // Mostrar não é permitir: a linha continua lá depois da recusa.
    expect(screen.getByText(".git")).toBeInTheDocument();
  });
});

describe("renomear pela árvore", () => {
  it("aceita caminho, porque renomear é mover (F4.2)", async () => {
    checkout();
    trpcMock.files.rename.mutate.mockResolvedValue({ path: "src/lore/loader.ts" });
    render();
    await screen.findByText("README.md");

    fireEvent.click(actions("README.md"));
    pick("renomear");

    const field = screen.getByRole("textbox", { name: "renomear" });
    // Pré-preenchido com o caminho inteiro, não com o nome: o campo aceita
    // caminho, e um campo que começa com o nome sozinho ensina o contrário.
    expect(field).toHaveValue("README.md");
    commit(field, "src/lore/loader.ts");

    await waitFor(() =>
      expect(trpcMock.files.rename.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt_1",
        from: "README.md",
        to: "src/lore/loader.ts",
      }),
    );
  });

  it("reaponta o split para o caminho que o servidor devolveu, não para o digitado", async () => {
    checkout();
    // Normalizado pelo daemon, que é o único lado que sabe normalizar: `./` some,
    // e o split tem de apontar para a chave que a árvore usa.
    trpcMock.files.rename.mutate.mockResolvedValue({ path: "src/novo.md" });
    render();
    fireEvent.click(await screen.findByText("README.md"));
    expect(screen.getByTestId("aba")).toHaveTextContent("README.md");

    fireEvent.click(actions("README.md"));
    pick("renomear");
    commit(screen.getByRole("textbox", { name: "renomear" }), "./src/novo.md");

    await waitFor(() => expect(screen.getByTestId("aba").textContent).toBe("src/novo.md"));
  });

  it("devolve o split ao arquivo de antes quando o daemon recusa", async () => {
    checkout();
    trpcMock.files.rename.mutate.mockRejectedValue(
      new Error(
        "readme.md é a mesma entrada que README.md: este filesystem não distingue maiúscula de minúscula no nome",
      ),
    );
    render();
    fireEvent.click(await screen.findByText("README.md"));

    fireEvent.click(actions("README.md"));
    pick("renomear");
    commit(screen.getByRole("textbox", { name: "renomear" }), "readme.md");

    // Q17: a recusa é do servidor, e a tela a repete inteira em vez de dizer
    // "já existe" sobre um arquivo que a árvore não mostra.
    expect(await screen.findByText(/não distingue maiúscula de minúscula/)).toBeInTheDocument();
    expect(screen.getByTestId("aba").textContent).toBe("README.md");
  });

  it("recarrega a origem e o destino quando o arquivo muda de diretório", async () => {
    checkout();
    trpcMock.files.rename.mutate.mockResolvedValue({ path: "src/lore/README.md" });
    render();
    await openLore();
    const rootListings = listingsOf("");

    fireEvent.click(actions("README.md"));
    pick("renomear");
    commit(screen.getByRole("textbox", { name: "renomear" }), "src/lore/README.md");

    await waitFor(() => expect(listingsOf("")).toBe(rootListings + 1));
    await waitFor(() => expect(listingsOf("src/lore")).toBe(2));
    // O que não foi tocado continua parado: `src` só carrega `lore`.
    expect(listingsOf("src")).toBe(1);
  });
});

describe("apagar pela árvore", () => {
  it("não apaga nada até alguém clicar em apagar", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    render();
    await screen.findByText("README.md");

    fireEvent.click(actions("README.md"));
    pick("apagar");

    // O diálogo consulta o daemon e não muda nada: `deletePreview` é query, e a
    // remoção é a mutation que só o clique dispara.
    await screen.findByRole("dialog");
    expect(trpcMock.files.deletePreview.query).toHaveBeenCalledTimes(1);
    expect(trpcMock.files.remove.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trpcMock.files.remove.mutate).not.toHaveBeenCalled();
  });

  it("nomeia o alvo e mostra o comando que o traz de volta quando o git tem cópia", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    trpcMock.files.remove.mutate.mockResolvedValue({ ok: true });
    render();
    await screen.findByText("README.md");

    const dialog = await askToRemove("README.md");
    expect(dialog).toHaveTextContent("README.md");
    expect(dialog).toHaveTextContent("git checkout -- README.md");
    // O oposto não pode aparecer junto: as duas frases se contradizem.
    expect(dialog).not.toHaveTextContent(/nada garante/);

    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));

    await waitFor(() =>
      expect(trpcMock.files.remove.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt_1",
        path: "README.md",
        recursive: false,
      }),
    );
  });

  it("não afirma que o arquivo não está no git — o daemon não sabe tanto assim (Q18)", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: false,
    });
    render();
    await screen.findByText("README.md");

    const dialog = await askToRemove("README.md");
    // `tracked: false` é "o git não tem cópia **ou** não conseguiu responder": o
    // `.catch` de `isTracked` engole as duas. A tela erra para o lado do medo e
    // não promete uma recuperação, mas também não afirma a ausência.
    expect(dialog).toHaveTextContent(/não conseguiu confirmar|não confirmou/);
    expect(dialog).not.toHaveTextContent("git checkout --");
  });

  it("manda recursive para pasta, que é o que o servidor exige", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "dir",
      path: "src/lore",
      files: 12,
      dirs: 3,
      untracked: 9,
      truncated: false,
    });
    trpcMock.files.remove.mutate.mockResolvedValue({ ok: true });
    render();
    await openLore();

    const dialog = await askToRemove("src/lore");
    // A contagem é estruturada e vem do preview — nunca de ler a mensagem de
    // recusa do servidor, que é texto para humano.
    expect(dialog).toHaveTextContent("12 arquivos e 3 pastas");
    expect(dialog).toHaveTextContent("9");
    // O rótulo inteiro, e não `/^apagar/`: os 15 são `files + dirs`, e tanto
    // trocar isso por `files` quanto extrair o número de `edits.refusal` com um
    // `\d+` passavam pelo prefixo — o segundo sendo a negação literal de "a
    // contagem estruturada vem do preview, nunca de parse da mensagem".
    fireEvent.click(within(dialog).getByRole("button", { name: "apagar as 15 entradas" }));

    await waitFor(() =>
      expect(trpcMock.files.remove.mutate).toHaveBeenCalledWith(
        // Sem `recursive: true` o daemon recusa com BLOCKED, e a confirmação
        // que a pessoa acabou de dar não vira nada.
        expect.objectContaining({ path: "src/lore", recursive: true }),
      ),
    );
  });

  it("diz que a contagem é piso quando o servidor truncou", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "dir",
      path: "src/lore",
      files: 2_000,
      dirs: 137,
      untracked: 1_998,
      truncated: true,
    });
    render();
    await openLore();

    // O servidor pagou uma caminhada com teto para poder dizer "parei": mostrar
    // o número como total é a mentira que a F5.7 existe para impedir.
    const dialog = await askToRemove("src/lore");
    expect(dialog).toHaveTextContent(/pelo menos/);
    expect(dialog).toHaveTextContent("2.000");
    // O botão também é piso, e com o rótulo inteiro: 2.000 + 137.
    expect(
      within(dialog).getByRole("button", { name: "apagar pelo menos 2.137 entradas" }),
    ).toBeInTheDocument();
  });

  it("não promete recuperação quando a contagem parou no teto", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "dir",
      path: "src/lore",
      files: 2_000,
      dirs: 137,
      // Zero não-rastreados **do que deu para ver**, que é outra coisa. E é o
      // caso provável: o teto existe por causa de `node_modules`, que é não
      // rastreado por definição — a pasta que trunca é justamente aquela em que
      // "o git tem cópia de tudo" seria mais errado. A Q18 escolheu errar para
      // o lado do medo; prometer aqui erra para o lado oposto.
      untracked: 0,
      truncated: true,
    });
    render();
    await openLore();

    const dialog = await askToRemove("src/lore");
    expect(dialog).toHaveTextContent(/A contagem parou no teto/);
    expect(dialog).not.toHaveTextContent(/git checkout/);
    expect(dialog).not.toHaveTextContent(/o git tem cópia/);
  });

  it("diz que está consultando o git antes de dizer qualquer coisa sobre o git", async () => {
    checkout();
    const answer = deferred<{ kind: "file"; path: string; tracked: boolean }>();
    trpcMock.files.deletePreview.query.mockReturnValue(answer.promise);
    render();
    await screen.findByText("README.md");

    fireEvent.click(actions("README.md"));
    pick("apagar");

    const dialog = await screen.findByRole("dialog");
    // A guarda que o próprio `askToRemove` espera sumir. Sem ela o `waitFor`
    // casa de primeira e os testes de apagar passam a correr contra um diálogo
    // que ainda não sabe nada — "guarda que não guarda".
    expect(within(dialog).getByText("consultando o git…")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/git checkout|não confirmou|nada garante/);
    // Sem contagem no botão enquanto não há contagem.
    expect(within(dialog).getByRole("button", { name: "apagar" })).toBeInTheDocument();

    answer.settle({ kind: "file", path: "README.md", tracked: true });

    expect(await within(dialog).findByText(/git checkout -- README\.md/)).toBeInTheDocument();
  });

  it("diz que não deu para consultar o git, em vez de calar sobre o que volta", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockRejectedValue(new Error("git não respondeu em 2 s"));
    render();
    await screen.findByText("README.md");

    fireEvent.click(actions("README.md"));
    pick("apagar");

    // Um ramo de diálogo destrutivo que nenhum caso exercia: o preview pode
    // falhar, e o silêncio ali lê como "está tudo verificado".
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/não deu para consultar o git/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("git não respondeu em 2 s");
    expect(dialog).not.toHaveTextContent(/git checkout/);
  });

  it("tira o título do preview, e não do palpite que a listagem fez", async () => {
    // `listDir` classifica link-para-diretório como `dir`, pelo `stat` do alvo;
    // `deletePreview` faz `lstat` da entrada e responde `file`, corretamente,
    // porque `remove` desliga **uma entrada só**. Duas fontes para o mesmo fato,
    // e o título ficava com a mais fraca enquanto o corpo já mostrava a outra.
    trpcMock.files.listDir.query.mockResolvedValue(
      listing("", [{ name: "atalho", kind: "dir" }]),
    );
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "atalho",
      tracked: true,
    });
    render();
    await screen.findByText("atalho");

    const dialog = await askToRemove("atalho");
    expect(dialog).toHaveTextContent("apagar este arquivo?");
    expect(dialog).not.toHaveTextContent("e o que tem dentro");
  });

  it("devolve o split ao arquivo de antes quando o daemon recusa apagar", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    trpcMock.files.remove.mutate.mockRejectedValue(
      new Error("README.md não está mais no checkout"),
    );
    render();
    fireEvent.click(await screen.findByText("README.md"));
    expect(screen.getByTestId("aba")).toHaveTextContent("README.md");

    await askToRemove("README.md");
    fireEvent.click(screen.getByRole("button", { name: "apagar" }));

    // O gêmeo do rename tinha este teste; apagar não. Sem ele, uma recusa deixa
    // o arquivo no disco e o split fechado — o texto que o descarregamento
    // acabou de gravar sai da tela sem ninguém dizer nada.
    expect(await screen.findByText("README.md não está mais no checkout")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("aba")).toHaveTextContent("README.md"));
  });

  it("não diz piso quando a contagem é inteira", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "dir",
      path: "src/lore",
      files: 12,
      dirs: 3,
      untracked: 0,
      truncated: false,
    });
    render();
    await openLore();

    // O par do teste acima: sem ele, "pelo menos" em toda pasta passaria igual.
    const dialog = await askToRemove("src/lore");
    expect(dialog).not.toHaveTextContent(/pelo menos/);
    expect(dialog).toHaveTextContent("12 arquivos e 3 pastas");
  });

  it("não mostra o veredito velho enquanto o novo não chega", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: false,
    });
    render();
    await screen.findByText("README.md");

    await askToRemove("README.md");
    fireEvent.click(screen.getByRole("button", { name: "cancelar" }));

    // Um macrotask entre fechar e reabrir, e é ele que dá sentido ao teste: o
    // gc do react-query roda num timer, e fechar e reabrir no mesmo tick passa
    // com ou sem `gcTime: 0`. O que a linha compra não é refazer o fetch — o
    // `staleTime` 0 já faz isso — é a resposta velha não aparecer no intervalo.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Um `git add` entre as duas aberturas muda a resposta, e uma pergunta
    // servida do cache descreveria um repositório que não existe mais.
    const second = deferred<{ kind: "file"; path: string; tracked: boolean }>();
    trpcMock.files.deletePreview.query.mockReturnValue(second.promise);
    fireEvent.click(actions("README.md"));
    pick("apagar");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("consultando o git…")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/não confirmou/);

    second.settle({ kind: "file", path: "README.md", tracked: true });

    expect(await screen.findByText(/git checkout -- README\.md/)).toBeInTheDocument();
    expect(trpcMock.files.deletePreview.query).toHaveBeenCalledTimes(2);
  });

  it("mostra a recusa do daemon inteira, sem inventar uma terceira frase (Q12)", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: false,
    });
    trpcMock.files.remove.mutate.mockRejectedValue(
      new Error("README.md não está mais no checkout"),
    );
    render();
    await screen.findByText("README.md");

    await askToRemove("README.md");
    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));

    // Leitura e escrita descrevem o mesmo estado de disco com códigos
    // diferentes (NOT_FOUND e BLOCKED). A tela repete a frase que chegou.
    expect(await screen.findByText("README.md não está mais no checkout")).toBeInTheDocument();
  });

  it("fecha o split ao apagar o arquivo que ele mostra (F4.6)", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    trpcMock.files.remove.mutate.mockResolvedValue({ ok: true });
    render();
    fireEvent.click(await screen.findByText("README.md"));
    expect(screen.getByTestId("aba")).toHaveTextContent("README.md");

    await askToRemove("README.md");
    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));

    // Um caminho que deixou de existir não vira tela de erro: o arquivo some do
    // split e a coluna continua onde estava.
    await waitFor(() => expect(screen.getByTestId("aba")).toHaveTextContent("nada aberto"));
  });

  it("fecha o split também quando quem some é a pasta acima dele", async () => {
    checkout();
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "dir",
      path: "src/lore",
      files: 1,
      dirs: 0,
      untracked: 0,
      truncated: false,
    });
    trpcMock.files.remove.mutate.mockResolvedValue({ ok: true });
    render();
    await openLore();
    fireEvent.click(screen.getByText("loader.ts"));
    expect(screen.getByTestId("aba")).toHaveTextContent("src/lore/loader.ts");

    await askToRemove("src/lore");
    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));

    await waitFor(() => expect(screen.getByTestId("aba")).toHaveTextContent("nada aberto"));
  });
});

describe("o buffer do arquivo aberto", () => {
  const TEXT = "const a = 1;\n";

  beforeEach(() => {
    trpcMock.files.read.query.mockResolvedValue({
      kind: "text",
      path: "README.md",
      bytes: TEXT.length,
      lines: 1,
      text: TEXT,
      revision: "sha256:um",
      readOnly: null,
    });
    trpcMock.files.write.mutate.mockResolvedValue({ ok: true, revision: "sha256:dois" });
  });

  /** Types through the editor's own transaction path — P18: a click places no caret here. */
  function typeInto(container: HTMLElement, insert: string): void {
    const dom = container.querySelector<HTMLElement>(".cm-editor");
    const view = dom === null ? null : EditorView.findFromDOM(dom);
    if (view === null) throw new Error("nenhum editor montado");
    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert } });
    });
  }

  async function openFile(): Promise<HTMLElement> {
    checkout();
    const { container } = render({ split: true });
    fireEvent.click(await screen.findByText("README.md"));
    await waitFor(() => expect(container.querySelector(".cm-content")).not.toBeNull());
    return container;
  }

  /** Lets every pending microtask run without letting the 800 ms debounce win. */
  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("espera a gravação **chegar** antes de renomear, não só sair na frente", async () => {
    const landing = deferred<{ ok: true; revision: string }>();
    trpcMock.files.write.mutate.mockReturnValue(landing.promise);
    trpcMock.files.rename.mutate.mockResolvedValue({ path: "docs/README.md" });
    const container = await openFile();
    // O relógio falso entra depois do editor montar, e é o que garante que os
    // 800 ms do autosave não vencem sozinhos no meio do gesto: a gravação que
    // este teste vê só pode ter vindo do descarregamento.
    vi.useFakeTimers();
    typeInto(container, "!");
    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();

    fireEvent.click(actions("README.md"));
    pick("renomear");
    commit(screen.getByRole("textbox", { name: "renomear" }), "docs/README.md");
    await settle();

    // O texto sai, e sai no caminho antigo — o único que ainda existe.
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "README.md", text: `${TEXT}!` }),
    );
    // E o rename **não** sai junto. Emitir na frente não é chegar na frente: o
    // `httpBatchLink` junta duas chamadas do mesmo macrotask numa requisição só
    // e o servidor as começa com `Promise.all`. Se o rename ganhasse, a
    // gravação voltaria NOT_FOUND para um componente já desmontado e o texto
    // sumiria sem uma palavra; se perdesse por pouco, o `rename` final da
    // escrita atômica recriaria o caminho antigo e o arquivo ficaria nos dois.
    expect(trpcMock.files.rename.mutate).not.toHaveBeenCalled();

    landing.settle({ ok: true, revision: "sha256:dois" });
    await settle();

    expect(trpcMock.files.rename.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "README.md", to: "docs/README.md" }),
    );
  });

  it("espera a gravação chegar antes de apagar", async () => {
    const landing = deferred<{ ok: true; revision: string }>();
    trpcMock.files.write.mutate.mockReturnValue(landing.promise);
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    trpcMock.files.remove.mutate.mockResolvedValue({ ok: true });
    const container = await openFile();
    await askToRemove("README.md");

    vi.useFakeTimers();
    typeInto(container, "!");
    fireEvent.click(screen.getByRole("button", { name: "apagar" }));
    await settle();

    // Apagar destrói o texto digitado de qualquer jeito — o servidor recusa a
    // gravação com NOT_FOUND se ela chegar depois. O que não pode acontecer é a
    // ordem inversa passar despercebida: aqui a gravação sai primeiro, e quem
    // apaga é a pessoa que leu o nome do arquivo no diálogo.
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "README.md", text: `${TEXT}!` }),
    );
    expect(trpcMock.files.remove.mutate).not.toHaveBeenCalled();

    landing.settle({ ok: true, revision: "sha256:dois" });
    await settle();

    expect(trpcMock.files.remove.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "README.md", recursive: false }),
    );
  });
});
