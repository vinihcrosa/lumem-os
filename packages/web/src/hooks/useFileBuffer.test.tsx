import { EditorView } from "@codemirror/view";
import { focusManager, QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "../lib/queryClient.js";
import { changesKey, fileListKey, fileReadKey } from "../lib/queryKeys.js";
import { trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

const { FileViewer } = await import("../components/FileViewer.js");
const { AUTOSAVE_DEBOUNCE_MS, lineDelta } = await import("./useFileBuffer.js");
const { invalidateFor } = await import("./useLiveState.js");

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;
const FILE = "src/lore/loader.ts";
const TEXT = "const a = 1;\nconst b = 2;";

function textFile(over: Record<string, unknown> = {}) {
  return {
    kind: "text",
    path: FILE,
    bytes: 24,
    lines: 2,
    text: TEXT,
    revision: "sha256:um",
    readOnly: null,
    ...over,
  };
}

/**
 * The shell around the file, reduced to the two decisions it makes about it.
 *
 * `active` is what `ScopePanel` knows and the viewer cannot see on its own —
 * every session tab stays mounted, so the tab going behind another one is a
 * prop and not an unmount. `tabOpen` and the ✕ are the two ways the subtree
 * goes away. Between them these are the five unloading triggers of F2.2.
 */
function Harness({ active = true, tabOpen = true, path = FILE }) {
  const [split, setSplit] = useState(true);

  if (!tabOpen) return <div>aba fechada</div>;
  if (!split) return <div>split fechado</div>;

  return <FileViewer scope={scope} path={path} active={active} onClose={() => setSplit(false)} />;
}

interface Rendered extends RenderResult {
  client: QueryClient;
  /**
   * Renders again over the *same* cache.
   *
   * Handing `rerender` a fresh client would empty the read and take the editor
   * off the screen with it — which flushes, and would make a test about
   * switching tabs pass through the unmount it was written to avoid.
   */
  show(next: ReactElement): Promise<void>;
}

function renderFile(ui: ReactElement): Rendered {
  const client = createQueryClient();
  const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

  return {
    client,
    ...view,
    show: async (next) => {
      await act(async () => {
        view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>);
      });
    },
  };
}

/** Nothing is on screen before the dynamic import of the editor lands. */
async function editor(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector(".cm-content")).not.toBeNull());
  return container.querySelector(".cm-content") as HTMLElement;
}

/**
 * The buffer, read without waiting.
 *
 * Every test past `openTyping` runs on a fake clock, and testing-library's own
 * `waitFor` polls with a `setTimeout` that nothing is advancing — it hangs
 * instead of failing. The editor is already mounted by then, so there is
 * nothing to wait for.
 */
function shown(container: HTMLElement): string {
  const content = container.querySelector(".cm-content");
  if (content === null) throw new Error("nenhum editor montado");
  return content.textContent ?? "";
}

/**
 * Types at the end of the buffer, through the editor's own transaction path.
 *
 * Not `userEvent.type`: P18 says the `getClientRects` stub in `setup.ts`
 * answers `[]`, so everything that needs a coordinate — placing the caret with
 * a click above all — is a silent no-op here. A transaction is what a keystroke
 * becomes anyway, and it is the seam the autosave listens on. That a physical
 * key reaches CodeMirror is a browser's job, and E12 is where it is proved.
 */
function typeInto(container: HTMLElement, insert: string): void {
  const dom = container.querySelector<HTMLElement>(".cm-editor");
  const view = dom === null ? null : EditorView.findFromDOM(dom);
  if (view === null) throw new Error("nenhum editor montado");
  act(() => {
    view.dispatch({ changes: { from: view.state.doc.length, insert } });
  });
}

