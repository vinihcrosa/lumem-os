import { EditorView } from "@codemirror/view";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock } from "../test/trpc-mock.js";

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
      <CheckoutFiles scope={scope} onClose={() => {}} onResize={() => {}} />
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

    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));

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

  it("consulta o preview de novo a cada abertura, porque o índice do git anda", async () => {
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

    // Um `git add` entre as duas aberturas muda a resposta, e uma pergunta
    // servida do cache descreveria um repositório que não existe mais.
    trpcMock.files.deletePreview.query.mockResolvedValue({
      kind: "file",
      path: "README.md",
      tracked: true,
    });
    fireEvent.click(actions("README.md"));
    pick("apagar");

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

  it("descarrega o que foi digitado antes de renomear, e no caminho antigo", async () => {
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "README.md", text: `${TEXT}!` }),
    );
    // A ordem é a propriedade: o texto vai para o disco **antes** de o arquivo
    // sair do lugar, e por isso o rename leva o que foi digitado junto. Trocada,
    // a gravação cai num caminho que já não existe, volta NOT_FOUND para um
    // componente desmontado, e o texto some sem ninguém ver.
    const wrote = trpcMock.files.write.mutate.mock.invocationCallOrder[0] ?? 0;
    const renamed = trpcMock.files.rename.mutate.mock.invocationCallOrder[0] ?? 0;
    expect(wrote).toBeGreaterThan(0);
    expect(renamed).toBeGreaterThan(wrote);
  });

  it("descarrega o que foi digitado antes de apagar", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /^apagar/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Apagar destrói o texto digitado de qualquer jeito — o servidor recusa a
    // gravação com NOT_FOUND se ela chegar depois. O que não pode acontecer é a
    // ordem inversa passar despercebida: aqui a gravação sai primeiro, e quem
    // apaga é a pessoa que leu o nome do arquivo no diálogo.
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "README.md", text: `${TEXT}!` }),
    );
    const wrote = trpcMock.files.write.mutate.mock.invocationCallOrder[0] ?? 0;
    const removed = trpcMock.files.remove.mutate.mock.invocationCallOrder[0] ?? 0;
    expect(removed).toBeGreaterThan(wrote);
  });
});
