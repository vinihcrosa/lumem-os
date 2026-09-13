import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { secretsRouter } from "./secrets.js";

/**
 * A porta das credenciais (ADR de 2026-09-13).
 *
 * O que este arquivo cobra é uma ausência: **não existe caminho que devolva o
 * valor**. É o tipo de propriedade que some num refactor bem-intencionado — e
 * que, quando some, ninguém percebe até ela estar num log de alguém.
 */

let context: TestCaller;

function caller(): TestCaller {
  context = createTestCaller();
  return context;
}

afterEach(async () => {
  await context?.cleanup();
});

describe("nada devolve valor", () => {
  it("a listagem responde presença", async () => {
    const { api } = caller();

    expect(await api.secrets.list()).toEqual([
      expect.objectContaining({ id: "linear", present: false }) as unknown,
    ]);
  });

  it("gravar responde presença, e não o que foi gravado", async () => {
    const { api } = caller();

    const saved = await api.secrets.set({ id: "linear", value: "lin_api_segredo" });

    /*
     * Quem acabou de mandar o valor já o tem, então devolvê-lo não informa nada
     * e põe o segredo numa resposta HTTP a mais.
     */
    expect(saved).toEqual({ id: "linear", present: true });
    expect(JSON.stringify(saved)).not.toContain("lin_api_segredo");
  });

  it("depois de gravar, a listagem continua sem o valor", async () => {
    const { api } = caller();
    await api.secrets.set({ id: "linear", value: "lin_api_segredo" });

    const listed = await api.secrets.list();

    expect(JSON.stringify(listed)).not.toContain("lin_api_segredo");
    expect(listed[0]).toMatchObject({ present: true });
  });

  it("o router não expõe nenhuma procedure de leitura de valor", () => {
    /*
     * A ausência **é** a decisão: se existisse uma, bastaria alguém chamá-la.
     *
     * E o teste afirma **a lista inteira** em vez de conferir que uma não está
     * lá — o segundo passaria calado no dia em que alguém acrescentasse
     * `reveal`, que é exatamente o dia em que ele deveria falhar.
     *
     * Lido do router e não do chamador: o chamador é um `Proxy`, e
     * `Object.keys` nele devolve vazio — o que faria este teste passar sem
     * olhar nada.
     */
    expect(Object.keys(secretsRouter._def.procedures).sort()).toEqual(["list", "set"]);
  });
});

describe("guardar e apagar são o mesmo gesto", () => {
  it("valor vazio apaga", async () => {
    const { api } = caller();
    await api.secrets.set({ id: "linear", value: "lin_api_segredo" });

    const cleared = await api.secrets.set({ id: "linear", value: "" });

    // Rotação na v1 é apagar e pôr outra, e um botão *"remover"* separado seria
    // um segundo caminho para o mesmo estado.
    expect(cleared.present).toBe(false);
  });
});

describe("o catálogo é fechado", () => {
  it("um serviço que o produto não sabe guardar é recusado", async () => {
    const { api } = caller();

    /*
     * Texto livre viraria uma credencial que nada lê, guardada para sempre — e
     * quem a pôs acharia que configurou alguma coisa.
     */
    await expect(
      api.secrets.set({ id: "inventado" as "linear", value: "x" }),
    ).rejects.toThrow();
  });
});