/** Opens the file, waits for the editor, and hands the clock over to the test. */
async function openTyping(ui: ReactElement = <Harness />): Promise<Rendered> {
  const rendered = renderFile(ui);
  await editor(rendered.container);
  vi.useFakeTimers();
  return rendered;
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Lets a cache change reach the screen.
 *
 * react-query batches what it tells its observers through a `setTimeout(0)`,
 * so on a fake clock the cache moves and nothing renders. Every assertion
 * about what a refetch did — or did not — put on screen has to go through
 * here, or it passes for the wrong reason.
 */
async function settle(run: () => Promise<void> | void): Promise<void> {
  await act(async () => {
    await run();
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function debounce(): Promise<void> {
  await tick(AUTOSAVE_DEBOUNCE_MS);
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcMock.files.read.query.mockResolvedValue(textFile());
  trpcMock.files.write.mutate.mockResolvedValue({ ok: true, revision: "sha256:dois" });
});

afterEach(() => {
  vi.useRealTimers();
  // Global to the library, so a test that took the window's focus away has to
  // give it back before the next one renders anything.
  focusManager.setFocused(undefined);
});

describe("o autosave", () => {
  it("grava sozinho depois que a digitação para", async () => {
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith({
      scopeType: "worktree",
      scopeId: "wt_1",
      path: FILE,
      text: `${TEXT}!`,
      baseRevision: "sha256:um",
    });
  });

  it("espera os 800 ms inteiros, e a frase inteira vira uma gravação só", async () => {
    // Debounce e não throttle: quem escreve uma frase digita com 100–300 ms
    // entre teclas (Q8), e cada palavra virando uma gravação é um `git status`
    // no checkout que o agente está usando.
    const { container } = await openTyping();

    typeInto(container, "u");
    await tick(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();

    typeInto(container, "m");
    await tick(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();

    await tick(1);
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}um` }),
    );
  });

  it("espera 800 ms, e o número está escrito aqui e não lido da constante", async () => {
    // Todo o resto do arquivo mede o debounce por `AUTOSAVE_DEBOUNCE_MS`, então
    // trocar a constante por 1 passa em tudo — e a decisão da Q8 não estaria em
    // teste nenhum. Um lugar tem de fixar o número.
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(800);
    const { container } = await openTyping();

    typeInto(container, "!");
    await tick(799);
    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();

    await tick(1);
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);
  });

  it("manda os bytes que o arquivo tinha, não os que o editor guarda", async () => {
    // A7/Q6: um arquivo CRLF entra no CodeMirror como LF. Gravar `doc.toString()`
    // reescreveria todas as linhas do arquivo na primeira parada de digitação.
    trpcMock.files.read.query.mockResolvedValue(
      textFile({ text: "um\r\ndois\r\n", bytes: 10, lines: 2 }),
    );
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "um\r\ndois\r\n!" }),
    );
  });

  it("usa a revisão devolvida como base da gravação seguinte", async () => {
    // Sem esta linha a segunda parada de digitação volta `stale` contra a
    // própria escrita anterior: conflito falso a cada duas pausas, e o
    // diagnóstico cairia na tela de conflito, longe da causa.
    const { container } = await openTyping();

    typeInto(container, "a");
    await debounce();
    typeInto(container, "b");
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(2);
    expect(trpcMock.files.write.mutate.mock.calls[1]?.[0]).toMatchObject({
      baseRevision: "sha256:dois",
      text: `${TEXT}ab`,
    });
  });

  it("encadeia a revisão também para o que foi digitado durante a gravação", async () => {
    // O teste acima é sequencial: quando a primeira escrita volta, a vaga já
    // esvaziou e o reencadeamento nunca roda. O caso é a digitação que chega
    // com uma gravação **em voo** — sem ele a segunda sai contra a revisão
    // anterior à primeira, volta `stale`, e a tela de conflito acusa o agente
    // de uma edição que foi do próprio cliente.
    let land = (_result: unknown): void => {};
    trpcMock.files.write.mutate.mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    const { container } = await openTyping();

    typeInto(container, "a");
    await debounce();
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);

    typeInto(container, "b");
    await debounce();
    // Ainda uma só: a segunda está enfileirada porque a primeira não voltou.
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      land({ ok: true, revision: "sha256:dois" });
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(2);
    expect(trpcMock.files.write.mutate.mock.calls[1]?.[0]).toMatchObject({
      baseRevision: "sha256:dois",
      text: `${TEXT}ab`,
    });
  });

  it("diz salvando e depois salvo, contando desde quando", async () => {
    let land = (_result: unknown): void => {};
    trpcMock.files.write.mutate.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();
    expect(screen.getByText("salvando…")).toBeInTheDocument();

    await act(async () => {
      land({ ok: true, revision: "sha256:dois" });
    });
    expect(screen.getByText("salvo há 0 s")).toBeInTheDocument();

    await tick(3_000);
    expect(screen.getByText("salvo há 3 s")).toBeInTheDocument();
  });

  it("grava só o que mudou de fato, e não a cada render", async () => {
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await debounce();
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);
  });
});

describe("os dois caminhos de falha", () => {
  it("mostra o motivo do daemon quando a gravação estoura", async () => {
    trpcMock.files.write.mutate.mockRejectedValue(
      new Error("EACCES: permission denied, open 'src/lore/loader.ts'"),
    );
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();

    await vi.waitFor(() => expect(screen.getByText("não deu para salvar")).toBeInTheDocument());
    expect(screen.getByText(/EACCES: permission denied/)).toBeInTheDocument();
  });

  it("lê também a recusa que vem como resultado, não como exceção", async () => {
    // O conflito é `ok: false` (D3.1), não `TRPCError`. Um rodapé que só olhe o
    // `catch` fica mudo exatamente no caso que a feature existe para tratar.
    trpcMock.files.write.mutate.mockResolvedValue({
      ok: false,
      reason: "stale",
      revision: "sha256:disco",
      changedAt: Date.now(),
    });
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();

    await vi.waitFor(() => expect(screen.getByText("mudou no disco")).toBeInTheDocument());
  });

  it("não descarta o buffer quando a gravação falha, e a digitação seguinte tenta de novo", async () => {
    trpcMock.files.write.mutate.mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText("não deu para salvar")).toBeInTheDocument());

    // F2.4: o texto continua na tela — é o único lugar onde ele existe.
    expect(shown(container)).toContain("const b = 2;!");

    typeInto(container, "?");
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(2);
    expect(trpcMock.files.write.mutate.mock.calls[1]?.[0]).toMatchObject({ text: `${TEXT}!?` });
  });

  it("tenta de novo pelo botão do rodapé, sem esperar a próxima tecla", async () => {
    // O beco sem saída que o botão fecha: falhar e parar de digitar não tem
    // outra saída — todo o resto do autosave é disparado por tecla ou por
    // sumiço de tela, e quem acabou de perder uma gravação faz nem um nem outro.
    trpcMock.files.write.mutate.mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText("não deu para salvar")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "tentar de novo" }));
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(2);
    expect(trpcMock.files.write.mutate.mock.calls[1]?.[0]).toMatchObject({ text: `${TEXT}!` });
    expect(screen.getByText(/^salvo há/)).toBeInTheDocument();
  });

  it("não conta uma falha como salvo: sair da tela tenta de novo", async () => {
    // O outro lado do F2.4, e o que separa "o texto continua na tela" de "o
    // texto continua por gravar": marcar o buffer como salvo depois de uma
    // falha some com ele no primeiro gatilho de descarregamento, calado.
    trpcMock.files.write.mutate.mockRejectedValue(new Error("EROFS: read-only file system"));
    const { container, unmount } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText("não deu para salvar")).toBeInTheDocument());

    await act(async () => {
      unmount();
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(2);
    expect(trpcMock.files.write.mutate.mock.calls[1]?.[0]).toMatchObject({ text: `${TEXT}!` });
  });

  it("para de gravar diante do stale, até alguém escolher", async () => {
    trpcMock.files.write.mutate.mockResolvedValue({
      ok: false,
      reason: "stale",
      revision: "sha256:disco",
      changedAt: Date.now(),
    });
    const { container } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText("mudou no disco")).toBeInTheDocument());

    typeInto(container, "?");
    await debounce();
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);
  });
});

/*
 * Os cinco gatilhos de descarregamento (F2.2).
 *
 * Três deles — fechar o split, fechar a aba e desmontar — são o mesmo mecanismo
 * visto de três gestos: o editor sai da árvore e o handle se desprende. Estão
 * separados porque os gestos são separados, e porque o caminho de cada um até o
 * desmonte é diferente: o ✕ passa por `onClose`, a aba some por fora, e o
 * desmonte é o piso dos dois. Os outros dois não desmontam nada.
 */
describe("descarregar o pendente antes de sumir da tela", () => {
  it("grava ao trocar de aba de sessão", async () => {
    const { container, show } = await openTyping();
    typeInto(container, "!");

    await show(<Harness active={false} />);

    // O editor continua montado — toda aba de sessão continua montada —, então
    // isto não pode ter passado por um desmonte.
    expect(container.querySelector(".cm-content")).not.toBeNull();
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}!`, path: FILE }),
    );
  });

  it("grava ao fechar o split pelo ✕", async () => {
    const { container } = await openTyping();
    typeInto(container, "!");

    // `fireEvent` and not `userEvent`: the clock is fake from `openTyping` on,
    // and user-event's own waiting hangs against a clock nobody is advancing.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "✕ fechar" }));
    });

    expect(screen.getByText("split fechado")).toBeInTheDocument();
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}!` }),
    );
  });

  it("grava ao fechar a aba", async () => {
    const { container, show } = await openTyping();
    typeInto(container, "!");

    await show(<Harness tabOpen={false} />);

    expect(screen.getByText("aba fechada")).toBeInTheDocument();
    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}!` }),
    );
  });

  it("grava ao perder o foco da janela", async () => {
    const { container } = await openTyping();
    typeInto(container, "!");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}!` }),
    );
  });

  it("grava ao desmontar", async () => {
    const { container, unmount } = await openTyping();
    typeInto(container, "!");

    await act(async () => {
      unmount();
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${TEXT}!` }),
    );
  });

  it("não grava nada quando ninguém digitou", async () => {
    // Sem esta, "descarregar" pode ser "gravar sempre" — e todo arquivo que
    // alguém só abriu para ler viraria uma escrita no checkout do agente.
    const { unmount } = await openTyping();

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      unmount();
    });

    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();
  });

  it("não regrava o que já foi salvo, nem a cada blur nem ao sair da tela", async () => {
    // A guarda que a de cima parece cobrir é outra: lá o buffer nunca teve
    // dono. Este é o caso oposto — digitou, salvou, e **agora** sai da tela.
    // Sem ela, cada perda de foco vira uma gravação idêntica no checkout do
    // agente: `rename` por cima do arquivo, inode novo (uid/gid e xattrs
    // perdidos, P16) e um `git status` a cada troca de janela. É o custo que a
    // Q8 argumenta que o debounce existe para não pagar, entrando por outra porta.
    const { container, unmount } = await openTyping();

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText(/^salvo há/)).toBeInTheDocument());
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
    });
    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);
  });

  it("não grava um arquivo que abriu somente leitura", async () => {
    trpcMock.files.read.query.mockResolvedValue(textFile({ readOnly: "inside-git" }));
    const { unmount } = await openTyping();

    await act(async () => {
      unmount();
    });

    expect(trpcMock.files.write.mutate).not.toHaveBeenCalled();
  });
});

