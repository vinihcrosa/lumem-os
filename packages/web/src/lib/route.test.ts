import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { navigate, routeOf, useRoute } from "./route.js";

/**
 * O roteamento, e o que jsdom consegue provar dele.
 *
 * **jsdom tem `history`**, então estes casos são reais: `pushState`,
 * `replaceState` e `popstate` funcionam de verdade aqui. O que ele **não** tem é
 * barra de endereço e `F5` — e é por isso que a T15 existe. Um teste de
 * componente passa contra um roteador que nunca sobreviveu a um reload.
 */
describe("routeOf", () => {
  it("lê as três telas", () => {
    expect(routeOf("/")).toBe("home");
    expect(routeOf("/tasks")).toBe("tasks");
    expect(routeOf("/settings")).toBe("settings");
  });

  it("trata a barra final como o mesmo lugar", () => {
    expect(routeOf("/tasks/")).toBe("tasks");
    expect(routeOf("/settings/")).toBe("settings");
  });

  it("ignora busca e fragmento", () => {
    expect(routeOf("/settings?x=1")).toBe("settings");
    expect(routeOf("/tasks#topo")).toBe("tasks");
  });

  /*
   * A mesma escolha que o daemon já fez ao servir o shell para qualquer caminho:
   * endereço desconhecido abre o aplicativo. Uma página de erro seria uma tela
   * que o produto não tem.
   */
  it("qualquer outro caminho é a tela inicial", () => {
    expect(routeOf("/qualquer/rota/da/aplicacao")).toBe("home");
    expect(routeOf("/styleguide")).toBe("home");
  });
});

describe("navigate", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("empilha por padrão, e o caminho muda", () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("home");

    act(() => navigate("settings"));

    expect(window.location.pathname).toBe("/settings");
    expect(result.current).toBe("settings");
  });

  /*
   * O caso que o `pushState` sozinho não cobre: ele não dispara `popstate`, e
   * sem o evento próprio a barra de endereço mudaria com a tela parada.
   */
  it("avisa quem está lendo, sem depender de popstate", () => {
    const { result } = renderHook(() => useRoute());

    act(() => navigate("tasks"));
    expect(result.current).toBe("tasks");

    act(() => navigate("home"));
    expect(result.current).toBe("home");
  });

  it("com replace, não cria entrada no histórico", () => {
    const before = window.history.length;

    act(() => navigate("settings", { replace: true }));

    expect(window.location.pathname).toBe("/settings");
    expect(window.history.length).toBe(before);
  });

  it("empilhar cria entrada, que é a diferença entre os dois", () => {
    const before = window.history.length;

    act(() => navigate("tasks"));

    expect(window.history.length).toBe(before + 1);
  });

  /*
   * Navegar para onde já se está não é navegação: sem isto, clicar duas vezes na
   * mesma linha da sidebar empilha uma entrada que só desfaz a si mesma.
   */
  it("ir para o mesmo lugar não mexe no histórico", () => {
    act(() => navigate("settings"));
    const after = window.history.length;

    act(() => navigate("settings"));

    expect(window.history.length).toBe(after);
  });

  it("o primeiro render lê o caminho, e não a tela inicial", () => {
    window.history.replaceState(null, "", "/settings");

    const { result } = renderHook(() => useRoute());

    expect(result.current).toBe("settings");
  });
});
