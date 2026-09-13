import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTrpcDefaults, trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", () => ({ trpc: trpcMock }));

import { Credentials } from "./Credentials.js";

/**
 * As credenciais no rodapé (ADR de 2026-09-13).
 *
 * O que este arquivo cobra é a promessa que a tela faz: **o valor nunca volta**.
 * O campo nasce vazio mesmo com chave guardada, porque o daemon não tem
 * procedure que a devolva — e desenhar um campo preenchido pediria uma.
 */

const mock = trpcMock;

const slot = (present: boolean) => [
  { id: "linear", label: "Linear", hint: "chave de API pessoal", present },
];

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Credentials />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a linha diz se há chave, e nada além disso", () => {
  it("guardada", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(true));

    renderFooter();

    expect(await screen.findByText("guardada")).toBeInTheDocument();
  });

  it("sem chave", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));

    renderFooter();

    expect(await screen.findByText("sem chave")).toBeInTheDocument();
  });

  it("sem serviço nenhum, o bloco não existe", async () => {
    mock.secrets.list.query.mockResolvedValue([]);

    renderFooter();

    /*
     * E nenhum esqueleto enquanto carrega: o rodapé é a última coisa da
     * sidebar, e um esqueleto piscando ali chama mais atenção que a informação
     * que ele substitui.
     */
    await waitFor(() => {
      expect(screen.queryByText("Credenciais")).toBeNull();
    });
  });

  it("não existe `＋` — o catálogo é fechado", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));

    renderFooter();
    await screen.findByText("Credenciais");

    /*
     * Um `＋` prometeria acrescentar um serviço, e produziria uma credencial que
     * nada lê, guardada para sempre, com quem a pôs achando que configurou
     * alguma coisa.
     */
    expect(screen.queryByText("＋")).toBeNull();
  });
});

describe("o diálogo nunca mostra o valor", () => {
  it("o campo nasce vazio mesmo com chave guardada", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(true));

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));

    const field = await screen.findByLabelText("chave de API");
    // O daemon não tem procedure que devolva credencial, e essa ausência é a
    // decisão: um campo preenchido pediria uma.
    expect((field as HTMLInputElement).value).toBe("");
    expect(field).toHaveAttribute("type", "password");
  });

  it("a frase diz o que o produto faz com a chave", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));

    expect(await screen.findByText(/nunca a mostra de volta/)).toBeInTheDocument();
  });

  it("`guardar` fica desabilitado enquanto não há o que guardar", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));

    expect(await screen.findByRole("button", { name: "guardar" })).toBeDisabled();
  });

  it("guardar manda o valor e fecha", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));
    mock.secrets.set.mutate.mockResolvedValue({ id: "linear", present: true });

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));
    fireEvent.change(await screen.findByLabelText("chave de API"), {
      target: { value: "lin_api_segredo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "guardar" }));

    await waitFor(() => {
      expect(mock.secrets.set.mutate).toHaveBeenCalledWith({
        id: "linear",
        value: "lin_api_segredo",
      });
    });
  });
});

describe("remover", () => {
  it("só aparece quando há o que remover", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(false));

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));

    // Um botão que não faz nada ensina que os outros também não fazem.
    expect(screen.queryByRole("button", { name: "remover" })).toBeNull();
  });

  it("manda valor vazio, que é como o cofre apaga", async () => {
    mock.secrets.list.query.mockResolvedValue(slot(true));
    mock.secrets.set.mutate.mockResolvedValue({ id: "linear", present: false });

    renderFooter();
    fireEvent.click(await screen.findByText("Linear"));
    fireEvent.click(await screen.findByRole("button", { name: "remover" }));

    // Guardar e apagar são o mesmo gesto: rotação na v1 é apagar e pôr outra,
    // e um caminho próprio seria um segundo jeito de chegar no mesmo estado.
    await waitFor(() => {
      expect(mock.secrets.set.mutate).toHaveBeenCalledWith({ id: "linear", value: "" });
    });
  });
});