/*
 * Trocar de arquivo no mesmo split, com uma gravação ainda em voo.
 *
 * As duas guardas de `sameTarget` no retorno da escrita só existem para esta
 * janela: o arquivo que a resposta é sobre já não é o que está na tela. Nenhum
 * outro teste do lote troca o `path`, então sem estes dois casos as duas linhas
 * podem ser apagadas com a suíte inteira verde.
 */
const OUTRO = "src/lore/outro.ts";

/** Abre A, digita, segura a gravação em voo, e põe B na tela. */
async function switchWhileWriting(): Promise<{
  rendered: Rendered;
  land: (result: unknown) => void;
}> {
  trpcMock.files.read.query.mockImplementation((input: { path: string }) =>
    Promise.resolve(
      input.path === FILE
        ? textFile()
        : textFile({ path: OUTRO, text: "outro", revision: "sha256:doOutro", lines: 1 }),
    ),
  );
  let land: (result: unknown) => void = () => {};
  trpcMock.files.write.mutate.mockReturnValueOnce(
    new Promise((resolve) => {
      land = resolve;
    }),
  );
  const rendered = await openTyping();

  typeInto(rendered.container, "!");
  await debounce();
  expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(1);

  await rendered.show(<Harness path={OUTRO} />);
  // O editor de B monta por `import()` e a leitura dele volta pelo cache: os
  // dois são microtarefas, e nada acontece antes de o relógio falso andar.
  await settle(() => {});
  expect(shown(rendered.container)).toContain("outro");
  return { rendered, land };
}

describe("trocar de arquivo com uma gravação ainda em voo", () => {
  it("não pendura a recusa do arquivo anterior sobre o arquivo novo", async () => {
    const { rendered, land } = await switchWhileWriting();

    // A recusa é do arquivo A, que já saiu da tela junto com o buffer sobre o
    // qual ela era. Parar o autosave de B seria parar o errado, e a barra
    // mostraria os números de A sobre o texto de B.
    await act(async () => {
      land(conflict());
    });

    expect(screen.queryByText("mudou no disco")).toBeNull();
    expect(screen.queryByRole("button", { name: /sobrescrever/ })).toBeNull();

    // E o autosave de B continua andando, que é a outra metade da mesma linha.
    typeInto(rendered.container, "?");
    await debounce();
    expect(trpcMock.files.write.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: OUTRO, text: "outro?" }),
    );
  });

  it("não usa a revisão do arquivo anterior como base do arquivo novo", async () => {
    const { rendered, land } = await switchWhileWriting();

    await act(async () => {
      land({ ok: true, revision: "sha256:deA" });
    });

    typeInto(rendered.container, "?");
    await debounce();

    // Com a revisão de A como base, a primeira gravação de B volta `stale` —
    // conflito inventado pelo cliente, no arquivo errado.
    expect(trpcMock.files.write.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: OUTRO, baseRevision: "sha256:doOutro", text: "outro?" }),
    );
  });
});

describe("o que a gravação recarrega, e o que ela não pode recarregar", () => {
  it("invalida as mudanças e o diretório do arquivo, e não o arquivo aberto", async () => {
    const { container, client } = await openTyping();
    client.setQueryData(changesKey("worktree", "wt_1", "worktree"), { files: [] });
    client.setQueryData(fileListKey("worktree", "wt_1", "src/lore"), { entries: [] });

    typeInto(container, "!");
    await debounce();
    await vi.waitFor(() => expect(screen.getByText(/^salvo há/)).toBeInTheDocument());

    expect(client.getQueryState(changesKey("worktree", "wt_1", "worktree"))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(fileListKey("worktree", "wt_1", "src/lore"))?.isInvalidated).toBe(
      true,
    );
    // F2.5: invalidar a leitura do arquivo aberto é o ciclo — o disco voltaria
    // por cima do que está sendo digitado. E o `isInvalidated` sozinho não diz
    // isso: uma releitura que termina limpa a marca, então o que prova é não
    // ter havido releitura nenhuma.
    expect(client.getQueryState(fileReadKey("worktree", "wt_1", FILE))?.isInvalidated).toBe(false);
    await settle(() => {});
    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);
  });
});

/*
 * D4, do lado que perde texto: nenhum gesto de navegação relê o arquivo por
 * cima de um buffer sujo. O botão de recarregar da coluna invalida `["files"]`,
 * e `fileListKey` e `fileReadKey` compartilham esse prefixo.
 */
describe("nenhum gesto de navegação apaga o que foi digitado", () => {
  it("sobrevive ao botão de recarregar da coluna", async () => {
    const { container, client } = await openTyping();
    typeInto(container, "!");

    await settle(() => client.invalidateQueries({ queryKey: ["files"] }));

    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);
    expect(shown(container)).toContain("const b = 2;!");
  });

  it("sobrevive a um worktree.changed durante a digitação", async () => {
    const { container, client } = await openTyping();
    typeInto(container, "!");

    await settle(() => {
      invalidateFor(client, { type: "worktree.changed", projectId: "p1" });
    });

    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);
    expect(shown(container)).toContain("const b = 2;!");
  });

  it("sobrevive à invalidação sem filtro que a reconexão dispara", async () => {
    // `useLiveState` refaz tudo a cada (re)conexão do stream de eventos: uma
    // invalidação sem `queryKey` nenhuma, que prefixo separado não alcança.
    const { container, client } = await openTyping();
    typeInto(container, "!");

    await settle(() => client.invalidateQueries());

    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);
    expect(shown(container)).toContain("const b = 2;!");
  });

  it("não pede o disco de volta quando a janela volta ao foco com texto por gravar", async () => {
    // Recusar a resposta já bastaria para o texto sobreviver; não perguntar é o
    // que a D4 pede — com buffer sujo não há refetch nenhum, nem um que volte
    // com o que já está na tela.
    const { container, client } = await openTyping();
    const read = fileReadKey("worktree", "wt_1", FILE);
    const before = client.getQueryState(read)?.dataUpdatedAt;

    typeInto(container, "!");
    await settle(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(client.getQueryState(read)?.dataUpdatedAt).toBe(before);
    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);
  });

  it("não deixa uma leitura já em voo pisar no que foi digitado depois dela", async () => {
    // A janela que sobra depois de fechar as outras: a leitura partiu com o
    // buffer limpo e volta com ele sujo. É a resposta que tem de ser recusada,
    // não só o pedido.
    const { container, client } = await openTyping();
    let land: (answer: unknown) => void = () => {};
    trpcMock.files.read.query.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );

    await settle(() => {
      void client.invalidateQueries({ queryKey: ["files"] });
    });
    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(2);

    typeInto(container, "!");
    await settle(() => {
      land(textFile({ text: "do disco", revision: "sha256:tres" }));
    });

    expect(shown(container)).toContain("const b = 2;!");
    expect(shown(container)).not.toContain("do disco");
  });

  it("deve o recarregar que recusou, e paga assim que não há mais o que perder", async () => {
    // Recusar a leitura não pode virar esquecê-la: quem clicou em recarregar
    // pediu o disco, e continua tendo direito a ele depois da gravação.
    const { container, client } = await openTyping();
    typeInto(container, "!");
    await settle(() => client.invalidateQueries({ queryKey: ["files"] }));
    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(1);

    trpcMock.files.read.query.mockResolvedValue(
      textFile({ text: "do disco", revision: "sha256:tres" }),
    );
    await debounce();
    await settle(() => {});

    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(2);
    expect(shown(container)).toContain("do disco");
  });

  it("adota o disco quando não há nada digitado para perder", async () => {
    // O outro lado da D4, e a prova de que a trava acima não é permanente.
    const { container, client } = await openTyping();
    trpcMock.files.read.query.mockResolvedValue(
      textFile({ text: "const c = 3;", revision: "sha256:tres" }),
    );

    await settle(() => client.invalidateQueries({ queryKey: ["files"] }));

    expect(trpcMock.files.read.query).toHaveBeenCalledTimes(2);
    expect(shown(container)).toContain("const c = 3;");
  });
});

/*
 * O conflito, medido em vez de adjetivado (F3.4).
 *
 * Um caso conhecido dos dois lados, usado por todo este bloco: o arquivo tem
 * dez linhas, você digita três no fim, e o agente troca duas linhas do meio por
 * seis. Os números na tela são "3 linhas que você digitou" e "+6 −2", e é isso
 * que separa medir de adjetivar.
 */
const BASE = ["um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const MINHAS = ["\nminha a", "minha b", "minha c"].join("\n");
const DO_AGENTE = [
  ...BASE.slice(0, 4),
  "do agente 1",
  "do agente 2",
  "do agente 3",
  "do agente 4",
  "do agente 5",
  "do agente 6",
  ...BASE.slice(6),
].join("\n");

/** Eight seconds ago, counted when the refusal is built — the clock is fake by then. */
function conflict(over: Record<string, unknown> = {}) {
  return {
    ok: false,
    reason: "stale",
    revision: "sha256:doDisco",
    changedAt: Date.now() - 8_000,
    ...over,
  };
}

/** Opens the ten-line file, types three lines, and takes the refusal. */
async function intoConflict(): Promise<Rendered> {
  trpcMock.files.read.query.mockResolvedValue(
    textFile({ text: BASE.join("\n"), bytes: 44, lines: 10 }),
  );
  // Built when the write happens and not when the mock is set up: the debounce
  // moves the fake clock 800 ms, and "há 8 s" has to be 8 and not 9.
  trpcMock.files.write.mutate.mockImplementation(() => Promise.resolve(conflict()));
  const rendered = await openTyping();

  typeInto(rendered.container, MINHAS);
  // O disco é buscado ao receber o `stale`: é a terceira versão, e o cliente é
  // o único lado que tem as três.
  trpcMock.files.read.query.mockResolvedValue(
    textFile({ text: DO_AGENTE, revision: "sha256:doDisco", bytes: 80, lines: 14 }),
  );
  await debounce();
  await settle(() => {});
  return rendered;
}

/**
 * A mesma recusa, com a leitura que mede o outro lado falhando.
 *
 * Alcançável de dois jeitos, e um deles nem passa pelo `catch`: o agente troca
 * o arquivo por um acima do teto ou com byte NUL entre a leitura e a recusa, e
 * a resposta volta sem texto nenhum para comparar.
 */
async function intoConflictWithoutDisk(): Promise<Rendered> {
  trpcMock.files.read.query.mockResolvedValue(
    textFile({ text: BASE.join("\n"), bytes: 44, lines: 10 }),
  );
  trpcMock.files.write.mutate.mockImplementation(() => Promise.resolve(conflict()));
  const rendered = await openTyping();

  typeInto(rendered.container, MINHAS);
  trpcMock.files.read.query.mockRejectedValue(new Error("ENOENT: no such file or directory"));
  await debounce();
  await settle(() => {});
  return rendered;
}

describe("o conflito na tela", () => {
  it("mantém as duas saídas quando o disco não chega, e só o custo do agente fica sem número", async () => {
    // A tela estava ao contrário: o botão de preço conhecido era o proibido, e
    // o que age às cegas, o permitido. `recarregar do disco` custa `base`
    // contra o buffer, e os dois estão na mão com disco ou sem ele.
    await intoConflictWithoutDisk();

    const reload = screen.getByRole("button", { name: /recarregar do disco/ });
    expect(reload).toBeEnabled();
    expect(reload).toHaveTextContent("perde as 3 linhas que você digitou");

    const overwrite = screen.getByRole("button", { name: /sobrescrever/ });
    expect(overwrite).toBeEnabled();
    expect(overwrite).toHaveTextContent("perde a edição do agente");
    expect(overwrite).not.toHaveTextContent("+");
  });

  it("recarrega pelo caminho normal quando o disco não chegou", async () => {
    const { container } = await intoConflictWithoutDisk();
    trpcMock.files.read.query.mockResolvedValue(
      textFile({ text: DO_AGENTE, revision: "sha256:doDisco", bytes: 80, lines: 14 }),
    );
    trpcMock.files.write.mutate.mockResolvedValue({ ok: true, revision: "sha256:depois" });

    await settle(() => {
      fireEvent.click(screen.getByRole("button", { name: /recarregar do disco/ }));
    });

    // Com o buffer marcado limpo, a leitura deixa de ser recusada pela D4 e a
    // adoção põe o disco na tela — o mesmo caminho de uma mudança externa que
    // ninguém estava disputando.
    expect(shown(container)).toContain("do agente 1");
    expect(shown(container)).not.toContain("minha c");
    expect(screen.queryByRole("button", { name: /sobrescrever/ })).toBeNull();

    typeInto(container, "!");
    await debounce();
    expect(trpcMock.files.write.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseRevision: "sha256:doDisco", text: `${DO_AGENTE}!` }),
    );
  });

  it("não regrava o disco por cima dele mesmo depois de recarregar", async () => {
    // Recarregar deixa o buffer igual ao disco, e um buffer que ainda se diz
    // sujo manda tudo de volta no primeiro gatilho de descarregamento.
    const { container, unmount } = await intoConflict();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /recarregar do disco/ }));
    });
    const before = trpcMock.files.write.mutate.mock.calls.length;
    expect(shown(container)).toContain("do agente 1");

    await act(async () => {
      unmount();
    });

    expect(trpcMock.files.write.mutate).toHaveBeenCalledTimes(before);
  });

  it("põe as duas saídas nomeadas pelo que perdem, e nenhuma em destaque", async () => {
    await intoConflict();

    const reload = screen.getByRole("button", { name: /recarregar do disco/ });
    const overwrite = screen.getByRole("button", { name: /sobrescrever/ });
    // D3.1: escolher por conta própria seria escolher de quem é o trabalho
    // descartável. O que separa as duas é o custo em texto, não o peso visual.
    expect(reload.className).toBe(overwrite.className);
    expect(document.activeElement).not.toBe(reload);
    expect(document.activeElement).not.toBe(overwrite);
  });

  it("mede os dois custos, e os dois números batem com a edição de cada lado", async () => {
    await intoConflict();

    expect(
      screen.getByRole("button", { name: /recarregar do disco/ }),
    ).toHaveTextContent("perde as 3 linhas que você digitou");
    expect(screen.getByRole("button", { name: /sobrescrever/ })).toHaveTextContent(
      "perde a edição do agente (+6 −2)",
    );
  });

  it("diz há quanto tempo o agente escreveu, pelo changedAt do daemon", async () => {
    // Do `stat` do daemon (E4), não do relógio do cliente: o cliente não sabe
    // quando o arquivo mudou, sabe quando a recusa chegou.
    await intoConflict();

    expect(screen.getByText(/o agente escreveu este arquivo há 8 s/)).toBeInTheDocument();
  });

  it("deixa o texto digitado na tela — ele é o único lugar onde aquele trabalho existe", async () => {
    const { container } = await intoConflict();

    expect(shown(container)).toContain("minha c");
  });

  it("recontabiliza o custo enquanto se continua digitando", async () => {
    // Número congelado no instante da recusa é adjetivo com cara de medida.
    const { container } = await intoConflict();

    typeInto(container, "\nminha d");

    expect(
      screen.getByRole("button", { name: /recarregar do disco/ }),
    ).toHaveTextContent("perde as 4 linhas que você digitou");
  });

  it("recarrega do disco, e o autosave volta a andar contra a revisão nova", async () => {
    const { container } = await intoConflict();
    trpcMock.files.write.mutate.mockResolvedValue({ ok: true, revision: "sha256:depois" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /recarregar do disco/ }));
    });

    expect(shown(container)).toContain("do agente 1");
    expect(shown(container)).not.toContain("minha c");
    expect(screen.queryByRole("button", { name: /sobrescrever/ })).toBeNull();

    typeInto(container, "!");
    await debounce();

    expect(trpcMock.files.write.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseRevision: "sha256:doDisco", text: `${DO_AGENTE}!` }),
    );
  });

  it("sobrescreve com a revisão que veio na recusa, e passa", async () => {
    const { container } = await intoConflict();
    trpcMock.files.write.mutate.mockResolvedValue({ ok: true, revision: "sha256:meu" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sobrescrever/ }));
    });

    // É o caso que a E7 provou no servidor: a revisão do disco veio na própria
    // recusa justamente para não haver uma segunda leitura antes de gravar.
    expect(trpcMock.files.write.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseRevision: "sha256:doDisco",
        text: `${BASE.join("\n")}${MINHAS}`,
      }),
    );
    expect(shown(container)).toContain("minha c");
    expect(screen.queryByRole("button", { name: /recarregar do disco/ })).toBeNull();
    expect(screen.getByText(/^salvo há/)).toBeInTheDocument();
  });

  it("volta a parar se o agente escrever de novo no meio da escolha", async () => {
    await intoConflict();
    trpcMock.files.write.mutate.mockResolvedValue(conflict({ revision: "sha256:outra" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sobrescrever/ }));
    });

    expect(screen.getByRole("button", { name: /sobrescrever/ })).toBeInTheDocument();
    expect(screen.getByText("mudou no disco")).toBeInTheDocument();
  });
});

describe("lineDelta", () => {
  it("conta a troca de duas linhas por seis como +6 −2", () => {
    expect(lineDelta(BASE.join("\n"), DO_AGENTE)).toEqual({ added: 6, removed: 2 });
  });

  it("conta o que só foi acrescentado sem inventar remoções", () => {
    expect(lineDelta("a\nb", "a\nb\nc\nd")).toEqual({ added: 2, removed: 0 });
  });

  it("conta o que só foi apagado", () => {
    expect(lineDelta("a\nb\nc", "a\nc")).toEqual({ added: 0, removed: 1 });
  });

  it("não conta nada para dois textos iguais", () => {
    expect(lineDelta("a\nb\n", "a\nb\n")).toEqual({ added: 0, removed: 0 });
  });

  it("não inventa remoção quando a linha acrescentada é igual à que já estava", () => {
    // A fronteira do laço de sufixo: contar a mesma linha nas duas pontas faz
    // `removed` virar −1, e a tela imprime "perde as −1 linhas que você
    // apagou" numa tela cujo assunto é perder trabalho.
    expect(lineDelta("a", "a\na")).toEqual({ added: 1, removed: 0 });
  });

  it("mede a região que difere, e diz isso ao contar duas mudanças distantes", () => {
    // Prefixo e sufixo comuns, e o miolo inteiro no meio: para uma edição
    // contígua — o caso do agente — os números são exatos, e para duas
    // separadas eles são o tamanho do trecho que as contém. É um piso do
    // estrago, nunca um teto, que é a direção segura numa tela de perda.
    expect(lineDelta("a\nb\nc\nd\ne", "a\nB\nc\nD\ne")).toEqual({ added: 3, removed: 3 });
  });
});
